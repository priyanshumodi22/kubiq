const c=new Mongo(process.env.TARGET_URI),d=c.getDB('kubiq'),a=c.getDB('admin');
if(!d.getRole('kubiq_retention'))d.createRole({role:'kubiq_retention',privileges:[{resource:{db:'kubiq',collection:'apmspans'},actions:['collMod']},{resource:{db:'kubiq',collection:'logs'},actions:['collMod']}],roles:[]});
d.grantRolesToUser('kubiq_app',[{role:'kubiq_retention',db:'kubiq'}]);
a.updateUser('kubiq_backup',{roles:[{role:'read',db:'kubiq'}]});
print(JSON.stringify({appRole:'readWrite plus collMod on apmspans/logs only',backupRole:'read on kubiq only'}));
