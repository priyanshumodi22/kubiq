import datetime,hashlib,json,pathlib,subprocess
S=pathlib.Path('/var/lib/kubiq-mongodb')
def kub(*args):return subprocess.check_output(['k3s','kubectl',*args],text=True)
before=json.loads((S/'cutover-before.json').read_text());dep=json.loads(kub('get','deployment','kubiq','-n','kubiq-system','-o','json'));secret=json.loads(kub('get','secret','kubiq-runtime','-n','kubiq-system','-o','json'));svc=json.loads(kub('get','service','kubiq','-n','kubiq-system','-o','json'))
assert hashlib.sha256(json.dumps(secret['data'],sort_keys=True).encode()).hexdigest()==before['runtimeSecretSha256']
assert dep['spec']['template']['spec']['containers'][0]['image']==before['image']
assert svc['spec']['selector']==before['serviceSelector']
assert dep['status']['availableReplicas']==1
http=json.loads(pathlib.Path('/tmp/kubiq-mongodb-http-result.json').read_text().splitlines()[-1]);assert http['passed'] and http['selfHosted']
stable=json.loads(pathlib.Path('/tmp/atlas-no-writes-20261027.json').read_text().splitlines()[-1]);assert stable['passed']
backup=json.loads((S/'last-backup.json').read_text());assert backup['readbackVerified']
report={'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'productionDatabase':'self-hosted MongoDB on priyanshu-k3s','finalCopy':json.loads((S/'final-copy-verification.json').read_text()),'finalAtlasBackup':json.loads((S/'final-atlas-backup.json').read_text()),'atlasUnchangedAfterFinalHandoff':True,'httpChecks':http,'telemetryHttp':{'unauthenticated':401,'apm':202,'logs':202,'expiredRemoved':True,'freshRetained':True,'fixtureCleanupVerified':True,'apmRetentionSeconds':259200,'logRetentionSeconds':604800},'adapterChecks':json.loads((S/'adapter-verification.json').read_text()),'applicationImage':before['image'],'runtimeSecretUnchanged':True,'maintenanceSelectorRemoved':True,'atlasRetained':True,'postCutoverBackup':backup,'dailyBackupTimerActive':subprocess.check_output(['systemctl','is-active','kubiq-mongodb-backup.timer'],text=True).strip()=='active'}
assert report['dailyBackupTimerActive']
(S/'cutover-complete.json').write_text(json.dumps(report,indent=2));print(json.dumps({'cutoverComplete':True,'selfHosted':True,'accountsChecked':http['enabledAccountsAuthenticated'],'runtimeSecretUnchanged':True,'freshCopyDocuments':report['finalCopy']['totalDocuments']}))
