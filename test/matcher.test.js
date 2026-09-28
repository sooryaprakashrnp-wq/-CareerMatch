const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {openDatabase,upsert,catalog}=require('../database');
test('opportunities persist across database restarts and expired deadlines are excluded',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'careermatch-'));const filename=path.join(folder,'test.db');
 try{let db=openDatabase(filename);const base={id:'persist',source:'Curated',sourceId:'persist',url:'https://example.org/persist',title:'Persistence fixture',publishedAt:new Date().toISOString(),deadline:null};upsert(db,base);upsert(db,{...base,id:'expired',sourceId:'expired',url:'https://example.org/expired',deadline:'2000-01-01'});db.close();db=openDatabase(filename);assert.equal(catalog(db).length,1);assert.equal(catalog(db)[0].id,'persist');db.close();}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
