const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const readline=require('node:readline/promises');
const {Writable}=require('node:stream');
const {backup}=require('node:sqlite');
const {openDatabase,now}=require('./database');
const {hashPassword,digest}=require('./auth');
const {syncFeeds}=require('./feeds');
const V=require('./validation');
(async()=>{
 const db=openDatabase();
 try{
  if(process.argv[2]==='sync'){console.log(JSON.stringify(await syncFeeds(db),null,2));return;}
  if(process.argv[2]==='backup'){fs.mkdirSync('backups',{recursive:true,mode:0o700});const name=path.join('backups',`careermatch-${Date.now()}.db`);await backup(db,name);fs.chmodSync(name,0o600);console.log(`Backup saved: ${name}`);return;}
  if(process.argv[2]!=='admin')throw Error('Usage: npm run create-admin | npm run sync | npm run backup');
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  const email=V.email(await rl.question('Administrator email: '));
  if(!(process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase()).includes(email)){rl.close();throw Error('Add this email to ADMIN_EMAILS in .env first.');}
  if(db.prepare('SELECT id FROM users WHERE email=?').get(email)){rl.close();throw Error('Account already exists. Use account recovery; provisioning never overwrites users.');}
  const name=V.text(await rl.question('Name: '),80);rl.close();
  const mute=new Writable({write(chunk,encoding,callback){callback();}});
  const secret=readline.createInterface({input:process.stdin,output:mute,terminal:true});
  process.stdout.write('Password (12+ characters; input hidden): ');const password=V.password(await secret.question(''));secret.close();process.stdout.write('\n');
  const recovery=crypto.randomBytes(24).toString('base64url');
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),email,name,await hashPassword(password),digest(recovery),'{}',now());
  console.log('Administrator created. Keep this recovery code private; it is shown once:\n'+recovery);
 }finally{db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});
