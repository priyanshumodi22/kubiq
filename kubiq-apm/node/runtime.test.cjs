const assert=require('node:assert/strict');
const http=require('node:http');
const { EventEmitter }=require('node:events');
const { gunzipSync }=require('node:zlib');
const { test }=require('node:test');
const runtime=require('./runtime');
const {getRuntime}=require('./runtime-state');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function response(statusCode=200){const r=new EventEmitter();r.statusCode=statusCode;r.writableFinished=false;return r;}
function finish(r){r.writableFinished=true;r.emit('finish');r.emit('close');}
function flatten(payloads){return payloads.flatMap(p=>p.resourceSpans.flatMap(r=>r.scopeSpans.flatMap(s=>s.spans)));}
test('opt-in runtime emits private, correctly parented JSON traces and suppresses background work',async t=>{
    assert.equal(runtime.startTracing().enabled,false);
    assert.equal(runtime.traceDependency('disabled',()=>3),3);
    assert.equal(runtime.traceRequest({},response(),()=>4),4);
    assert.equal(runtime.withoutTracing(()=>5),5);
    const logs=[];const original=console.warn;console.warn=(...args)=>logs.push(args.join(' '));
    assert.equal(runtime.startTracing({enabled:true,endpoint:'https://user:PRIVATE_TOKEN@example.test/x',token:'x',serviceName:'fixture'}).enabled,false);
    console.warn=original;assert(!logs.join('').includes('PRIVATE_TOKEN'));
    const payloads=[];let status=200;
    const collector=http.createServer((req,res)=>{const chunks=[];assert.equal(req.headers.authorization,'Bearer fixture-token');req.on('data',c=>chunks.push(c));req.on('end',()=>{const data=Buffer.concat(chunks);payloads.push(JSON.parse((req.headers['content-encoding']==='gzip'?gunzipSync(data):data).toString()));res.writeHead(status);res.end('{}');});});
    await new Promise(resolve=>collector.listen(0,'127.0.0.1',resolve));
    const handle=runtime.startTracing({enabled:true,endpoint:'http://127.0.0.1:'+collector.address().port+'/v1/traces',token:'fixture-token',serviceName:'fixture',serviceVersion:'test'});
    assert(handle.enabled);assert.equal(runtime.startTracing({enabled:true}),handle);
    t.after(async()=>{await handle.shutdown();await new Promise(resolve=>collector.close(resolve));});
    await t.test('one request has one server span with a database child; secrets never exported',async()=>{
        const res=response();
        const value=runtime.traceRequest({method:'GET',url:'/users/PRIVATE_PERSON?token=PRIVATE_TOKEN',headers:{authorization:'PRIVATE_TOKEN',cookie:'PRIVATE_TOKEN'},route:{path:'/users/:id'}},res,()=>runtime.traceDependency('db.find',()=>Promise.resolve(7),{'db.system':'mongodb','db.collection.name':'users','db.namespace':'kubiq','server.port':27017,'db.statement':'PRIVATE_TOKEN','Authorization':'PRIVATE_TOKEN'}));
        assert.equal(await value,7);finish(res);await handle.forceFlush();
        const spans=flatten(payloads);assert.equal(spans.length,2);const server=spans.find(s=>s.kind===2),child=spans.find(s=>s.kind===3);assert.equal(child.parentSpanId,server.spanId);assert.equal(child.traceId,server.traceId);assert.equal(server.name,'GET /users/:id');const attributes=Object.fromEntries(child.attributes.map(item=>[item.key,item.value.stringValue??Number(item.value.intValue)]));assert.equal(attributes['db.collection.name'],'users');assert.equal(attributes['db.namespace'],'kubiq');assert.equal(attributes['server.port'],27017);assert(!JSON.stringify(payloads).includes('PRIVATE_'));
    });
    await t.test('native HTTP dependencies are parented and URL queries never exported',async()=>{
        const business=http.createServer((_req,res)=>res.end('ok'));
        await new Promise(resolve=>business.listen(0,'127.0.0.1',resolve));
        const r=response();const before=flatten(payloads).length;
        await runtime.traceRequest({method:'GET',route:{path:'/outgoing'}},r,()=>new Promise((resolve,reject)=>{http.get('http://127.0.0.1:'+business.address().port+'/x?token=PRIVATE_TOKEN',res=>{res.resume();res.on('end',resolve);}).on('error',reject);}));
        finish(r);await handle.forceFlush();await new Promise(resolve=>business.close(resolve));
        const added=flatten(payloads).slice(before);assert.equal(added.length,2);assert(added.some(s=>s.kind===3));assert(!JSON.stringify(added).includes('PRIVATE_TOKEN'));
    });
    await t.test('background tasks, excluded traffic and explicit suppression create no spans',async()=>{
        const before=flatten(payloads).length;
        const r=response();let delayed;
        runtime.traceRequest({method:'GET',url:'/api/services',headers:{}},r,()=>{delayed=new Promise(resolve=>setTimeout(()=>resolve(runtime.traceDependency('background',()=>8)),10));runtime.withoutTracing(()=>runtime.traceDependency('suppressed',()=>9));finish(r);});
        assert.equal(await delayed,8);
        for(const url of ['/health','/static/app.js','/api/apm/v1/traces','/api/telemetry/logs','/api/logs/stream'])runtime.traceRequest({method:'GET',url},response(),()=>runtime.traceDependency('excluded',()=>1));
        runtime.traceDependency('no-parent',()=>1);await handle.forceFlush();assert.equal(flatten(payloads).length,before+1);
        const count=flatten(payloads).length;await pause(30);await handle.forceFlush();assert.equal(flatten(payloads).length,count);
    });
    await t.test('handled errors, thrown/rejected dependencies and aborted requests end once',async()=>{
        const error=new TypeError('PRIVATE_TOKEN');
        const r=response(503);runtime.traceRequest({method:'POST'},r,()=>{assert.throws(()=>runtime.traceDependency('sync.fail',()=>{throw error;}),e=>e===error);});finish(r);
        const a=response();await runtime.traceRequest({},a,async()=>{await assert.rejects(runtime.traceDependency('async.fail',async()=>{throw error;}),e=>e===error);});a.emit('close');
        const b=response();assert.throws(()=>runtime.traceRequest({},b,()=>{throw error;}),e=>e===error);finish(b);
        const c=response();await assert.rejects(runtime.traceRequest({},c,async()=>{throw error;}));finish(c);
        const d=response();runtime.traceRequest({},d,()=>{assert.equal(runtime.traceDependency('invalid/name',()=>2),2);finish(d);});
        await handle.forceFlush();assert(flatten(payloads).filter(s=>s.status?.code===2).length>=4);assert(!JSON.stringify(payloads).includes('PRIVATE_TOKEN'));
    });
    await t.test('portfolio profile excludes sync while recording origin HTML',async()=>{
        getRuntime().profile='portfolio';const r=response();runtime.traceRequest({method:'GET',url:'/'},r,()=>finish(r),{route:()=>'/'});runtime.traceRequest({method:'POST',url:'/api/codex-activity'},response(),()=>1);await handle.forceFlush();assert(flatten(payloads).some(s=>s.name==='GET /'));getRuntime().profile='kubiq';
    });
    await t.test('denied and unavailable collector failures do not fail requests',async()=>{
        const warn=console.warn;console.warn=()=>{};try{status=401;const r=response();runtime.traceRequest({method:'GET'},r,()=>finish(r));await handle.forceFlush();assert(handle.diagnostics().failed>0);}finally{console.warn=warn;}
    });
    await t.test('manual command spans preserve query detail with explicit credential redaction and bounded lifetime',async()=>{
        assert.equal(runtime.beginDependency('background'),null);
        const old=process.env.KUBIQ_TRACING_QUERY_DETAILS;process.env.KUBIQ_TRACING_QUERY_DETAILS='true';
        try{
            const before=flatten(payloads).length;const r=response();
            runtime.traceRequest({method:'GET',route:{path:'/database'}},r,()=>{
                const child=runtime.beginDependency('mongodb.find',{'db.system':'mongodb'});
                child.setAttributes({'db.query.text':runtime.databaseQueryDetails({find:'users',filter:{username:'alice',password:'PRIVATE_PASSWORD'}}),'db.response.returned_rows':1});
                child.end(new TypeError('PRIVATE_ERROR'));child.end();child.setAttributes({'db.namespace':'must-not-appear'});finish(r);
            });
            await handle.forceFlush();const added=flatten(payloads).slice(before);assert.equal(added.length,2);
            const child=added.find(span=>span.kind===3);assert(child.attributes.some(item=>item.key==='db.query.text'&&item.value.stringValue.includes('alice')&&item.value.stringValue.includes('[REDACTED]')));
            assert(!JSON.stringify(added).includes('PRIVATE_'));assert(!JSON.stringify(added).includes('must-not-appear'));
        }finally{if(old===undefined)delete process.env.KUBIQ_TRACING_QUERY_DETAILS;else process.env.KUBIQ_TRACING_QUERY_DETAILS=old;}
    });
    const stopping=handle.shutdown();assert.equal(stopping,handle.shutdown());await stopping;
    assert.equal(runtime.traceRequest({},response(),()=>10),10);assert.equal(runtime.traceDependency('stopped',()=>11),11);
});
