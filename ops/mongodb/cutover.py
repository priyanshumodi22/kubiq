"""Controlled cutover phases. No passwords or tokens are printed."""
import datetime,hashlib,json,os,pathlib,subprocess,sys,time
S=pathlib.Path('/var/lib/kubiq-mongodb');S.mkdir(mode=0o700,parents=True,exist_ok=True)
def kub(*args):
 r=subprocess.run(['k3s','kubectl',*args],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('kubectl failed: '+args[0])
 return r.stdout
def patch(kind,name,ns,payload,typ='merge'):return kub('patch',kind,name,'-n',ns,'--type='+typ,'-p',json.dumps(payload))
def tools(*args):return kub('exec','-n','mongodb-system','mongodb-migration','--',*args)
def ttl(action):tools('env','HOME=/work','MONGODB_ACTION='+action,'mongosh','--nodb','--norc','--quiet','/work/operations/admin-control.js')
mode=sys.argv[1]
if (S/'cutover-complete.json').exists():raise RuntimeError('Initial migration already completed; do not replay destructive restore phases')
if mode=='freeze':
 live=json.loads(kub('exec','-n','kubiq-system','deployment/kubiq','--','node','-e',"console.log(JSON.stringify({atlas:process.env.DB_URI.startsWith('mongodb+srv://')}))"));assert live['atlas']
 dep=json.loads(kub('get','deployment','kubiq','-n','kubiq-system','-o','json'));svc=json.loads(kub('get','service','kubiq','-n','kubiq-system','-o','json'));secret=json.loads(kub('get','secret','kubiq-runtime','-n','kubiq-system','-o','json'))
 before={'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'image':dep['spec']['template']['spec']['containers'][0]['image'],'replicas':dep['spec']['replicas'],'serviceSelector':svc['spec']['selector'],'runtimeSecretSha256':hashlib.sha256(json.dumps(secret['data'],sort_keys=True).encode()).hexdigest()}
 (S/'cutover-before.json').write_text(json.dumps(before,indent=2))
 subprocess.run(['systemctl','stop','kubiq-mongodb-backup.timer'],check=True)
 patch('kustomization','kubiq','flux-system',{'spec':{'suspend':True}})
 selector={**before['serviceSelector'],'maintenance.priyanshumodi.in/active':'blocked'}
 patch('service','kubiq','kubiq-system',[{'op':'replace','path':'/spec/selector','value':selector}],'json')
 # Stop new Service traffic and allow five ingestion-buffer flush intervals before SIGTERM.
 time.sleep(10)
 kub('scale','deployment/kubiq','-n','kubiq-system','--replicas=0')
 kub('wait','pod','-n','kubiq-system','-l','app.kubernetes.io/name=kubiq','--for=delete','--timeout=60s')
 print('kubiq writes paused; tunnel, MongoDB and other apps remain running')
elif mode=='dump':
 assert json.loads(kub('get','deployment','kubiq','-n','kubiq-system','-o','json'))['spec']['replicas']==0
 tools('env','HOME=/work','mongosh','--nodb','--norc','--quiet','/work/operations/make-configs.js')
 tools('bash','-ec','mongodump --config=/work/source.yml --db=kubiq --out=/work/source --numParallelCollections=1 >/work/final-source-dump.log 2>&1')
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ');file=pathlib.Path('/var/backups/kubiq-mongodb')/('atlas-final-'+stamp+'.tar.gz')
 with file.open('wb') as out:
  os.chmod(file,0o600);subprocess.run(['k3s','kubectl','exec','-n','mongodb-system','mongodb-migration','--','tar','-C','/work','-czf','-','source'],stdout=out,check=True)
 raw=subprocess.check_output(['/usr/bin/python3','/opt/kubiq-mongodb/upload.py',str(file),'migration/'+file.name],text=True)
 report=json.loads(raw);assert report['readbackVerified'];(S/'final-atlas-backup.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
elif mode=='restore':
 assert json.loads(kub('get','deployment','kubiq','-n','kubiq-system','-o','json'))['spec']['replicas']==0
 assert json.loads((S/'final-atlas-backup.json').read_text())['readbackVerified']
 try:
  ttl('pause-ttl')
  tools('bash','-ec',"mongorestore --config=/work/target.yml --dir=/work/source --nsInclude='kubiq.*' --drop --stopOnError --numParallelCollections=1 --numInsertionWorkersPerCollection=1 >/work/final-restore.log 2>&1")
  tools('bash','-ec','mongodump --config=/work/target.yml --db=kubiq --out=/work/restored --numParallelCollections=1 >/work/final-target-dump.log 2>&1')
  raw=tools('env','HOME=/work','mongosh','--nodb','--norc','--quiet','/work/operations/verify-rehearsal.js');report=json.loads(raw.splitlines()[-1]);assert report['passed']
  report['rehearsal']=False;report['finalCopy']=True;(S/'final-copy-verification.json').write_text(json.dumps(report,indent=2))
  auth=json.loads(tools('env','HOME=/work','mongosh','--nodb','--norc','--quiet','/work/operations/auth-check.js').splitlines()[-1]);assert all(auth.values());print(json.dumps({'finalCopyVerified':True,'documents':report['totalDocuments'],'collections':len(report['collections']),'authenticationPassed':True}))
 finally:ttl('resume-ttl')
else:raise ValueError('Unknown phase')
