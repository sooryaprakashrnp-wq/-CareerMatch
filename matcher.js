// Content-based recommender: corpus-aware TF-IDF cosine + explicit profile signals.
const stop=new Set('the a an and or for to in of with on is are be as at your our you will this that from we have can all it by'.split(' '));
const normalize=s=>String(s||'').toLowerCase().replace(/node\.js/g,'nodejs').replace(/react\.js/g,'react').replace(/postgresql/g,'postgres').replace(/javascript/g,'js').replace(/typescript/g,'ts');
const tokens=s=>(normalize(s).match(/[a-z0-9+#]+/g)||[]).filter(t=>!stop.has(t)&&t.length>1);
const terms=o=>tokens([o.title,o.organization,o.description,...o.skills,...o.domains].join(' '));
function rank(profile,items){
 const docs=items.map(terms), df=new Map();
 for(const doc of docs)for(const t of new Set(doc))df.set(t,(df.get(t)||0)+1);
 const vector=doc=>{const v=new Map();for(const t of doc)v.set(t,(v.get(t)||0)+1);for(const [t,n]of v)v.set(t,(1+Math.log(n))*(Math.log((items.length+1)/((df.get(t)||0)+1))+1));return v;};
 const q=vector(tokens([...profile.skills,...profile.interests,profile.bio||''].join(' ')));
 const norm=v=>Math.sqrt([...v.values()].reduce((s,n)=>s+n*n,0)); const qnorm=norm(q);
 return items.map((o,i)=>{
  const v=vector(docs[i]); let dot=0;for(const[t,w]of q)dot+=w*(v.get(t)||0);const semantic=qnorm&&norm(v)?dot/(qnorm*norm(v)):0;
  const matched=o.skills.filter(s=>profile.skills.some(p=>normalize(p)===normalize(s)));
  const interest=o.domains.filter(s=>profile.interests.some(p=>normalize(p)===normalize(s)));
  const required=o.eligibility||{}, issues=[];
  if(required.years?.length&&profile.year&&!required.years.includes(profile.year))issues.push(`Study year requirement: ${required.years.join(', ')}`);
  if(required.minimumCgpa!=null&&profile.cgpa!=null&&profile.cgpa<required.minimumCgpa)issues.push(`Minimum CGPA: ${required.minimumCgpa}`);
  const unknown=(!required.years?.length&&required.minimumCgpa==null)||(required.years?.length&&!profile.year)||(required.minimumCgpa!=null&&profile.cgpa==null);
  const signals={content:semantic,skills:o.skills.length?matched.length/o.skills.length:0,interests:o.domains.length?interest.length/o.domains.length:0,type:profile.preferredTypes.includes(o.type)?1:0,mode:profile.preferredModes.includes(o.mode)?1:0,location:profile.location&&normalize(o.location).includes(normalize(profile.location))?1:0};
  const score=Math.round(100*(.35*signals.content+.30*signals.skills+.15*signals.interests+.08*signals.type+.07*signals.mode+.05*signals.location));
  const reasons=[];if(matched.length)reasons.push(`Skills in common: ${matched.join(', ')}`);if(interest.length)reasons.push(`Interests: ${interest.join(', ')}`);if(signals.type)reasons.push(`Preferred ${o.type.toLowerCase()}`);if(signals.mode)reasons.push(`Preferred ${o.mode.toLowerCase()} format`);if(signals.content>.05)reasons.push('Description is relevant to your profile');
  if(!reasons.length)reasons.push('Add relevant skills and interests to improve your recommendations');
  return {...o,score,signals,reasons,matchedSkills:matched,skillGaps:o.skills.filter(s=>!matched.includes(s)),eligibilityStatus:issues.length?'not-met':unknown?'check-source':'meets-listed',eligibilityIssues:issues};
 }).sort((a,b)=>Number(a.eligibilityStatus==='not-met')-Number(b.eligibilityStatus==='not-met')||b.score-a.score||b.publishedAt.localeCompare(a.publishedAt));
}
module.exports={rank,normalize};
