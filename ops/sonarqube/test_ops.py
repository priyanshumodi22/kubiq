import importlib.machinery
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

source = Path(__file__).with_name('ops.py')
ops = importlib.machinery.SourceFileLoader('sonar_ops_test', str(source) if source.exists() else '/usr/local/sbin/sonar-ops').load_module()

class ExportMetadataTests(unittest.TestCase):
    def test_failed_quality_gate_is_exported_with_revision_and_original_columns(self):
        task = 'ac87f101-0834-43a1-a03f-5de3cbcd5008'
        metadata = {'task': task, 'analysisId': 'analysis', 'revision': 'a' * 40,
                    'measures': {'alert_status': 'ERROR', 'coverage': '20', 'security_hotspots_reviewed': '50'}}
        rows = [{'issue_id': 'issue', 'file': 'backend/src/test.ts', 'line': 1,
                 'severity': 'MAJOR', 'status': 'OPEN', 'issue_type': 1, 'message': '=not a formula',
                 'effort': 5, 'rule': 'typescript:S1', 'rule_name': 'Rule'}]
        with tempfile.TemporaryDirectory() as folder, patch.object(ops, 'ROOT', Path(folder)), \
             patch.object(ops, 'sql', side_effect=['0', task, ops.json.dumps(metadata), ops.json.dumps(rows)]), \
             patch.object(ops, 'api') as sheets, patch.object(ops, 'upload') as upload:
            ops.export()
            request = ops.json.loads(sheets.call_args.args[1])
            self.assertEqual(request['values'][0][0:3], ['Analysis task', 'Issue ID', 'File'])
            self.assertEqual(request['values'][1][12:16], ['a' * 40, 'analysis', 'ERROR', '20'])
            self.assertIn('valueInputOption=RAW', sheets.call_args.args[0])
            report = ops.json.loads(upload.call_args.args[1])
            self.assertEqual(report['schemaVersion'], 3)
            self.assertEqual(report['metadata']['openIssues'], 1)
            state = ops.json.loads((Path(folder) / 'export.json').read_text())
            self.assertEqual(state['qualityGate'], 'ERROR')
            self.assertEqual(state['format'], 3)

    def test_invalid_task_cannot_be_interpolated_into_metadata_query(self):
        with patch.object(ops, 'sql') as query:
            with self.assertRaises(ValueError): ops.analysis_metadata("'; DROP TABLE issues; --")
            query.assert_not_called()

class IdlePolicyTests(unittest.TestCase):
    def simulate(self, queued=0, recent=False, failed_export=False, deadline=False, unhealthy=False):
        now = ops.DEADLINE + 1 if deadline else time.time()
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'idle.json').write_text('{"lastActivity": %s}' % (now - 8000))
            original_read = Path.read_text
            def read(path, *a, **kw):
                return '20000 0' if str(path) == '/proc/uptime' else original_read(path, *a, **kw)
            timestamp = ops.dt.datetime.fromtimestamp(now if recent else now-8000, ops.dt.timezone.utc).strftime('%d/%b/%Y:%H:%M:%S %z')
            url = '/dashboard?id=kubiq' if recent else '/api/system/status'
            logs = f'127.0.0.1 - - [{timestamp}] "GET {url} HTTP/1.1" 200 -'
            def command(args, **kw):
                if 'tail' in args:
                    return logs.encode()
                if unhealthy:
                    raise RuntimeError('Container unavailable')
                return b'[{"State":{"Status":"running","Health":{"Status":"healthy"}}}]'
            exporter = Mock(side_effect=RuntimeError('Sheets unavailable')) if failed_export else Mock()
            with patch.object(ops, 'ROOT', root), patch.object(ops.time, 'time', return_value=now), \
                 patch.object(Path, 'read_text', read), patch.object(ops, 'sql', return_value=str(queued)), \
                 patch.object(ops, 'run', side_effect=command), patch.object(ops, 'upload') as upload, \
                 patch.object(ops, 'export', exporter), patch.object(ops, 'backup') as backup, \
                 patch.object(ops.subprocess, 'run') as actions:
                if failed_export and not deadline:
                    with self.assertRaises(RuntimeError): ops.idle_check()
                else:
                    ops.idle_check()
                stopped = any(call.args[0] == ['systemctl', 'poweroff'] for call in actions.call_args_list)
                status = ops.json.loads(upload.call_args.args[1])
                return stopped, backup.call_count, status

    def test_scan_prevents_stop(self): self.assertFalse(self.simulate(queued=1)[0])
    def test_browser_prevents_stop(self): self.assertFalse(self.simulate(recent=True)[0])
    def test_idle_stops_after_preservation(self): self.assertEqual(self.simulate()[:2], (True, 1))
    def test_export_failure_prevents_idle_stop(self): self.assertFalse(self.simulate(failed_export=True)[0])
    def test_credit_deadline_stops_even_on_export_failure(self): self.assertTrue(self.simulate(failed_export=True, deadline=True)[0])
    def test_missing_container_is_unavailable(self): self.assertEqual(self.simulate(recent=True, unhealthy=True)[2]['services']['sonarqube'], 'unavailable')

if __name__ == '__main__': unittest.main()
