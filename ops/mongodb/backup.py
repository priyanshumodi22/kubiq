"""On-VM backup runner: private GCS archive, hash readback, no credentials in argv."""
import datetime,fcntl,gzip,hashlib,json,os,pathlib,shutil,subprocess,time
IMAGE='mongo:8.0.34@sha256:4a4ab5d4834207389e0d7270fac988e21ffedccecba77991a552f755df229907'
os.environ['CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE']='/etc/kubiq-mongodb/backup-service-account.json'
os.environ['CLOUDSDK_CONFIG']='/var/lib/kubiq-mongodb/gcloud'
NS='mongodb-system';POD='mongodb-backup';BUCKET='gs://priyanshu-apps-sonarqube-backups/kubiq-mongodb/backups'
def run(args,**kw):
 r=subprocess.run(args,capture_output=True,text=True,**kw)
 if r.returncode:raise RuntimeError('Backup operation failed: '+args[0]+' '+args[1])
 return r.stdout
def kub(*args,**kw):return run(['k3s','kubectl',*args],**kw)
lock=open('/run/kubiq-mongodb-backup.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
root=pathlib.Path('/var/backups/kubiq-mongodb');root.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(root,0o700)
if shutil.disk_usage(root).free<2*1024**3:raise RuntimeError('Less than 2 GiB disk headroom; backup not started')
now=datetime.datetime.now(datetime.timezone.utc);stamp=now.strftime('%Y%m%dT%H%M%SZ');file=root/(stamp+'.archive.gz')
command="umask 077; mongosh --nodb --norc --quiet /ops/make-configs.js >/work/config.log 2>&1; mongodump --config=/work/backup.yml --db=kubiq --archive=/work/kubiq.archive.gz --gzip --numParallelCollections=1 >/work/dump.log 2>&1; touch /work/success; sleep 1800"
pod={'apiVersion':'v1','kind':'Pod','metadata':{'name':POD,'namespace':NS,'labels':{'app.kubernetes.io/component':'mongodb-ops'}},'spec':{'automountServiceAccountToken':False,'restartPolicy':'Never','activeDeadlineSeconds':2100,'securityContext':{'runAsUser':999,'runAsGroup':999,'fsGroup':999,'seccompProfile':{'type':'RuntimeDefault'}},'containers':[{'name':'backup','image':IMAGE,'command':['bash','-ec',command],'env':[{'name':'HOME','value':'/work'},{'name':'BACKUP_URI','valueFrom':{'secretKeyRef':{'name':'mongodb-backup','key':'DB_URI'}}}],'resources':{'requests':{'cpu':'10m','memory':'32Mi'},'limits':{'cpu':'250m','memory':'256Mi'}},'securityContext':{'allowPrivilegeEscalation':False,'readOnlyRootFilesystem':True,'capabilities':{'drop':['ALL']}},'volumeMounts':[{'name':'work','mountPath':'/work'},{'name':'ops','mountPath':'/ops','readOnly':True},{'name':'tmp','mountPath':'/tmp'}]}],'volumes':[{'name':'work','emptyDir':{'sizeLimit':'512Mi'}},{'name':'ops','configMap':{'name':'mongodb-backup-config'}},{'name':'tmp','emptyDir':{'sizeLimit':'64Mi'}}]}}
kub('delete','pod',POD,'-n',NS,'--ignore-not-found','--wait=true','--timeout=90s')
try:
 kub('create','-f','-',input=json.dumps(pod));kub('wait','pod/'+POD,'-n',NS,'--for=condition=Ready','--timeout=180s')
 deadline=time.time()+300
 while True:
  r=subprocess.run(['k3s','kubectl','exec','-n',NS,POD,'--','test','-f','/work/success'],capture_output=True)
  if r.returncode==0:break
  if time.time()>deadline:raise RuntimeError('Backup timed out')
  time.sleep(3)
 with file.open('wb') as out:
  os.chmod(file,0o600);r=subprocess.run(['k3s','kubectl','exec','-n',NS,POD,'--','cat','/work/kubiq.archive.gz'],stdout=out,stderr=subprocess.PIPE)
  if r.returncode:raise RuntimeError('Backup download failed')
 with gzip.open(file,'rb') as f:
  while f.read(1024*1024):pass
 uploaded=json.loads(run(['/usr/bin/python3','/opt/kubiq-mongodb/upload.py',str(file),'backups/'+file.name]))
 digest=uploaded['sha256'];uri=uploaded['archive']
 state=pathlib.Path('/var/lib/kubiq-mongodb');state.mkdir(mode=0o700,parents=True,exist_ok=True)
 report={'completedAt':now.isoformat(),'database':'kubiq','archive':uri,'sha256':digest,'bytes':file.stat().st_size,'readbackVerified':True,'offVmRetentionDays':30,'restoreTested':False}
 (state/'last-backup.json').write_text(json.dumps(report,indent=2));os.chmod(state/'last-backup.json',0o600)
 for older in root.glob('*.archive.gz'):
  if older.stat().st_mtime<time.time()-2*86400:older.unlink()
 print(json.dumps(report))
finally:
 kub('delete','pod',POD,'-n',NS,'--ignore-not-found','--wait=false')
