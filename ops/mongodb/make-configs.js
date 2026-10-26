const fs = require('fs'), {URL}=require('url');
for (const [name, env] of [['source','SOURCE_URI'], ['target','TARGET_URI'], ['backup','BACKUP_URI']]) {
  if (!process.env[env]) continue;
  const uri=new URL(process.env[env]);
  if(name==='target') uri.pathname='/';
  if (process.env[env]) fs.writeFileSync('/work/'+name+'.yml', 'uri: '+JSON.stringify(uri.toString())+'\n', {mode:0o600});
}
print('Private tool configuration prepared');
