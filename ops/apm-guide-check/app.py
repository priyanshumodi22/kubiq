import os
import requests
from flask import Flask, request, jsonify
from opentelemetry import trace
app = Flask(__name__)
@app.route("/<path:path>")
def proxy(path):
    span = trace.get_current_span()
    span.set_attribute("kubiq.validation.run_id", os.environ["CANARY_RUN_ID"])
    front_id = format(span.get_span_context().trace_id, "032x")
    upstream = requests.get("http://127.0.0.1:18081/" + path, timeout=3)
    return jsonify(**upstream.json(), frontTraceId=front_id), upstream.status_code
