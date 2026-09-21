import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const dependencyRequire=createRequire(new URL('../../xrossstars-video-maker/package.json',import.meta.url));
const {default:puppeteer}=await import(pathToFileURL(dependencyRequire.resolve('puppeteer-core')));
const root=path.resolve(import.meta.dirname,'..'),assets=path.resolve(root,'../xrossstars-card-assets-public');
const realManifest=JSON.parse(fs.readFileSync(path.join(assets,'db/manifest.json')));
let manifest=realManifest,body=fs.readFileSync(path.join(assets,'db',manifest.file),'utf8'),fail=false;
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:fs.mkdtempSync(path.resolve(root,'../tmp/db-browser-')),defaultViewport:{width:1366,height:900}});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.setRequestInterception(true);page.on('request',r=>{
  const u=new URL(r.url());if(u.origin==='https://megumi4150.github.io'){
   const headers={'Access-Control-Allow-Origin':'*'};
   if(u.pathname.endsWith('/manifest.json'))return r.respond({status:fail?503:200,contentType:'application/json',headers,body:JSON.stringify(manifest)});
   if(u.pathname.includes('/db/cards-'))return r.respond({status:200,contentType:'application/json',headers,body});
   const f=path.join(assets,'card-images',path.basename(u.pathname));return r.respond({status:fs.existsSync(f)?200:404,headers,body:fs.existsSync(f)?fs.readFileSync(f):''});
  }if(u.protocol==='https:')return r.abort();r.continue();
 });
 await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
 assert.equal(await page.evaluate(()=>allCards.length),558);
 await page.click('#update-card-db');await page.waitForFunction(()=>!document.getElementById('update-card-db').disabled);
 assert.equal(await page.evaluate(()=>allCards.length),592);
 assert(await page.evaluate(()=>leaders.some(c=>c.id===621)));
 await page.evaluate(()=>{addEvent({event:'turn',side:'left'});});
 const before=await page.evaluate(()=>({events:JSON.stringify(events),roster:JSON.stringify(roster),cards:JSON.stringify(allCards),state:JSON.stringify(timelineCache)}));
 const updated=JSON.parse(body);updated.version='11111111111111111111';updated.cards[0].effect='changed';updated.cards.push({...updated.cards[0],id:99999,name:'試験カード'});updated.total++;
 body=JSON.stringify(updated);manifest={...realManifest,version:updated.version,file:'cards-'+updated.version+'.json',total:updated.total,sha256:crypto.createHash('sha256').update(body).digest('hex')};
 await page.click('#update-card-db');await page.waitForFunction(()=>!document.getElementById('update-card-db').disabled);
 const after=await page.evaluate(()=>({events:JSON.stringify(events),roster:JSON.stringify(roster),state:JSON.stringify(timelineCache),count:allCards.length,old:JSON.stringify(allCards.slice(0,-1))}));
 assert.equal(after.count,593);assert.equal(after.events,before.events);assert.equal(after.roster,before.roster);assert.equal(after.state,before.state);assert.equal(after.old,before.cards);
 fail=true;await page.click('#update-card-db');await page.waitForFunction(()=>!document.getElementById('update-card-db').disabled);assert.equal(await page.evaluate(()=>allCards.length),593);
 await page.reload({waitUntil:'load'});assert.equal(await page.evaluate(()=>allCards.length),593);
 assert.equal(await page.evaluate(()=>events[0].card_db_version),realManifest.version);
 // Invalid download hash and local storage quota both leave the live DB untouched.
 fail=false;manifest={...manifest,version:'22222222222222222222',file:'cards-22222222222222222222.json',sha256:'0'.repeat(64)};
 await page.click('#update-card-db');await page.waitForFunction(()=>!document.getElementById('update-card-db').disabled);assert.equal(await page.evaluate(()=>allCards.length),593);
 await page.evaluate(()=>{const old=Storage.prototype.setItem;Storage.prototype.setItem=()=>{throw Error('quota')};try{CardDB.commit({...CardDB.current,version:'failed'});}catch{}finally{Storage.prototype.setItem=old}});
 assert.notEqual(await page.evaluate(()=>CardDB.current.version),'failed');
 // Existing sessions must receive review approval without changing history or HP.
 const oldDb=JSON.parse(fs.readFileSync(path.join(assets,'db/cards-65e4e62a0356e852ed34.json'),'utf8'));
 manifest=realManifest;body=fs.readFileSync(path.join(assets,'db',manifest.file),'utf8');
 await page.evaluate(db=>localStorage.setItem('xrossstars-card-db-v1',JSON.stringify(db)),oldDb);
 await page.reload({waitUntil:'load'});
 const saved=await page.evaluate(()=>JSON.stringify({events,roster,timelineCache}));
 assert(await page.evaluate(()=>[616,627,628].every(id=>cardById(id).review_required)));
 await page.click('#update-card-db');await page.waitForFunction(()=>!document.getElementById('update-card-db').disabled);
 assert.equal(await page.evaluate(()=>JSON.stringify({events,roster,timelineCache})),saved);
 assert(await page.evaluate(()=>[616,627,628].every(id=>cardById(id).review_required===false)));
 const rules=await page.evaluate(()=>{
  const results=[616,627,628].map(id=>({id,bonus:attackBonus(cardById(id).effect),hp:afterAttackOperations(cardById(id).effect)}));
  events=[{event:'memoria',side:'left',effect:'【アタック強化】ダメージ+50。'}];turn='left';
  return {results,memoria:pendingMemoriaBonus()};
 });
 assert(rules.results.every(r=>r.bonus===0&&r.hp.length===0));assert.equal(rules.memoria,50);
 assert.deepEqual(errors,[]);await page.screenshot({path:path.resolve(root,'../tmp/card-db-ui-proof.png')});
 console.log(JSON.stringify({ok:true,cases:['34 new cards','leader variants','active log and HP preserved','append only','failure rollback','cache restored','CSV event version','hash mismatch','quota failure']}));
}finally{await browser.close()}
