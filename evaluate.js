// Small deterministic relevance regression fixture, NOT a real-world hiring benchmark.
const {rank}=require('./matcher');
const common={source:'Evaluation fixture',eligibility:{years:[],minimumCgpa:null},publishedAt:'2026-01-01',mode:'Remote',type:'Internship',location:'India'};
const jobs=[
 {...common,id:'ml',title:'Machine Learning Intern',organization:'Fixture',description:'Python machine learning model evaluation and PyTorch research',skills:['Python','PyTorch','Machine Learning'],domains:['AI / ML']},
 {...common,id:'design',title:'Product Design Intern',organization:'Fixture',description:'Figma usability research interface design',skills:['Figma','User Research'],domains:['UI / UX']},
 {...common,id:'web',title:'Frontend Intern',organization:'Fixture',description:'React JavaScript accessible web applications',skills:['React','JavaScript'],domains:['Web Development']}
];
const queries=[{skills:['Python','PyTorch'],interests:['AI / ML'],relevant:'ml'},{skills:['Figma','User Research'],interests:['UI / UX'],relevant:'design'},{skills:['React','JavaScript'],interests:['Web Development'],relevant:'web'}];
let hits=0,mrr=0;for(const q of queries){const ranked=rank({...q,preferredTypes:['Internship'],preferredModes:['Remote'],location:'India'},jobs);const position=ranked.findIndex(o=>o.id===q.relevant)+1;hits+=position===1?1:0;mrr+=1/position;}
console.log(JSON.stringify({dataset:'3 hand-authored regression queries; not a production benchmark',queries:queries.length,precisionAt1:hits/queries.length,meanReciprocalRank:mrr/queries.length},null,2));
