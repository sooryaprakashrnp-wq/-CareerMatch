const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {openDatabase,catalog,upsert,now}=require('./database');
const A=require('./auth');
const V=require('./validation');
const {rank}=require('./matcher');
const {syncFeeds}=require('./feeds');
function createApp(options={}){
 const db=options.db||openDatabase();
 const production=options.production??process.env.NODE_ENV==='production';
 const origin=options.origin||process.env.APP_ORIGIN||'http://localhost:3000';
 if(production&&!origin.startsWith('https://'))throw Error('Production requires an HTTPS APP_ORIGIN.');
 const admins=(options.admins||process.env.ADMIN_EMAILS||'').split(',').map(s=>s.trim().toLowerCase());
 const admin=s=>!!s&&admins.includes(s.email);
 const limits=new Map();
 const authWindow=15*60*1000;
 function limiter(key,max){const t=Date.now();if(limits.size>10000)for(const[k,v]of limits)if(v.until<t)limits.delete(k);let v=limits.get(key);if(!v||v.until<t){v={count:0,until:t+authWindow};limits.set(key,v);}if(++v.count>max)V.fail('Too many attempts. Try again in 15 minutes.',429);}
 const json=(res,status,data,headers={})=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers});res.end(JSON.stringify(data));};
 async function body(req){let bytes=0,parts=[];for await(const part of req){bytes+=part.length;if(bytes>64000)V.fail('Request is too large.',413);parts.push(part);}try{const b=JSON.parse(Buffer.concat(parts).toString());if(!b||typeof b!=='object'||Array.isArray(b))V.fail('Expected a JSON object.');return b;}catch(e){V.fail(e.status?e.message:'Invalid JSON.');}}
 const publicUser=s=>({id:s.user_id||s.id,email:s.email,name:s.name,profile:JSON.parse(s.profile||'{}'),admin:admin(s)});
 function authResponse(res,user,recovery){const s=A.createSession(db,user.id);json(res,200,{user:publicUser(user),csrf:s.csrf,...(recovery?{recoveryCode:recovery}:{})},{'set-cookie':A.cookie(s.token,production)});}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('x-content-type-options','nosniff');res.setHeader('referrer-policy','strict-origin-when-cross-origin');res.setHeader('x-frame-options','DENY');
  res.setHeader('content-security-policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(production)res.setHeader('strict-transport-security','max-age=31536000');
  try{
   const url=new URL(req.url,origin),route=url.pathname,method=req.method;
   const mutating=!['GET','HEAD'].includes(method);
   if(mutating){if(req.headers['content-type']?.split(';')[0]!=='application/json')V.fail('Use application/json.',415);if(req.headers.origin&&req.headers.origin!==origin)V.fail('Origin not allowed.',403);if(req.headers['sec-fetch-site']==='cross-site')V.fail('Cross-site request rejected.',403);}
   const session=A.getSession(db,req);
   if(mutating&&session&&req.headers['x-csrf-token']!==session.csrf)V.fail('Session protection failed. Refresh and retry.',403);
   const userRequired=()=>{if(!session)V.fail('Sign in to continue.',401);};
   const adminRequired=()=>{userRequired();if(!admin(session))V.fail('Administrator access required.',403);};
   if(route==='/api/health'&&method==='GET')return json(res,200,{status:'ok',version:'2.0.0'});
   if(route==='/api/auth/me'&&method==='GET')return json(res,200,{user:session?publicUser(session):null,csrf:session?.csrf||null});
   if(route.startsWith('/api/auth/')&&method==='POST'){
    const b=await body(req);limiter('auth-ip:'+req.socket.remoteAddress,60);
    if(['login','recover'].some(s=>route.endsWith('/'+s)))limiter('auth-email:'+V.email(b.email),10);
    if(route==='/api/auth/register'){
     const email=V.email(b.email),password=V.password(b.password),name=V.text(b.name,80);if(name.length<2)V.fail('Enter your name.');if(admins.includes(email))V.fail('This administrator address must be provisioned by the deployment owner.',403);
     if(db.prepare('SELECT id FROM users WHERE email=?').get(email))V.fail('Unable to create this account. Try signing in or recovering access.',409);
     const recovery=crypto.randomBytes(24).toString('base64url');
     const user={id:crypto.randomUUID(),email,name,password:await A.hashPassword(password),recovery:A.digest(recovery),profile:'{}',created_at:now()};
     try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(user.id,email,name,user.password,user.recovery,user.profile,user.created_at);}catch{V.fail('Unable to create this account.',409);}
     return authResponse(res,user,recovery);
    }
    if(route==='/api/auth/login'){
     const user=db.prepare('SELECT * FROM users WHERE email=?').get(V.email(b.email));const password=String(b.password??'').slice(0,129);
     if(!user||!(await A.verifyPassword(password,user.password)))V.fail('Email or password is incorrect.',401);
     return authResponse(res,user);
    }
    if(route==='/api/auth/recover'){
     const user=db.prepare('SELECT * FROM users WHERE email=?').get(V.email(b.email));const code=V.text(b.recoveryCode,200);
     if(!user||A.digest(code)!==user.recovery)V.fail('Email or recovery code is incorrect.',401);
     const password=await A.hashPassword(V.password(b.password)),recovery=crypto.randomBytes(24).toString('base64url');
     db.exec('BEGIN');try{db.prepare('UPDATE users SET password=?,recovery=? WHERE id=?').run(password,A.digest(recovery),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
     return authResponse(res,user,recovery);
    }
    if(route==='/api/auth/logout'){if(session)db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);return json(res,200,{ok:true},{'set-cookie':A.cookie('',production,true)});}
    if(route==='/api/auth/password'){
     userRequired();const user=db.prepare('SELECT * FROM users WHERE id=?').get(session.user_id);if(!(await A.verifyPassword(String(b.currentPassword??'').slice(0,129),user.password)))V.fail('Current password is incorrect.',401);
     db.prepare('UPDATE users SET password=? WHERE id=?').run(await A.hashPassword(V.password(b.password)),user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);return authResponse(res,user);
    }
   }
   if(route==='/api/profile'&&method==='PUT'){userRequired();const b=await body(req),p=V.profile(b);db.prepare('UPDATE users SET profile=? WHERE id=?').run(JSON.stringify(p),session.user_id);return json(res,200,{profile:p});}
   if(route==='/api/opportunities'&&method==='GET'){
    let items=catalog(db);const profile=V.profile(session?JSON.parse(session.profile):{});items=rank(profile,items);
    const q=V.text(url.searchParams.get('q'),200).toLowerCase(),type=url.searchParams.get('type'),mode=url.searchParams.get('mode'),location=V.text(url.searchParams.get('location'),100).toLowerCase(),source=url.searchParams.get('source');
    if(q)items=items.filter(o=>[o.title,o.organization,o.description,...o.skills].join(' ').toLowerCase().includes(q));if(type)items=items.filter(o=>o.type===type);if(mode)items=items.filter(o=>o.mode===mode);if(source)items=items.filter(o=>o.source===source);if(location)items=items.filter(o=>o.location.toLowerCase().includes(location));if(url.searchParams.get('hideIneligible')==='true')items=items.filter(o=>o.eligibilityStatus!=='not-met');
    if(url.searchParams.get('sort')==='newest')items.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    const page=Math.max(1,Math.min(10000,Number.parseInt(url.searchParams.get('page'))||1)),pageSize=12;
    const saved=session?new Set(db.prepare('SELECT opportunity_id FROM saved WHERE user_id=?').all(session.user_id).map(o=>o.opportunity_id)):new Set();
    return json(res,200,{items:items.slice((page-1)*pageSize,page*pageSize).map(o=>({...o,saved:saved.has(o.id)})),total:items.length,page,pageSize,personalized:profile.skills.length>0||profile.interests.length>0,sources:db.prepare('SELECT * FROM feed_runs').all()});
   }
   if(route==='/api/dashboard'&&method==='GET'){
    userRequired();const rows=db.prepare('SELECT payload,active,seen_at FROM opportunities WHERE id IN (SELECT opportunity_id FROM saved WHERE user_id=? UNION SELECT opportunity_id FROM applications WHERE user_id=?)').all(session.user_id,session.user_id);
    const all=rank(V.profile(JSON.parse(session.profile)),rows.map(r=>({...JSON.parse(r.payload),active:!!r.active,lastSeen:r.seen_at})));
    const savedIds=new Set(db.prepare('SELECT opportunity_id FROM saved WHERE user_id=?').all(session.user_id).map(r=>r.opportunity_id));
    const applications=db.prepare('SELECT * FROM applications WHERE user_id=? ORDER BY updated_at DESC').all(session.user_id).map(a=>({...a,opportunity:all.find(o=>o.id===a.opportunity_id)}));
    return json(res,200,{saved:all.filter(o=>savedIds.has(o.id)),applications});
   }
   const savedRoute=route.match(/^\/api\/saved\/([a-zA-Z0-9-]+)$/),applicationRoute=route.match(/^\/api\/applications\/([a-zA-Z0-9-]+)$/);
   if(savedRoute||applicationRoute){
    userRequired();const id=(savedRoute||applicationRoute)[1];if(!db.prepare('SELECT id FROM opportunities WHERE id=?').get(id))V.fail('Opportunity not found.',404);
    if(savedRoute&&method==='PUT'){db.prepare('INSERT OR IGNORE INTO saved VALUES(?,?,?)').run(session.user_id,id,now());return json(res,200,{ok:true});}
    if(savedRoute&&method==='DELETE'){db.prepare('DELETE FROM saved WHERE user_id=? AND opportunity_id=?').run(session.user_id,id);return json(res,200,{ok:true});}
    if(applicationRoute&&method==='PUT'){const b=await body(req);if(!['Planned','Applied','Interview','Offer','Rejected','Withdrawn'].includes(b.status))V.fail('Invalid application status.');db.prepare('INSERT INTO applications VALUES(?,?,?,?,?) ON CONFLICT(user_id,opportunity_id) DO UPDATE SET status=excluded.status,notes=excluded.notes,updated_at=excluded.updated_at').run(session.user_id,id,b.status,V.text(b.notes,3000),now());return json(res,200,{ok:true});}
    if(applicationRoute&&method==='DELETE'){db.prepare('DELETE FROM applications WHERE user_id=? AND opportunity_id=?').run(session.user_id,id);return json(res,200,{ok:true});}
   }
   if(route==='/api/export'&&method==='GET'){userRequired();return json(res,200,{user:publicUser(session),saved:db.prepare('SELECT opportunity_id,created_at FROM saved WHERE user_id=?').all(session.user_id),applications:db.prepare('SELECT opportunity_id,status,notes,updated_at FROM applications WHERE user_id=?').all(session.user_id)},{'content-disposition':'attachment; filename="careermatch-export.json"'});}
   if(route.startsWith('/api/admin/')){
    adminRequired();
    if(route==='/api/admin/status'&&method==='GET')return json(res,200,{users:db.prepare('SELECT COUNT(*) n FROM users').get().n,opportunities:catalog(db).length,sources:db.prepare('SELECT * FROM feed_runs').all(),manual:db.prepare("SELECT payload,active FROM opportunities WHERE source='Curated'").all().map(r=>({...JSON.parse(r.payload),active:!!r.active}))});
    if(route==='/api/admin/sync'&&method==='POST')return json(res,200,await syncFeeds(db));
    if(route==='/api/admin/opportunities'&&method==='POST'){const b=await body(req),o=V.opportunity(b),id=crypto.randomUUID();upsert(db,{...o,id,source:'Curated',sourceId:id});if(b.active===false)db.prepare('UPDATE opportunities SET active=0 WHERE id=?').run(id);return json(res,201,{id});}
    const edit=route.match(/^\/api\/admin\/opportunities\/([a-zA-Z0-9-]+)$/);
    if(edit&&method==='PUT'){const old=db.prepare("SELECT payload FROM opportunities WHERE id=? AND source='Curated'").get(edit[1]);if(!old)V.fail('Curated opportunity not found.',404);const b=await body(req);upsert(db,{...JSON.parse(old.payload),...V.opportunity(b)});if(b.active===false)db.prepare('UPDATE opportunities SET active=0 WHERE id=?').run(edit[1]);return json(res,200,{ok:true});}
   }
   if(route.startsWith('/api/'))return json(res,404,{error:'Endpoint not found.'});
   if(!['GET','HEAD'].includes(method))return json(res,405,{error:'Method not allowed.'});
   const staticFiles={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css'};
   if(!staticFiles[route])return json(res,404,{error:'Page not found.'});
   const file=path.join(__dirname,'public',staticFiles[route]);res.writeHead(200,{'content-type':{'html':'text/html','css':'text/css','js':'text/javascript'}[file.split('.').pop()]+'; charset=utf-8','cache-control':'no-cache'});res.end(method==='HEAD'?undefined:fs.readFileSync(file));
  }catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Something went wrong. Please try again.'});else res.end();if(!e.status)console.error('Request failed:',e.message);}
 });
 return {server,db};
}
if(require.main===module){const app=createApp();const port=Number(process.env.PORT)||3000;app.server.listen(port,'0.0.0.0',()=>console.log(`CareerMatch at http://localhost:${port}`));
 let interval;if(process.env.SYNC_ENABLED!=='false'){syncFeeds(app.db).then(r=>console.log('Feed sync:',JSON.stringify(r)));interval=setInterval(()=>syncFeeds(app.db).catch(e=>console.error(e.message)),6*3600000);interval.unref();}
 const shutdown=()=>{clearInterval(interval);app.server.close(()=>{app.db.close();process.exit(0);});};process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
module.exports={createApp};
