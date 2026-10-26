import base64,json,pathlib,subprocess
secret=json.loads(subprocess.check_output(['k3s','kubectl','get','secret','kubiq-mongodb','-n','kubiq-system','-o','json'],text=True))
uri=base64.b64decode(secret['data']['DB_URI']).decode()
bundle=pathlib.Path('/opt/kubiq-mongodb/compatibility-bundle-main157.cjs').read_text()
code='process.env.TARGET_URI='+json.dumps(uri)+';\n'+bundle
r=subprocess.run(['k3s','kubectl','exec','-i','-n','kubiq-system','deployment/kubiq','--','node'],input=code,text=True,capture_output=True)
# Successful reports contain only counts and disposable fixture identifiers.
if r.returncode:raise RuntimeError('Adapter compatibility check failed: '+r.stderr[-500:])
print(r.stdout)
lines=[x for x in r.stdout.splitlines() if x.startswith('{')]
report=json.loads(lines[-1]);assert report.get('passed') is True
out=pathlib.Path('/var/lib/kubiq-mongodb');out.mkdir(mode=0o700,parents=True,exist_ok=True)
(out/'adapter-verification.json').write_text(json.dumps(report,indent=2))
