const fs = require('node:fs');
const path = require('node:path');
const guide = require('../../docs/apm/instrumentation.json');
const [runtimeId, mode = 'candidate', output, npmArtifact, pythonArtifact] = process.argv.slice(2);
if (!['node','python','java','go','nextjs'].includes(runtimeId) || !['candidate','registry'].includes(mode) || !output) throw new Error('Usage: manifest.cjs runtime candidate|registry output npm.tgz python.whl');
const runtime = guide.runtimes.find(item => item.id === runtimeId);
const source = Object.fromEntries(['worker.cjs','node.cjs','app.py','pom.xml','Canary.java','main.go','route.js','ready.js'].map(file => [file, fs.readFileSync(path.join(__dirname,file),'utf8')]));
source['driver.cjs'] = fs.readFileSync(path.join(__dirname,'../apm-live-check/driver.cjs'),'utf8');
source['collector.yaml'] = guide.collector.blocks.find(block => block.id === 'collector-config').code;
source['tracing.go'] = guide.runtimes.find(item => item.id === 'go').blocks.find(block => block.id === 'source').code;
source['instrumentation.ts'] = guide.runtimes.find(item => item.id === 'nextjs').blocks.find(block => block.id === 'source').code;
source['next.config.mjs'] = 'export default { experimental: { cpus: 1 } };';
const name = 'kubiq-guide-' + runtimeId + '-' + mode;
const binaryData = mode === 'candidate' ? {
 'kubiq-apm.tgz': fs.readFileSync(npmArtifact).toString('base64'),
 'kubiq_apm-1.0.1-py3-none-any.whl': fs.readFileSync(pythonArtifact).toString('base64'),
} : {};
const nodePackage = mode === 'candidate' ? '/fixture/kubiq-apm.tgz' : 'kubiq-apm@' + guide.nodeVersion;
const pythonPackage = mode === 'candidate' ? '/fixture/kubiq_apm-1.0.1-py3-none-any.whl' : 'kubiq-apm==' + guide.pythonVersion;
const nodeImage = 'node:22-bookworm-slim';
const pythonImage = 'python:3.12-slim-bookworm';
const javaImage = 'maven:3.9.9-eclipse-temurin-17';
const contextEnv = [{name:'CANARY_RUN_ID',valueFrom:{fieldRef:{fieldPath:'metadata.uid'}}}];
const directEnv = [
 {name:'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',value:'http://kubiq.kubiq-system.svc.cluster.local/kubiq-api/api/apm/v1/traces'},
 {name:'KUBIQ_INGESTION_TOKEN',valueFrom:{secretKeyRef:{name:'kubiq-runtime',key:'KUBIQ_INGESTION_TOKEN'}}},
 {name:'OTEL_EXPORTER_OTLP_TRACES_HEADERS',value:'Authorization=Bearer $(KUBIQ_INGESTION_TOKEN)'},
];
const appEnv = [
 {name:'NODE_PATH',value:'/work/node/node_modules'}, {name:'OTEL_METRICS_EXPORTER',value:'none'}, {name:'OTEL_LOGS_EXPORTER',value:'none'},
 {name:'OTEL_BSP_SCHEDULE_DELAY',value:'2000'},...contextEnv,
 {name:'KUBIQ_TRACE_PROPAGATION_ORIGINS',value:'http://127.0.0.1:18081'},
];
const mounts = [{name:'source',mountPath:'/fixture',readOnly:true},{name:'work',mountPath:'/work'}];
function container(name,image,command,memory='192Mi',cpu='150m',env=[]) {
 return {name,image,command:['sh','-ec',command],env:[{name:'TMPDIR',value:'/work'},...env],volumeMounts:mounts,
 resources:{requests:{cpu:'10m',memory:'32Mi'},limits:{cpu,memory}},
 securityContext:{allowPrivilegeEscalation:false,capabilities:{drop:['ALL']},readOnlyRootFilesystem:true}};
}
function sidecar(spec,port) {
 return {...spec,restartPolicy:'Always',startupProbe:{tcpSocket:{port},periodSeconds:2,failureThreshold:90}};
}
const init = [container('node-dependencies',nodeImage,'npm install --prefix /work/node --ignore-scripts --no-audit --no-fund --cache=/work/npm-cache '+nodePackage,'384Mi','300m')];
let image = nodeImage;
let start = 'exec node --require kubiq-apm/auto /fixture/node.cjs';
if (runtimeId === 'python') {
 init.push(container('python-dependencies',pythonImage,'python -m venv /work/venv && /work/venv/bin/pip install --no-cache-dir '+pythonPackage+' Flask==3.1.0 requests==2.32.3 && /work/venv/bin/kubiq-apm install','512Mi','400m', [{name:'PATH',value:'/work/venv/bin:/usr/local/bin:/usr/bin:/bin'}]));
 image=pythonImage;start='cd /fixture && exec /work/venv/bin/kubiq-apm flask --app app run --host 0.0.0.0 --port 18080';
}
if (runtimeId === 'java') {
init.push(container('java-build',javaImage,'mkdir -p /work/java/src/main/java/in/kubiq/validation && cp /fixture/pom.xml /work/java/ && cp /fixture/Canary.java /work/java/src/main/java/in/kubiq/validation/ && cd /work/java && mvn -q -Dmaven.repo.local=/work/m2 -DskipTests package && curl --fail --location --silent --show-error https://github.com/open-telemetry/opentelemetry-java-instrumentation/releases/download/v2.14.0/opentelemetry-javaagent.jar -o /work/java/agent.jar && echo 16f8e28fa1ddcd56ed85bf633bd1d1fbc78ea7c4cc50e8c5726b2a319f5058c8 /work/java/agent.jar | sha256sum --check','768Mi','500m',[{name:'MAVEN_OPTS',value:'-Xmx384m -Duser.home=/work'}]));
 image=javaImage;start='exec $JAVA_HOME/bin/java -Xmx256m -javaagent:/work/java/agent.jar -Dotel.traces.exporter=otlp -Dserver.port=18080 -Djava.io.tmpdir=/work -jar /work/java/target/canary-1.0.0.jar';
}
if (runtimeId === 'go') {
 const install=runtime.blocks.find(block=>block.id==='install').code;
 init.push(container('go-build','golang:1.23-bookworm','mkdir -p /work/go && cp /fixture/main.go /fixture/tracing.go /work/go/ && cd /work/go && go mod init kubiq.validation/canary && '+install+' && go mod tidy && go build -p 1 -o /work/go-canary .','512Mi','500m',[{name:'GOCACHE',value:'/work/go-cache'},{name:'GOPATH',value:'/work/go-path'},{name:'GOMAXPROCS',value:'1'}]));
 start='exec /work/go-canary';
}
if (runtimeId === 'nextjs') {
 source['next-package.json']=JSON.stringify({private:true,scripts:{build:'next build',start:'next start --hostname 0.0.0.0 --port 18080'},dependencies:{'kubiq-apm':nodePackage,next:'16.1.6',react:'19.2.3','react-dom':'19.2.3','@vercel/otel':'1.13.0'},devDependencies:{typescript:'5.9.3','@types/node':'22.10.10','@types/react':'19.0.8'}});
 source['layout.js']='export default function Layout({children}) { return <html><body>{children}</body></html> }';
 init.push(container('next-build',nodeImage,"mkdir -p '/work/next/app/apm-validation/[route]' /work/next/app/ready && cp /fixture/next-package.json /work/next/package.json && cp /fixture/instrumentation.ts /work/next/ && cp /fixture/layout.js /work/next/app/ && cp /fixture/ready.js /work/next/app/ready/route.js && cp /fixture/route.js '/work/next/app/apm-validation/[route]/route.js' && cp /fixture/next.config.mjs /work/next/ && cd /work/next && npm install --ignore-scripts --no-audit --no-fund --cache=/work/npm-cache && npm run build",'768Mi','500m',[{name:'NEXT_TELEMETRY_DISABLED',value:'1'},{name:'HOME',value:'/work'},{name:'NODE_OPTIONS',value:'--max-old-space-size=512'}]));
 start='cd /work/next && exec npm run start';
}
if (runtime.collector) {
 const collector = container('collector','otel/opentelemetry-collector-contrib:0.123.0','', '128Mi','100m',[
 {name:'KUBIQ_TRACES_ENDPOINT',value:directEnv[0].value},directEnv[1]]);
 collector.command=['/otelcol-contrib','--config=/fixture/collector.yaml'];
 init.push({...collector,restartPolicy:'Always'});
}
const worker = container('worker',nodeImage,'exec node --require kubiq-apm/auto /fixture/worker.cjs','192Mi','150m',[...appEnv,...directEnv,{name:'OTEL_SERVICE_NAME',value:name+'-worker'}]);
init.push(sidecar(worker,18081));
const receiverEnv=runtime.collector ? [{name:'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',value:'http://127.0.0.1:4318/v1/traces'},{name:'OTEL_EXPORTER_OTLP_PROTOCOL',value:'http/protobuf'}] : directEnv;
init.push(sidecar(container('frontend',image,start,runtimeId==='java'?'512Mi':'256Mi','300m',[...appEnv,...receiverEnv,{name:'OTEL_SERVICE_NAME',value:name+'-frontend'},{name:'PATH',value:'/work/venv/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'},{name:'HOME',value:'/work'},{name:'PYTHONDONTWRITEBYTECODE',value:'1'},{name:'NEXT_TELEMETRY_DISABLED',value:'1'}]),18080));
const job={apiVersion:'batch/v1',kind:'Job',metadata:{name,namespace:'kubiq-system',labels:{'app.kubernetes.io/name':'kubiq-guide-check'}},spec:{backoffLimit:0,activeDeadlineSeconds:1200,ttlSecondsAfterFinished:1800,template:{metadata:{labels:{'app.kubernetes.io/name':'kubiq-guide-check'}},spec:{
 automountServiceAccountToken:false,restartPolicy:'Never',terminationGracePeriodSeconds:30,
 securityContext:{runAsNonRoot:true,runAsUser:1000,runAsGroup:1000,fsGroup:1000},
 volumes:[{name:'source',configMap:{name}},{name:'work',emptyDir:{sizeLimit:'2Gi'}}],
 initContainers:init,containers:[container('driver',nodeImage,'node /fixture/driver.cjs','96Mi','100m',contextEnv)]
}}}};
fs.writeFileSync(output,JSON.stringify({apiVersion:'v1',kind:'List',items:[{apiVersion:'v1',kind:'ConfigMap',metadata:{name,namespace:'kubiq-system'},data:source,binaryData},job]},null,2));
console.log('Prepared '+name+'; no credential values are in this manifest.');
