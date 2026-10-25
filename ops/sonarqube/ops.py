#!/usr/bin/env python3
"""Pinned SonarQube 26.3 operations. No user passwords or API tokens needed.

Uses the VM identity for GCS and the one explicitly shared spreadsheet.
Database schema is pinned to the deployed version; fail closed on schema drift.
"""
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path('/var/lib/sonarqube-ops')
RECEIPT_ROOT = Path('/run/sonar-report-status')
BUCKET = 'priyanshu-apps-sonarqube-backups'
SHEET = '1C7G0-c7mjQkQ3ur57u20mdv-XPIXWVBxWwgwyNHQqGY'
DEADLINE = dt.datetime(2026, 12, 22, tzinfo=dt.timezone.utc).timestamp()

def run(args, **kw):
    return subprocess.check_output(args, timeout=kw.pop('timeout', 60), **kw)

def sql(query, database='sonar'):
    return run(['docker', 'exec', 'sonarqube-db-1', 'psql', '-X', '-v', 'ON_ERROR_STOP=1',
                '-U', 'sonar', '-d', database, '-At', '-c', query]).decode().strip()

def token():
    req = urllib.request.Request('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
                                 headers={'Metadata-Flavor': 'Google'})
    return json.load(urllib.request.urlopen(req, timeout=10))['access_token']

def api(url, data=None, method=None, content_type='application/json'):
    req = urllib.request.Request(url, data=data, method=method,
        headers={'Authorization': 'Bearer ' + token(), 'Content-Type': content_type})
    with urllib.request.urlopen(req, timeout=120) as response:
        return response.read()

def upload(name, data, content_type, overwrite=False):
    url = 'https://storage.googleapis.com/upload/storage/v1/b/' + BUCKET + '/o?uploadType=media&' + ('' if overwrite else 'ifGenerationMatch=0&') + 'name=' + urllib.parse.quote(name, safe='')
    return json.loads(api(url, data, 'POST', content_type))

def mark(name, value):
    tmp = ROOT / (name + '.tmp')
    tmp.write_text(json.dumps(value))
    tmp.replace(ROOT / name)

def backup():
    if int(sql('SELECT count(*) FROM ce_queue')):
        raise RuntimeError('Analysis is active; backup deferred')
    stamp = dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    data = run(['docker', 'exec', 'sonarqube-db-1', 'pg_dump', '-U', 'sonar', '-d', 'sonar', '-Fc'], timeout=300)
    obj = upload('postgres/' + stamp + '.dump', data, 'application/octet-stream')
    # Download the stored object and compare bytes before declaring success.
    url = 'https://storage.googleapis.com/storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(obj['name'], safe='') + '?alt=media'
    if api(url) != data:
        raise RuntimeError('Backup verification failed')
    mark('backup.json', {'at': time.time(), 'object': obj['name'], 'bytes': len(data)})

def restore_check():
    state = json.loads((ROOT / 'backup.json').read_text())
    url = 'https://storage.googleapis.com/storage/v1/b/' + BUCKET + '/o/' + urllib.parse.quote(state['object'], safe='') + '?alt=media'
    data = api(url)
    name = 'sonar_restore_verify_' + str(int(time.time()))
    sql('CREATE DATABASE ' + name, 'postgres')
    try:
        subprocess.run(['docker', 'exec', '-i', 'sonarqube-db-1', 'pg_restore', '-U', 'sonar', '-d', name,
                        '--no-owner', '--exit-on-error'], input=data, check=True, timeout=300)
        live = sql('SELECT count(*) FROM issues')
        restored = sql('SELECT count(*) FROM issues', name)
        if live != restored:
            raise RuntimeError('Restored issue count differs')
        mark('restore.json', {'at': time.time(), 'object': state['object'], 'issues': int(restored)})
    finally:
        # Only this freshly created disposable verification database is removed.
        sql('DROP DATABASE ' + name, 'postgres')

