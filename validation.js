const TYPES=['Internship','Hackathon','Fellowship','Job'];
const MODES=['Remote','Online','Hybrid','On-site'];
function fail(message,status=400){const e=new Error(message);e.status=status;throw e;}
function text(value,max=200){return String(value??'').trim().slice(0,max);}
function list(value){return [...new Set((Array.isArray(value)?value:[]).map(v=>text(v,60)).filter(Boolean))].slice(0,30);}
function profile(value={}) {
  const year=value.year===''||value.year==null?null:Number(value.year);
  const cgpa=value.cgpa===''||value.cgpa==null?null:Number(value.cgpa);
  if(year!==null&&(!Number.isInteger(year)||year<1||year>4))fail('Select a valid year of study.');
  if(cgpa!==null&&(!Number.isFinite(cgpa)||cgpa<0||cgpa>10))fail('CGPA must be between 0 and 10.');
  return {year,cgpa,skills:list(value.skills),interests:list(value.interests),location:text(value.location,100),bio:text(value.bio,2000),preferredTypes:list(value.preferredTypes).filter(v=>TYPES.includes(v)),preferredModes:list(value.preferredModes).filter(v=>MODES.includes(v))};
}
function safeUrl(value){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password)fail('Use an HTTPS source URL without credentials.');return u.href;}catch{fail('Enter a valid HTTPS source URL.');}}
function password(value){if(typeof value!=='string'||value.length<12||value.length>128)fail('Use a password with 12–128 characters.');return value;}
function email(value){const e=text(value,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))fail('Enter a valid email address.');return e;}
function opportunity(value){
  if(!text(value.title)||!text(value.organization))fail('Title and organization are required.');
  if(!TYPES.includes(value.type)||!MODES.includes(value.mode))fail('Select an opportunity type and work mode.');
  const deadline=text(value.deadline,10)||null;
  if(deadline&&(!/^\d{4}-\d{2}-\d{2}$/.test(deadline)||!Number.isFinite(Date.parse(deadline))||new Date(deadline).toISOString().slice(0,10)!==deadline))fail('Enter a valid deadline.');
  const minimumCgpa=value.minimumCgpa===''||value.minimumCgpa==null?null:Number(value.minimumCgpa);
  if(minimumCgpa!==null&&(!Number.isFinite(minimumCgpa)||minimumCgpa<0||minimumCgpa>10))fail('Invalid minimum CGPA.');
  return {title:text(value.title),organization:text(value.organization),type:value.type,mode:value.mode,location:text(value.location)||'Check source',description:text(value.description,15000),skills:list(value.skills),domains:list(value.domains),url:safeUrl(value.url),deadline,salary:text(value.salary),eligibility:{years:list(value.years).map(Number).filter(n=>Number.isInteger(n)&&n>=1&&n<=4),minimumCgpa},publishedAt:new Date().toISOString()};
}
module.exports={TYPES,MODES,fail,text,list,profile,safeUrl,password,email,opportunity};
