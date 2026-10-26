import json,os,subprocess,urllib.request,urllib.error
os.environ['CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE']='/etc/kubiq-mongodb/backup-service-account.json'
os.environ['CLOUDSDK_CONFIG']='/var/lib/kubiq-mongodb/gcloud'
token=subprocess.check_output(['gcloud','auth','print-access-token'],text=True).strip()
# Existing telemetry backup is outside the approved prefix. Never prints its content.
url='https://storage.googleapis.com/storage/v1/b/priyanshu-apps-sonarqube-backups/o/kubiq-retention%2F2026-10-26%2Ftelemetry-before-retention.ejson.gz?alt=media'
try:
 with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+token}),timeout=30) as r:r.read(1)
 raise RuntimeError('Backup identity has unintended access outside its prefix')
except urllib.error.HTTPError as e:
 if e.code!=403:raise
 print(json.dumps({'outsideBackupPrefixDenied':True,'httpStatus':e.code}))