def analysis_metadata(task):
    if not re.fullmatch(r'[a-f0-9-]{36}', task):
        raise ValueError('Unexpected analysis task identifier')
    query = """SELECT json_build_object(
      'task',a.uuid,'analysisId',s.uuid,'revision',s.revision,
      'version',s.version,'analysisDate',s.analysis_date,
      'measures',(SELECT json_object_agg(m.name,coalesce(p.text_value,p.value::text))
        FROM project_measures p JOIN metrics m ON m.uuid=p.metric_uuid
        WHERE p.analysis_uuid=s.uuid AND m.name IN
          ('coverage','alert_status','security_hotspots_reviewed','quality_gate_details')))
      FROM ce_activity a JOIN snapshots s ON s.uuid=a.analysis_uuid
      WHERE a.uuid='%s' AND a.status='SUCCESS'""" % task
    metadata = json.loads(sql(query))
    if not isinstance(metadata, dict) or not metadata.get('analysisId'):
        raise ValueError('Analysis metadata unavailable; export not marked complete')
    return metadata

def publish_export_receipt(value):
    # Only non-secret completion metadata is readable by the local status service.
    RECEIPT_ROOT.mkdir(mode=0o755, parents=True, exist_ok=True)
    target = RECEIPT_ROOT / 'latest.json'
    temporary = RECEIPT_ROOT / 'latest.tmp'
    temporary.write_text(json.dumps(value))
    temporary.chmod(0o644)
    temporary.replace(target)

def export():
    if int(sql('SELECT count(*) FROM ce_queue')):
        return
    task = sql("SELECT uuid FROM ce_activity WHERE status='SUCCESS' AND task_type='REPORT' ORDER BY executed_at DESC LIMIT 1")
    if not task:
        return
    previous = ROOT / 'export.json'
    if previous.exists():
        previous_value = json.loads(previous.read_text())
        if previous_value.get('task') == task and previous_value.get('format') == 3:
            publish_export_receipt(previous_value)
            return
    metadata = analysis_metadata(task)
    query = """SELECT coalesce(json_agg(x), '[]') FROM (
      SELECT i.kee AS issue_id, c.path AS file, i.line, i.severity, i.status,
        i.issue_type, i.message, i.effort, i.rule_uuid, i.issue_creation_date,
        r.plugin_name || ':' || r.plugin_rule_key AS rule, r.name AS rule_name
      FROM issues i LEFT JOIN components c ON c.uuid=i.component_uuid
      LEFT JOIN rules r ON r.uuid=i.rule_uuid ORDER BY c.path,i.line,i.kee
    ) x"""
    rows = json.loads(sql(query))
    metadata['openIssues'] = sum(row['status'] in ('OPEN', 'CONFIRMED') for row in rows)
    metadata['unreviewedHotspots'] = sum(row['issue_type'] == 4 and row['status'] == 'TO_REVIEW' for row in rows)
    measures = metadata.get('measures') or {}
    details = json.loads(measures.get('quality_gate_details') or '{}')
    metadata['qualityGateDetails'] = details
    conditions = {item['metric']: item.get('actual', 'Unavailable') for item in details.get('conditions', [])}
    headers = ['Analysis task', 'Issue ID', 'File', 'Line', 'Severity', 'Status', 'Type', 'Message', 'Effort minutes', 'Rule', 'Rule name', 'SonarQube link', 'Commit SHA', 'Analysis ID', 'Quality gate', 'Coverage %', 'Hotspots reviewed %', 'Open issues', 'Unreviewed hotspots']
    headers += ['New code coverage %', 'New code duplication %']
    values = [headers]
    for row in rows:
        kind = {1: 'CODE_SMELL', 2: 'BUG', 3: 'VULNERABILITY', 4: 'SECURITY_HOTSPOT'}.get(row['issue_type'], str(row['issue_type']))
        values.append([task, row['issue_id'], row['file'] or '', row['line'] or '', row['severity'] or '', row['status'], kind,
                       row['message'] or '', row['effort'] or 0, row['rule'] or row['rule_uuid'], row['rule_name'] or '',
                       'https://sonar.priyanshumodi.in/project/issues?id=kubiq&issues=' + row['issue_id'],
                       metadata.get('revision') or 'Unavailable', metadata['analysisId'],
                       measures.get('alert_status', 'Unavailable'), measures.get('coverage', 'Unavailable'),
                       measures.get('security_hotspots_reviewed', 'Unavailable'), metadata['openIssues'], metadata['unreviewedHotspots'],
                       conditions.get('new_coverage', 'Unavailable'), conditions.get('new_duplicated_lines_density', 'Unavailable')])
    # RAW input prevents issue messages or paths being interpreted as formulas.
    title = 'Scan ' + dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%d %H%M%S')
    base = 'https://sheets.googleapis.com/v4/spreadsheets/' + SHEET
    body = {'requests': [{'addSheet': {'properties': {'title': title, 'gridProperties': {'rowCount': max(1000,len(values)+10), 'columnCount': len(headers), 'frozenRowCount': 1}}}}]}
    api(base + ':batchUpdate', json.dumps(body).encode(), 'POST')
    sheet_range = urllib.parse.quote("'" + title + "'!A1", safe='')
    api(base + '/values/' + sheet_range + '?valueInputOption=RAW', json.dumps({'values': values}).encode(), 'PUT')
    report = {'schemaVersion': 3, 'metadata': metadata, 'issues': rows}
    upload('reports/' + task + '-' + str(int(time.time())) + '.json', json.dumps(report).encode(), 'application/json')
    mark('export.json', {'at': time.time(), 'task': task, 'issues': len(rows), 'tab': title, 'format': 3,
                         'revision': metadata.get('revision'), 'analysisId': metadata['analysisId'],
                         'qualityGate': measures.get('alert_status'), 'coverage': measures.get('coverage'),
                         'unreviewedHotspots': metadata['unreviewedHotspots']})
    publish_export_receipt(json.loads(previous.read_text()))

