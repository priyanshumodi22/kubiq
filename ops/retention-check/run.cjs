const {execFileSync, spawnSync} = require('node:child_process');
const path = require('node:path');
const kind = process.argv[2];
const fixtures = {
 mongo: {image:'mongo:8.0.15',port:27017,args:['--wiredTigerCacheSizeGB','0.25','--setParameter','ttlMonitorSleepSecs=1'],env:[],script:'mongo.cjs'},
 mysql: {image:'mysql:8.4',port:3306,args:[],env:['MYSQL_ROOT_PASSWORD=retention-fixture-only','MYSQL_DATABASE=kubiq_db'],script:'sql.cjs'},
 mariadb: {image:'mariadb:11.4',port:3306,args:[],env:['MARIADB_ROOT_PASSWORD=retention-fixture-only','MARIADB_DATABASE=kubiq_db'],script:'sql.cjs'},
 clickhouse: {image:'clickhouse/clickhouse-server:25.8',port:8123,args:[],env:['CLICKHOUSE_USER=fixture','CLICKHOUSE_PASSWORD=retention-fixture-only','CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1'],script:'clickhouse.cjs'}
};
const fixture = fixtures[kind]; if(!fixture) throw new Error('Choose mongo, mysql, mariadb or clickhouse');
const name = `kubiq-retention-${kind}-${process.pid}`;
const docker = args => execFileSync('docker',args,{encoding:'utf8'}).trim();
(async()=>{
 try {
  docker(['run','-d','--name',name,'--memory','1536m','--cpus','1','-p',`127.0.0.1::${fixture.port}`,...fixture.env.flatMap(value=>['-e',value]),fixture.image,...fixture.args]);
  const inspection = JSON.parse(docker(['inspect',name]))[0];
  const port = inspection.NetworkSettings.Ports[`${fixture.port}/tcp`][0].HostPort;
  let ready=false;
  for(let i=0;i<90;i++) {
   let args;
   if(kind==='mongo') args=['exec',name,'mongosh','--quiet','--eval','db.adminCommand({ping:1})'];
   else if(kind==='clickhouse') args=['exec',name,'clickhouse-client','--user','fixture','--password','retention-fixture-only','--query','SELECT 1'];
   else args=['exec',name,kind==='mysql'?'mysqladmin':'mariadb-admin','ping','--host=127.0.0.1','--password=retention-fixture-only','--silent'];
   if(spawnSync('docker',args,{stdio:'ignore'}).status===0) {ready=true;break;}
   await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!ready) throw new Error(`${kind} did not become ready`);
  const env={...process.env,COMPILED_BACKEND:path.resolve('backend/dist'),NODE_PATH:path.resolve('backend/node_modules'),APM_RETENTION_PERIOD:'5s',LOG_RETENTION_PERIOD:'7s',DB_HOST:'127.0.0.1',DB_PORT:port,DB_USER:'root',DB_PASSWORD:'retention-fixture-only',DB_NAME:'kubiq_db',FIXTURE_MONGO_URI:`mongodb://127.0.0.1:${port}/retention_fixture`,CLICKHOUSE_URL:`http://127.0.0.1:${port}`,CLICKHOUSE_USER:'fixture',CLICKHOUSE_PASSWORD:'retention-fixture-only',CLICKHOUSE_DATABASE:'default'};
  delete env.DB_PASS;
  if(kind==='mysql'||kind==='mariadb'){
   const credentials=spawnSync(process.execPath,[path.join(__dirname,'sql-credentials.cjs')],{env,stdio:'inherit',timeout:180000});
   if(credentials.status!==0)throw new Error(`${kind} credential compatibility failed (${credentials.status})`);
  }
  const result=spawnSync(process.execPath,[path.join(__dirname,fixture.script)],{env,stdio:'inherit',timeout:180000});
  if(result.status!==0) throw new Error(`${kind} fixture failed (${result.status})`);
 } finally {spawnSync('docker',['rm','-f','-v',name],{stdio:'ignore'});}
})().catch(error=>{console.error(error);process.exitCode=1;});
