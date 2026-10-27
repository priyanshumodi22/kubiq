#!/usr/bin/env python3
"""Read-only capacity snapshot on the k3s host; never emits credentials or spans."""
import datetime
import json
from pathlib import Path
import shutil
import subprocess


def kubectl(*args):
    return subprocess.check_output(['k3s', 'kubectl', *args], timeout=30, stderr=subprocess.PIPE).decode().strip()


def snapshot():
    script = """
const admin = db.getSiblingDB('admin');
if (!admin.auth(process.env.MONGO_INITDB_ROOT_USERNAME, process.env.MONGO_INITDB_ROOT_PASSWORD)) quit(1);
const app = db.getSiblingDB('kubiq');
const stats = app.runCommand({collStats:'apmspans', scale:1});
if (!stats.ok) quit(2);
const services = app.apmspans.aggregate([
 {$match:{serviceName:{$in:['kubiq-backend','portfolio']}}},
 {$group:{_id:'$serviceName',spanCount:{$sum:1},serverCount:{$sum:{$cond:[{$in:[{$toString:'$kind'},['2','SERVER','SPAN_KIND_SERVER']]},1,0]}},documentBytes:{$sum:{$bsonSize:'$$ROOT'}},oldest:{$min:'$timestamp'},newest:{$max:'$timestamp'}}}
]).toArray().map(row=>({serviceName:row._id,spanCount:Number(row.spanCount),serverCount:Number(row.serverCount),documentBytes:Number(row.documentBytes),oldest:row.oldest,newest:row.newest}));
const ttl = app.apmspans.getIndexes().find(index=>index.key.timestamp===1 && Object.keys(index.key).length===1);
console.log(JSON.stringify({documentCount:Number(stats.count),dataBytes:Number(stats.size),storageBytes:Number(stats.storageSize),indexBytes:Number(stats.totalIndexSize),ttlSeconds:ttl?Number(ttl.expireAfterSeconds):null,services}));
"""
    output = kubectl('exec', '-n', 'mongodb-system', 'mongodb-0', '--', 'mongosh', '--quiet', '--eval', script)
    database = json.loads(next(line for line in reversed(output.splitlines()) if line.startswith('{')))
    if database['ttlSeconds'] != 259200:
        raise RuntimeError('Unexpected live APM retention; refusing to label this snapshot compliant')
    pods = json.loads(kubectl('get', 'pods', '-A', '-o', 'json'))['items']
    try:
        metrics = json.loads(kubectl('get', '--raw', '/apis/metrics.k8s.io/v1beta1/pods'))['items']
    except (subprocess.SubprocessError, ValueError):
        metrics = []
    selected = []
    targets = {('kubiq-system', 'kubiq'), ('apps', 'portfolio'), ('mongodb-system', 'mongodb')}
    for pod in pods:
        metadata = pod['metadata']
        namespace, name = metadata['namespace'], metadata['name']
        application = metadata.get('labels', {}).get('app.kubernetes.io/name')
        if metadata.get('deletionTimestamp') or (namespace, application) not in targets:
            continue
        container = pod['spec']['containers'][0]
        status = (pod.get('status', {}).get('containerStatuses') or [{}])[0]
        usage = next((item['containers'][0]['usage'] for item in metrics if item['metadata']['namespace'] == namespace and item['metadata']['name'] == name), None)
        try:
            peak = int(kubectl('exec', '-n', namespace, name, '--', 'cat', '/sys/fs/cgroup/memory.peak'))
        except (subprocess.SubprocessError, ValueError):
            peak = None
        selected.append({'application': application, 'namespace': namespace, 'pod': name, 'image': container['image'], 'ready': status.get('ready'), 'restarts': status.get('restartCount'), 'lastTerminationReason': status.get('lastState', {}).get('terminated', {}).get('reason'), 'limits': container.get('resources', {}).get('limits'), 'usage': usage, 'memoryPeakBytes': peak})
    memory = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        parts = line.split()
        if parts[0] in ('MemTotal:', 'MemAvailable:'):
            memory[parts[0].rstrip(':') + 'Bytes'] = int(parts[1]) * 1024
    disk = shutil.disk_usage('/')
    return {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'vm': 'priyanshu-k3s', 'host': {**memory, 'diskUsedBytes': disk.used, 'diskFreeBytes': disk.free}, 'apm': database, 'pods': selected, 'capacityBudgetBytes': 512 * 1024 * 1024, 'note': 'Point-in-time snapshot. A full 24-hour observation must be recorded separately.'}


if __name__ == '__main__':
    print(json.dumps(snapshot()))