def idle_check(dry=False):
    now = time.time()
    statefile = ROOT / 'idle.json'
    state = json.loads(statefile.read_text()) if statefile.exists() else {'lastActivity': now}
    # A reboot starts a fresh grace period.
    boot = now - float(Path('/proc/uptime').read_text().split()[0])
    last = max(state['lastActivity'], boot)
    queued = int(sql('SELECT count(*) FROM ce_queue'))
    if queued:
        last = now
    logs = run(['docker', 'exec', 'sonarqube-sonarqube-1', 'tail', '-n', '20000', '/opt/sonarqube/logs/access.log']).decode()
    for line in logs.splitlines():
        match = re.search(r'\[([^]]+)\] "(?:GET|POST|PUT|DELETE|PATCH) ([^ ]+)', line)
        if not match:
            continue
        path = match[2].split('?')[0]
        if path in ('/api/system/status', '/api/system/health', '/api/monitoring/metrics'):
            continue
        stamp = dt.datetime.strptime(match[1], '%d/%b/%Y:%H:%M:%S %z').timestamp()
        last = max(last, stamp)
    state = {'lastActivity': last, 'checkedAt': now, 'queued': queued, 'idleSeconds': now-last}
    mark('idle.json', state)
    services = {'docker': 'healthy'}
    for key, container in [('sonarqube', 'sonarqube-sonarqube-1'), ('postgresql', 'sonarqube-db-1')]:
        try:
            info = json.loads(run(['docker', 'inspect', container]))[0]['State']
            services[key] = info.get('Health', {}).get('Status', info['Status'])
        except Exception:
            services[key] = 'unavailable'
    status = {'at': now, 'services': services, 'idle': state}
    for key in ['backup', 'export', 'restore']:
        file = ROOT / (key + '.json')
        status[key] = json.loads(file.read_text()) if file.exists() else None
    upload('status/sonarqube-vm.json', json.dumps(status).encode(), 'application/json', overwrite=True)
    # Cancel the legacy boot-time schedule; this service owns the policy now.
    if not dry:
        subprocess.run(['shutdown', '-c'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    expired = now >= DEADLINE
    if not dry and (expired or (not queued and now-last >= 7200)):
        # Preserve offline data first. Any failure prevents an idle shutdown.
        try:
            export()
            backup()
        except Exception:
            if not expired:
                raise
            print('Deadline reached; stopping even though final preservation failed', file=sys.stderr)
        subprocess.run(['systemctl', 'poweroff'], check=True)
    print(json.dumps(state))

if __name__ == '__main__':
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (ROOT / 'lock').open('w') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            # Another operation is preserving data; the next timer tick retries.
            sys.exit(0)
        {'backup': backup, 'restore-check': restore_check, 'export': export,
         'idle': idle_check, 'idle-dry-run': lambda: idle_check(True)}[sys.argv[1]]()
