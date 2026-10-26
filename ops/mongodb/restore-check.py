"""Restore the off-VM backup into a disposable DB; never overwrites kubiq."""
import hashlib,json,os,pathlib,subprocess,urllib.parse,urllib.request
os.environ['CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE']='/etc/kubiq-mongodb/backup-service-account.json'
os.environ['CLOUDSDK_CONFIG']='/var/lib/kubiq-mongodb/gcloud'
STATE=pathlib.Path('/var/lib/kubiq-mongodb');report=json.loads((STATE/'last-backup.json').read_text())
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
u=urllib.parse.urlparse(report['archive']);name=u.path.lstrip('/')
assert u.netloc=='priyanshu-apps-sonarqube-backups' and name.startswith('kubiq-mongodb/backups/')
file=pathlib.Path('/var/backups/kubiq-mongodb/restorecheck.archive.gz');h=hashlib.sha256()
url='https://storage.googleapis.com/storage/v1/b/'+u.netloc+'/o/'+urllib.parse.quote(name,safe='')+'?alt=media'
with file.open('wb') as out:
 os.chmod(file,0o600)
 with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token}),timeout=120) as source:
  while chunk:=source.read(65536):h.update(chunk);out.write(chunk)
assert h.hexdigest()==report['sha256'],'Off-VM restore archive mismatch'
base=['k3s','kubectl','exec','-n','mongodb-system','mongodb-migration']
def run(*args,input=None):
 r=subprocess.run(base+list(args),input=input,capture_output=True)
 if r.returncode:raise RuntimeError('Restore check operation failed')
 return r.stdout
with file.open('rb') as stream:run('-i','--','tee','/work/backup-readback.archive.gz',input=stream.read())
def ttl(action):run('--','env','HOME=/work','MONGODB_ACTION='+action,'mongosh','--nodb','--norc','--quiet','/work/operations/admin-control.js')
db='kubiq_restorecheck_20261027'
try:
 ttl('pause-ttl')
 run('--','bash','-ec',"mongorestore --config=/work/target.yml --archive=/work/backup-readback.archive.gz --gzip --nsInclude='kubiq.*' --nsFrom='kubiq.*' --nsTo='"+db+".*' --stopOnError --numParallelCollections=1 --numInsertionWorkersPerCollection=1 >/work/backup-restore.log 2>&1")
 run('--','bash','-ec','mongodump --config=/work/target.yml --db='+db+' --out=/work/restorecheck --numParallelCollections=1 >/work/restorecheck-dump.log 2>&1')
 raw=run('--','env','HOME=/work','VERIFY_KIND=backup-restore','VERIFY_TARGET_DIR=/work/restorecheck/'+db,'VERIFY_REPORT=/work/backup-restore-verification.json','mongosh','--nodb','--norc','--quiet','/work/operations/verify-rehearsal.js')
 details=json.loads(raw.decode().splitlines()[-1]);assert details['passed'] is True
 (STATE/'restore-verification.json').write_text(json.dumps(details,indent=2))
 report.update({'restoreTested':True,'restoredFromGcs':True,'restoredDocuments':details['totalDocuments']})
finally:
 code="const c=new Mongo(process.env.TARGET_URI);c.getDB('"+db+"').dropDatabase();if(c.getDB('admin').runCommand({listDatabases:1,nameOnly:true}).databases.some(d=>d.name==='"+db+"'))throw Error('Restore fixture remained');print('Restore fixture removed');"
 run('-i','--','tee','/work/drop-restore-check.js',input=code.encode())
 run('--','env','HOME=/work','mongosh','--nodb','--norc','--quiet','/work/drop-restore-check.js')
 ttl('resume-ttl')
report['restoreFixtureRemoved']=True;(STATE/'last-backup.json').write_text(json.dumps(report,indent=2));file.unlink()
print(json.dumps(report))
