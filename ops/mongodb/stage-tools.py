import json,subprocess,sys
with open(sys.argv[1] if len(sys.argv)>1 else '/opt/kubiq-mongodb/migration-tools.json') as f:files=json.load(f)['items'][0]['data']
base=['k3s','kubectl','exec','-n','mongodb-system','mongodb-migration']
subprocess.run(base+['--','mkdir','-p','/work/operations'],check=True)
for name,content in files.items():
 subprocess.run(base+['-i','--','tee','/work/operations/'+name],input=content,text=True,stdout=subprocess.DEVNULL,check=True)
print('Operation scripts staged without credentials')
