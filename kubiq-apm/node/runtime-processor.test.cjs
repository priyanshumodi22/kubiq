const assert = require('node:assert/strict');
const { test } = require('node:test');
const { BoundedProcessor } = require('./runtime-processor');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function exporter(exportFn = (_batch, done) => done({ code: 0 }), shutdown = async () => {}) { return { export: exportFn, shutdown }; }
test('bounded serial batches preserve queue accounting and shutdown identity', async () => {
    const sizes=[]; let concurrent=0,max=0;
    const p=new BoundedProcessor(exporter((batch,done)=>{ concurrent++;max=Math.max(max,concurrent);sizes.push(batch.length);setTimeout(()=>{concurrent--;done({code:0});done({code:1});},2); }),{maxQueueSize:3,maxExportBatchSize:2,report:()=>{},scheduledDelayMillis:10000});
    p.onStart(); for(let i=0;i<4;i++)p.onEnd({i});
    const a=p.forceFlush();assert.equal(a,p.forceFlush());await a;
    assert.deepEqual(sizes,[2,1]);assert.equal(max,1);assert.equal(p.counts().exported,3);assert.equal(p.counts().dropped,1);
    const stop=p.shutdown();assert.equal(stop,p.shutdown());await stop;p.onEnd({});assert.equal(p.counts().dropped,2);
});
test('export failures and throwing diagnostics cannot escape to the application', async () => {
    const reports=[];const p=new BoundedProcessor(exporter(()=>{throw Error('PRIVATE_TOKEN');}),{report:counts=>{reports.push(counts);throw Error('bad sink');}});
    p.onEnd({});await p.forceFlush();p.onEnd({});await p.forceFlush();
    assert.equal(p.counts().failed,2);assert.equal(reports.length,1);assert(!JSON.stringify(reports).includes('PRIVATE_TOKEN'));await p.shutdown();
});
test('timeouts, overflow during export and a hung exporter shutdown are bounded', async () => {
    const p=new BoundedProcessor(exporter(()=>{},()=>new Promise(()=>{})),{timeoutMillis:15,maxQueueSize:2,maxExportBatchSize:1,report:()=>{}});
    p.onEnd({});p.onEnd({});const flushing=p.forceFlush();p.onEnd({});assert.equal(p.counts().dropped,1);
    const hold=pause(60);await flushing;const start=Date.now();await p.shutdown();assert(Date.now()-start<100);await hold;
    assert(p.counts().failed>=1);assert.equal(p.counts().queued,0);
});
test('periodic export drains an eligible queue and failed callback is counted', async()=>{
    const p=new BoundedProcessor(exporter((_batch,done)=>done({code:1})),{scheduledDelayMillis:2,report:()=>{}});p.onEnd({});await pause(20);assert.equal(p.counts().failed,1);await p.shutdown();
});
