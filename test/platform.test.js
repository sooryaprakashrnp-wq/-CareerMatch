const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {openDatabase,upsert,now}=require('../database');
const {createApp}=require('../server');
const {hashPassword,digest}=require('../auth');
const {rank}=require('../matcher');
const {normalizeFeed,syncFeeds}=require('../feeds');
const fixture={id:'fixture-1',source:'Curated',sourceId:'fixture-1',url:'https://example.org/job',title:'Python ML Internship',organization:'Test employer',type:'Internship',mode:'Remote',location:'India',description:'Build Python machine learning models and evaluate text retrieval.',skills:['Python','Machine Learning'],domains:['AI / ML'],eligibility:{years:[3,4],minimumCgpa:7},publishedAt:now(),deadline:null,salary:''};
const p={year:3,cgpa:8,skills:['Python','Machine Learning'],interests:['AI / ML'],preferredTypes:['Internship'],preferredModes:['Remote'],location:'India',bio:'text retrieval'};

test('ranking handles unknown requirements, exact skills and corpus relevance',()=>{
 const unrelated={...fixture,id:'design',title:'Designer',description:'Design using Figma',skills:['Figma'],domains:['UI / UX'],eligibility:{years:[],minimumCgpa:null}};
 const ranked=rank(p,[fixture,unrelated]);assert.equal(ranked[0].id,'fixture-1');assert.ok(ranked[0].score>ranked[1].score);assert.equal(ranked[1].eligibilityStatus,'check-source');assert.equal(rank({...p,year:1},[fixture])[0].eligibilityStatus,'not-met');assert.equal(rank({...p,skills:['Machine'],interests:[]},[fixture])[0].matchedSkills.length,0);
});

test('real feed normalization preserves attribution and geographic restrictions',()=>{
 const o=normalizeFeed('Remotive',{id:12,url:'https://remotive.com/remote-jobs/test',title:'React intern',company_name:'Test',description:'<script>alert(1)</script><p>React and JavaScript</p>',publication_date:'2026-01-01',candidate_required_location:'United States',tags:[]});
 assert.equal(o.location,'United States');assert.equal(o.mode,'Remote');assert.equal(o.type,'Internship');assert.ok(!o.description.includes('<'));assert.ok(!o.description.includes('alert'));assert.ok(o.skills.includes('React'));assert.throws(()=>normalizeFeed('Remotive',{id:12,url:'javascript:alert(1)'}));
});

test('sync persists success, handles failure and enforces provider cooldown',async()=>{
 const db=openDatabase(':memory:');let calls=0;
 const fetcher=async url=>{calls++;return {ok:!url.includes('remotive'),status:503,text:async()=>JSON.stringify({data:[{slug:'a',url:'https://www.arbeitnow.com/jobs/a',title:'Python intern',description:'Python',company_name:'Test',created_at:Date.now()/1000,remote:true,location:'Europe',tags:[],job_types:[]}]})};};
 await syncFeeds(db,fetcher);assert.equal(calls,2);assert.equal(db.prepare('SELECT COUNT(*) n FROM opportunities').get().n,1);assert.ok(db.prepare("SELECT error FROM feed_runs WHERE source='Remotive'").get().error);await syncFeeds(db,fetcher);assert.equal(calls,2);db.close();
});

