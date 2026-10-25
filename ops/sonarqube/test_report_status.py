import importlib.machinery
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import urllib.error

status = importlib.machinery.SourceFileLoader('report_status_test', str(Path(__file__).with_name('report_status.py'))).load_module()

class ReportStatusTests(unittest.TestCase):
    def test_requires_existing_project_browse_authentication(self):
        self.assertEqual(status.read_receipt(None)[0], 401)
        def denied(*_args, **_kwargs):
            raise urllib.error.HTTPError('http://localhost', 403, 'Denied', {}, None)
        self.assertEqual(status.read_receipt('Bearer fixture', denied)[0], 403)

    def test_unavailable_sonar_and_missing_receipts_never_pass(self):
        def offline(*_args, **_kwargs): raise OSError('Offline')
        self.assertEqual(status.read_receipt('Bearer fixture', offline)[0], 503)
        with tempfile.TemporaryDirectory() as folder, patch.object(status, 'RECEIPT', Path(folder) / 'missing.json'):
            self.assertEqual(status.read_receipt('Bearer fixture', lambda *_a, **_kw: io.BytesIO(b'{"analyses":[]}'))[0], 503)

    def test_returns_only_completion_metadata_after_project_authentication(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(status, 'RECEIPT', Path(folder) / 'receipt.json'):
            status.RECEIPT.write_text(json.dumps({'task': 'task', 'analysisId': 'analysis', 'revision': 'a' * 40, 'format': 3, 'issues': ['private finding']}))
            code, payload = status.read_receipt('Bearer fixture', lambda *_a, **_kw: io.BytesIO(b'{"analyses":[]}'))
            self.assertEqual(code, 200)
            self.assertNotIn('issues', payload)
            self.assertEqual(payload['revision'], 'a' * 40)

if __name__ == '__main__': unittest.main()
