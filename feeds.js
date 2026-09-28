const crypto=require('node:crypto');
const {upsert,now}=require('./database');
const FEEDS={Arbeitnow:'https://www.arbeitnow.com/api/job-board-api',Remotive:'https://remotive.com/api/remote-jobs'};
const plain=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,15000);
const SKILLS=['Python','JavaScript','TypeScript','React','Node.js','SQL','PostgreSQL','Docker','Kubernetes','AWS','Azure','Git','Figma','Machine Learning','PyTorch','TensorFlow','Java','C++','Go','Rust','Linux','Excel','Pandas','Data Analysis','User Research','Accessibility','Security'];
function extractSkills(s){const t=String(s).toLowerCase();return SKILLS.filter(k=>new RegExp('(?:^|[^a-z0-9])'+k.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:$|[^a-z0-9])').test(t));}
function domains(s){const t=String(s).toLowerCase(),a=[];if(/machine learning|artificial intelligence|pytorch|tensorflow|\bai\b/.test(t))a.push('AI / ML');if(/data|analytics|sql/.test(t))a.push('Data Science');if(/react|frontend|backend|web|software/.test(t))a.push('Web Development');if(/design|figma|ux/.test(t))a.push('UI / UX');if(/cloud|devops|kubernetes|aws|azure/.test(t))a.push('Cloud');if(/security|cyber/.test(t))a.push('Cybersecurity');return a;}
function normalizeFeed(source,row){
 const url=new URL(row.url);if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid listing link');
 const sourceId=String(source==='Arbeitnow'?row.slug:row.id);if(!sourceId||sourceId==='undefined')throw Error('Missing ID');
 const description=plain(row.description),title=plain(row.title),blob=[title,description,...(row.tags||[])].join(' ');
 const stamp=source==='Arbeitnow'?new Date(Number(row.created_at)*1000):new Date(row.publication_date);
 return {id:crypto.createHash('sha256').update(source+':'+sourceId).digest('hex').slice(0,24),source,sourceId,url:url.href,title,organization:plain(row.company_name),description,skills:extractSkills(blob),domains:domains(blob),type:/intern|praktikum/i.test(title+' '+(row.job_type||'')+' '+(row.job_types||[]).join(' '))?'Internship':'Job',mode:source==='Remotive'||row.remote?'Remote':'On-site',location:plain(source==='Remotive'?row.candidate_required_location:row.location)||'Check source',salary:plain(row.salary),deadline:null,eligibility:{years:[],minimumCgpa:null},publishedAt:Number.isFinite(stamp.getTime())?stamp.toISOString():now()};
}
let running=false;
async function syncFeeds(db,fetcher=fetch){
 if(running)return {busy:true};running=true;
 const results=[];
 try{for(const[source,url]of Object.entries(FEEDS)){
  const previous=db.prepare('SELECT * FROM feed_runs WHERE source=?').get(source);
  if(previous?.attempted_at&&Date.now()-Date.parse(previous.attempted_at)<6*3600000){results.push({source,skipped:true,message:'Six-hour provider cooldown'});continue;}
  db.prepare('INSERT INTO feed_runs(source,attempted_at) VALUES(?,?) ON CONFLICT(source) DO UPDATE SET attempted_at=excluded.attempted_at').run(source,now());
  try{
   const r=await fetcher(url,{signal:AbortSignal.timeout(20000),headers:{accept:'application/json','user-agent':'CareerMatch/2.0'}});
   if(!r.ok)throw Error(`Provider returned HTTP ${r.status}`);
   const raw=await r.text();if(raw.length>25_000_000)throw Error('Provider response too large');
   const data=JSON.parse(raw),rows=source==='Arbeitnow'?data.data:data.jobs;if(!Array.isArray(rows))throw Error('Unexpected provider schema');
   let count=0;db.exec('BEGIN');
   try{for(const row of rows){try{upsert(db,normalizeFeed(source,row));count++;}catch(e){if(e.code?.startsWith('ERR_SQLITE'))throw e;}}
    if(rows.length&&count===0)throw Error('No valid listings in provider response');
    db.prepare('UPDATE opportunities SET active=0 WHERE source=? AND seen_at<?').run(source,new Date(Date.now()-14*86400000).toISOString());
    db.prepare('UPDATE feed_runs SET succeeded_at=?,count=?,error=NULL WHERE source=?').run(now(),count,source);db.exec('COMMIT');
   }catch(e){db.exec('ROLLBACK');throw e;}
   results.push({source,count});
  }catch(error){const message=String(error.message).slice(0,200);db.prepare('UPDATE feed_runs SET error=? WHERE source=?').run(message,source);results.push({source,error:message});}
 }}finally{running=false;}return {results};
}
module.exports={syncFeeds,normalizeFeed,extractSkills,plain};
