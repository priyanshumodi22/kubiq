#!/usr/bin/env python3
"""Read-only export receipt behind the existing Cloudflare Access application.

Each request also requires a Sonar token with Browse on kubiq. No credentials
are stored, and this unprivileged loopback service cannot start cloud operations.
"""
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import urllib.error
import urllib.request

RECEIPT = Path('/run/sonar-report-status/latest.json')
STATUS_PATH = '/_kubiq/sonar-export-status'

def read_receipt(authorization, opener=urllib.request.urlopen):
    if not authorization or not authorization.startswith('Bearer ') or len(authorization) > 1024:
        return 401, {'error': 'Sonar Browse authentication required'}
    request = urllib.request.Request('http://127.0.0.1:9000/api/project_analyses/search?project=kubiq&ps=1',
                                     headers={'Authorization': authorization})
    try:
        with opener(request, timeout=10) as response:
            project = json.load(response)
        if not isinstance(project.get('analyses'), list):
            return 503, {'error': 'Sonar verification unavailable'}
    except urllib.error.HTTPError as error:
        return (403 if error.code in (401, 403) else 503), {'error': 'Sonar Browse verification failed'}
    except (OSError, ValueError, AttributeError):
        return 503, {'error': 'Sonar verification unavailable'}
    try:
        receipt = json.loads(RECEIPT.read_text())
        if receipt.get('format') != 3 or not all(receipt.get(key) for key in ('task', 'analysisId', 'revision')):
            raise ValueError('Incomplete export receipt')
        return 200, {key: receipt.get(key) for key in ('task', 'analysisId', 'revision', 'at', 'format')}
    except (OSError, ValueError, AttributeError):
        return 503, {'error': 'Completed export receipt unavailable'}

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path != STATUS_PATH:
            status, payload = 404, {'error': 'Not found'}
        else:
            status, payload = read_receipt(self.headers.get('Authorization'))
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        # Never log authorization headers or request credentials.
        pass

if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 19001), Handler).serve_forever()
