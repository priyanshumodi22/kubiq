"""Upload/read back a known object without bucket-list permissions."""
import hashlib,http.client,json,os,pathlib,subprocess,sys,urllib.parse,urllib.request
os.environ['CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE']='/etc/kubiq-mongodb/backup-service-account.json'
os.environ['CLOUDSDK_CONFIG']='/var/lib/kubiq-mongodb/gcloud'
file=pathlib.Path(sys.argv[1]);relative=sys.argv[2]
if not relative.startswith(('backups/','migration/')) or '..' in relative.split('/'):raise ValueError('Invalid backup object prefix')
bucket='priyanshu-apps-sonarqube-backups';name='kubiq-mongodb/'+relative
r=subprocess.run(['gcloud','auth','print-access-token'],capture_output=True,text=True,check=True);token=r.stdout.strip()
query=urllib.parse.urlencode({'uploadType':'media','name':name,'ifGenerationMatch':'0'})
conn=http.client.HTTPSConnection('storage.googleapis.com',timeout=120)
with file.open('rb') as data:
 conn.request('POST','/upload/storage/v1/b/'+bucket+'/o?'+query,body=data,headers={'Authorization':'Bearer '+token,'Content-Type':'application/octet-stream','Content-Length':str(file.stat().st_size)})
 response=conn.getresponse();payload=response.read()
 if response.status not in (200,201):raise RuntimeError('Backup upload failed HTTP '+str(response.status))
 metadata=json.loads(payload)
conn.close()
url='https://storage.googleapis.com/storage/v1/b/'+bucket+'/o/'+urllib.parse.quote(name,safe='')+'?alt=media&generation='+metadata['generation']
hash=hashlib.sha256()
with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token}),timeout=120) as result:
 while chunk:=result.read(65536):hash.update(chunk)
with file.open('rb') as data:expected=hashlib.file_digest(data,'sha256').hexdigest()
if hash.hexdigest()!=expected:raise RuntimeError('Backup readback checksum mismatch')
print(json.dumps({'archive':'gs://'+bucket+'/'+name,'sha256':expected,'bytes':file.stat().st_size,'generation':metadata['generation'],'readbackVerified':True}))
