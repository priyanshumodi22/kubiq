const c=new Mongo(process.env.TARGET_URI), a=c.getDB('admin');
const action=process.env.MONGODB_ACTION;
if(action==='pause-ttl'||action==='resume-ttl'){
 const result=a.runCommand({setParameter:1,ttlMonitorEnabled:action==='resume-ttl'});
 if(result.ok!==1)throw Error('TTL operation failed');print(JSON.stringify({action,ok:true}));
}else{
 const s=a.serverStatus(),p=a.runCommand({getParameter:1,ttlMonitorEnabled:1,maxIndexBuildMemoryUsageMegabytes:1});
 print(JSON.stringify({version:a.runCommand({buildInfo:1}).version,ttlMonitorEnabled:p.ttlMonitorEnabled,indexBuildMemoryMiB:p.maxIndexBuildMemoryUsageMegabytes,connections:s.connections.current,usingPerCpuCaches:s.tcmalloc?.usingPerCpuCaches??s.tcmalloc?.usingPerCPUCaches}));
}