test('complete account, profile, save and application workflow with isolation and recovery',async t=>{
 const db=openDatabase(':memory:');upsert(db,fixture);const app=createApp({db,origin:'http://localhost:3000',admins:'owner@example.org'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>{app.server.close();db.close();});const base=`http://127.0.0.1:${app.server.address().port}`;
 async function request(path,method='GET',data,session,extra={}){const r=await fetch(base+'/api'+path,{method,headers:{...(method==='GET'?{}:{'content-type':'application/json'}),...(session?{cookie:session.cookie,'x-csrf-token':session.csrf}:{}),...extra},body:method==='GET'?undefined:JSON.stringify(data||{})});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
 const account=async email=>{const r=await request('/auth/register','POST',{name:'Test user',email,password:'strong-password-123'});assert.equal(r.status,200);assert.ok(r.data.recoveryCode);return {cookie:r.cookie,csrf:r.data.csrf,code:r.data.recoveryCode};};
 assert.equal((await request('/auth/register','POST',{name:'Attack',email:'owner@example.org',password:'strong-password-123'})).status,403);
 const a=await account('a@example.org'),b=await account('b@example.org');
 assert.equal((await request('/profile','PUT',p)).status,401);
 assert.equal((await request('/profile','PUT',p,a,{'x-csrf-token':'wrong'})).status,403);
 assert.equal((await request('/profile','PUT',p,a,{origin:'https://evil.example'})).status,403);
 assert.equal((await request('/profile','PUT',{...p,cgpa:11},a)).status,400);
 assert.equal((await request('/profile','PUT',p,a)).status,200);
 const listing=await request('/opportunities?type=Internship','GET',null,a);assert.equal(listing.data.total,1);assert.ok(listing.data.items[0].score>0);assert.equal(listing.data.items[0].eligibilityStatus,'meets-listed');
 assert.equal((await request('/saved/fixture-1','PUT',{},a)).status,200);
 assert.equal((await request('/applications/fixture-1','PUT',{status:'Applied',notes:'Submitted externally'},a)).status,200);
 assert.equal((await request('/applications/fixture-1','PUT',{status:'Interview',notes:'Prepare models'},a)).status,200);
 const own=await request('/dashboard','GET',null,a),other=await request('/dashboard','GET',null,b);assert.equal(own.data.saved.length,1);assert.equal(own.data.applications[0].status,'Interview');assert.equal(other.data.saved.length,0);assert.equal(other.data.applications.length,0);
 assert.equal((await request('/admin/status','GET',null,a)).status,403);
 const exportData=await request('/export','GET',null,a);assert.ok(!JSON.stringify(exportData.data).includes('password'));assert.ok(!JSON.stringify(exportData.data).includes(a.code));
 assert.equal((await request('/auth/login','POST',{email:'a@example.org',password:'incorrect'})).status,401);
 const reset=await request('/auth/recover','POST',{email:'a@example.org',password:'new-strong-password-123',recoveryCode:a.code});assert.equal(reset.status,200);assert.notEqual(reset.data.recoveryCode,a.code);
 assert.equal((await request('/dashboard','GET',null,a)).status,401);
 assert.equal((await request('/auth/recover','POST',{email:'a@example.org',password:'third-password-123',recoveryCode:a.code})).status,401);
 const login=await request('/auth/login','POST',{email:'a@example.org',password:'new-strong-password-123'});assert.equal(login.status,200);
 const c={cookie:login.cookie,csrf:login.data.csrf};assert.equal((await request('/dashboard','GET',null,c)).data.saved.length,1);
 await request('/saved/fixture-1','DELETE',{},c);await request('/applications/fixture-1','DELETE',{},c);assert.equal((await request('/dashboard','GET',null,c)).data.saved.length,0);
 await request('/auth/logout','POST',{},c);assert.equal((await request('/dashboard','GET',null,c)).status,401);
 // Provisioned administrators can curate listings; ordinary signup cannot claim the reserved email.
 db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?,?)').run(crypto.randomUUID(),'owner@example.org','Owner',await hashPassword('owner-password-123'),digest('test-recovery'),'{}',now());
 const ar=await request('/auth/login','POST',{email:'owner@example.org',password:'owner-password-123'}),admin={cookie:ar.cookie,csrf:ar.data.csrf};
 const cr=await request('/admin/opportunities','POST',{...fixture,title:'Real source test',url:'https://example.org/new',minimumCgpa:7,years:['3'],active:false},admin);assert.equal(cr.status,201);assert.equal((await request('/opportunities')).data.total,1);
 assert.equal((await request('/admin/opportunities/'+cr.data.id,'PUT',{...fixture,url:'https://example.org/new',minimumCgpa:7,years:['3'],active:true},admin)).status,200);
 assert.equal((await request('/opportunities')).data.total,2);
 assert.equal((await request('/admin/opportunities','POST',{...fixture,url:'javascript:alert(1)'},admin)).status,400);
});
