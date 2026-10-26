import datetime,json,os,pathlib,subprocess
root=pathlib.Path('/var/backups/kubiq-mongodb');root.mkdir(mode=0o700,parents=True,exist_ok=True)
state=pathlib.Path('/var/lib/kubiq-mongodb');state.mkdir(mode=0o700,parents=True,exist_ok=True)
base=['k3s','kubectl','exec','-n','mongodb-system','mongodb-migration','--']
for name in ['rehearsal-verification.json','auth-verification.json']:
 raw=subprocess.check_output(base+['cat','/work/'+name]);data=json.loads(raw)
 (state/name).write_text(json.dumps(data,indent=2));os.chmod(state/name,0o600)
file=root/('atlas-rehearsal-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'.tar.gz')
with file.open('wb') as out:
 os.chmod(file,0o600);subprocess.run(base+['tar','-C','/work','-czf','-','source'],stdout=out,check=True)
raw=subprocess.check_output(['/usr/bin/python3','/opt/kubiq-mongodb/upload.py',str(file),'migration/'+file.name],text=True)
report=json.loads(raw);(state/'atlas-rehearsal-archive.json').write_text(json.dumps(report,indent=2));print(json.dumps(report))
