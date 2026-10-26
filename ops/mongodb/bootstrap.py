"""Run with sudo on the k3s VM. Credentials never enter Git or stdout."""
import base64,json,os,pathlib,secrets,subprocess
from urllib.parse import quote
ROOT=pathlib.Path('/etc/kubiq-mongodb');ROOT.mkdir(mode=0o700,parents=True,exist_ok=True);os.chmod(ROOT,0o700)
def kub(*args,payload=None):
 r=subprocess.run(['k3s','kubectl',*args],input=json.dumps(payload) if payload else None,text=True,capture_output=True)
 if r.returncode:raise RuntimeError('kubectl operation failed: '+args[0])
 return r.stdout
path=ROOT/'credentials.json'
if path.exists():c=json.loads(path.read_text())
else:
 c={k:secrets.token_urlsafe(36) for k in ['adminPassword','appPassword','backupPassword']}
 c.update({'adminUsername':'kubiq_admin','appUsername':'kubiq_app','backupUsername':'kubiq_backup','database':'kubiq','host':'mongodb.mongodb-system.svc.cluster.local'})
 def uri(user,pwd,auth):return f'mongodb://{quote(user)}:{quote(pwd)}@{c["host"]}:27017/kubiq?authSource={auth}&retryWrites=false&maxPoolSize=10&directConnection=true'
 c['appUri']=uri(c['appUsername'],c['appPassword'],'kubiq');c['adminUri']=uri(c['adminUsername'],c['adminPassword'],'admin');c['backupUri']=uri(c['backupUsername'],c['backupPassword'],'admin')
 path.write_text(json.dumps(c,indent=2));os.chmod(path,0o600)
ns={'apiVersion':'v1','kind':'Namespace','metadata':{'name':'mongodb-system','labels':{'app.kubernetes.io/part-of':'kubiq'}}}
kub('apply','-f','-',payload=ns)
def secret(name,namespace,values):
 kub('apply','-f','-',payload={'apiVersion':'v1','kind':'Secret','metadata':{'name':name,'namespace':namespace},'type':'Opaque','data':{k:base64.b64encode(v.encode()).decode() for k,v in values.items()}})
secret('mongodb-bootstrap','mongodb-system',{'MONGO_INITDB_ROOT_USERNAME':c['adminUsername'],'MONGO_INITDB_ROOT_PASSWORD':c['adminPassword'],'MONGO_INITDB_DATABASE':'kubiq','MONGODB_APP_USERNAME':c['appUsername'],'MONGODB_APP_PASSWORD':c['appPassword'],'MONGODB_BACKUP_USERNAME':c['backupUsername'],'MONGODB_BACKUP_PASSWORD':c['backupPassword']})
secret('mongodb-admin','mongodb-system',{'DB_URI':c['adminUri']})
secret('mongodb-backup','mongodb-system',{'DB_URI':c['backupUri']})
secret('mongodb-app','mongodb-system',{'DB_URI':c['appUri']})
secret('kubiq-mongodb','kubiq-system',{'DB_URI':c['appUri']})
# Temporary migration source; production kubiq-runtime is never modified here.
source=json.loads(kub('get','secret','kubiq-runtime','-n','kubiq-system','-o','json'))
source_uri=base64.b64decode(source['data']['DB_URI']).decode()
secret('mongodb-migration-source','mongodb-system',{'DB_URI':source_uri})
print('Private MongoDB accounts and migration secrets prepared; live kubiq URI unchanged')
