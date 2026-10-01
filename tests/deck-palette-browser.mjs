import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {normalizeDeck} from '../../xrossstars-card-assets-public/scripts/deck-format.mjs';
const req=createRequire(new URL('../../xrossstars-video-maker/package.json',import.meta.url));
const {default:puppeteer}=await import(pathToFileURL(req.resolve('puppeteer-core')));
const root=path.resolve(import.meta.dirname,'..'),assets=path.resolve(root,'../xrossstars-card-assets-public');
const manifest=JSON.parse(fs.readFileSync(path.join(assets,'db/manifest.json'))),db=JSON.parse(fs.readFileSync(path.join(assets,'db',manifest.file)));
const index=JSON.parse(fs.readFileSync(path.join(assets,'decks/index.json'))),entry=index.decks[0],deck=JSON.parse(fs.readFileSync(path.join(assets,'decks',entry.file)));
// Exercise the actual official-response conversion and strict count/identity checks.
const rawCard=id=>{const c=db.cards.find(c=>c.id===id);return {id,card_type:{internal_id:c.type},display_card_number:c.code};};
const raw={id:deck.code,leader:deck.leaders.map(rawCard),deck:deck.main.flatMap(c=>Array.from({length:c.count},()=>rawCard(c.card_id))),tactics:deck.tactics.flatMap(c=>Array.from({length:c.count},()=>rawCard(c.card_id))),pp:rawCard(deck.pp)};
assert.equal(normalizeDeck(raw,deck.code,db.cards).main.length,14);
assert.throws(()=>normalizeDeck({...raw,deck:raw.deck.slice(1)},deck.code,db.cards),/Incomplete/);
assert.throws(()=>normalizeDeck({...raw,id:'wrong'},deck.code,db.cards),/Incomplete/);
assert.throws(()=>normalizeDeck({...raw,leader:[rawCard(633),...raw.leader.slice(1)]},deck.code,db.cards),/differs/);
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:fs.mkdtempSync(path.resolve(root,'../tmp/deck-test-')),defaultViewport:{width:1440,height:1000}});
try{
 const page=await browser.newPage(),errors=[];let fail=false,badHash=false;
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.evaluateOnNewDocument(db=>{if(!localStorage.getItem('xrossstars-card-db-v1'))localStorage.setItem('xrossstars-card-db-v1',JSON.stringify(db));},db);
 await page.setRequestInterception(true);page.on('request',r=>{
  const u=new URL(r.url());if(u.origin==='https://megumi4150.github.io'){
   const relative=u.pathname.replace('/xrossstars-card-assets/',''),file=path.join(assets,relative);
   if(relative.startsWith('decks/')&&fail)return r.respond({status:503,headers:{'Access-Control-Allow-Origin':'*'},body:'failed'});
   const body=relative.includes('deck-')&&badHash?'{}':fs.existsSync(file)?fs.readFileSync(file):'';
   return r.respond({status:fs.existsSync(file)?200:404,headers:{'Access-Control-Allow-Origin':'*'},contentType:relative.endsWith('.json')?'application/json':'image/png',body});
  }if(u.protocol.startsWith('http'))return r.abort();r.continue();
 });
 await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
 assert(await page.evaluate(()=>['left','right'].every(s=>DeckPalette.state[s].mode==='recent')));
 await page.evaluate(ids=>{roster=Object.fromEntries(['left','right'].map(side=>[side,ids.map((id,i)=>leaderSlot((side==='left'?'L':'R')+(i+1),cardById(id)))]));firstPlayer='left';setupCollapsed=true;events=[{event:'match_start',time_sec:'0',side:'left',first_player:'left',roster_json:JSON.stringify(roster)}];save();},deck.leaders);
 const saved=await page.evaluate(()=>JSON.stringify({events,roster,timelineCache}));
 async function open(side){await page.evaluate(side=>document.getElementById('recent-'+side).parentElement.querySelector('.deck-settings').click(),side);try{await page.waitForFunction(code=>document.querySelector(`#deck-registered option[value="${code}"]`),{timeout:5000},entry.code);}catch(e){console.log(await page.$eval('#deck-result',e=>e.textContent));console.log(errors);throw e;}}
 async function load(side){await open(side);await page.select('#deck-registered',entry.code);await page.click('#deck-load');await page.waitForFunction(()=>!document.getElementById('deck-dialog').open);}
 await load('left');assert.equal(await page.evaluate(()=>JSON.stringify({events,roster,timelineCache})),saved);
 const order=await page.evaluate(()=>[...document.querySelectorAll('#recent-left [data-deck-card]')].map(b=>b.dataset.deckCard));assert.equal(order.length,19);
 assert.equal(await page.evaluate(()=>DeckPalette.state.right.mode),'recent');
 await page.click('#recent-left [data-deck-card="633"]');
 assert.equal(await page.evaluate(()=>events.filter(e=>e.event==='memoria').length),1);
 assert.equal(await page.$eval('#recent-left [data-deck-card="633"] .deck-used',e=>e.textContent),'使1');
 assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('#recent-left [data-deck-card]')].map(b=>b.dataset.deckCard)),order);
 await page.evaluate(()=>document.getElementById('recent-left').parentElement.querySelector('[data-palette-mode="recent"]').click());
 assert.equal(await page.$eval('#recent-left [data-recent-id="633"] span',e=>e.textContent),'×1');
 await page.evaluate(()=>document.getElementById('recent-left').parentElement.querySelector('[data-palette-mode="deck"]').click());
 await load('right');assert.equal(await page.$$eval('#recent-right [data-deck-card]',rows=>rows.length),20);
 const beforeClick=await page.evaluate(()=>events.length);await page.click('#recent-right [data-deck-card="633"]');assert.equal(await page.evaluate(()=>events.length),beforeClick);
 await page.evaluate(()=>addEvent({event:'turn',side:'right'}));await page.click('#recent-right [data-deck-card="633"]');assert.equal(await page.evaluate(()=>events.filter(e=>e.event==='memoria'&&e.side==='right').length),1);
 await page.click('#recent-right [data-deck-card="627"]');await page.evaluate(()=>{selectedAttacker='R1';beginAttack('L1');});await page.$eval('#attack-amount',e=>e.value='40');await page.click('#attack-record');
 assert.equal(await page.evaluate(()=>currentDamage('L1')),40);assert.equal(await page.$eval('#recent-right [data-deck-card="627"] .deck-used',e=>e.textContent),'使1');
 await page.evaluate(()=>{download=(name,type,content)=>window.testCsv=content;exportCsv();});const csv=await page.evaluate(()=>window.testCsv);
 assert(csv.includes('left_deck_json'));assert(csv.includes(entry.code));
 await page.reload({waitUntil:'load'});assert(await page.evaluate(()=>['left','right'].every(s=>DeckPalette.state[s].deck?.main.length===14)));
 await open('left');await page.click('#deck-remove');assert.equal(await page.evaluate(()=>DeckPalette.state.left.mode),'recent');
 await page.evaluate(async csv=>{await importCsv(new File([csv],'test.csv',{type:'text/csv'}));},csv);
 assert(await page.evaluate(()=>['left','right'].every(s=>DeckPalette.state[s].mode==='deck')));
 const stateBefore=await page.evaluate(()=>JSON.stringify(DeckPalette.state));
 await open('left');badHash=true;await page.click('#deck-load');await page.waitForFunction(()=>!document.getElementById('deck-load').disabled);assert.equal(await page.evaluate(()=>JSON.stringify(DeckPalette.state)),stateBefore);assert.match(await page.$eval('#deck-result',e=>e.textContent),/整合性/);badHash=false;
 await page.click('#deck-close');await open('left');fail=true;await page.click('#deck-load');await page.waitForFunction(()=>!document.getElementById('deck-load').disabled);assert.equal(await page.evaluate(()=>JSON.stringify(DeckPalette.state)),stateBefore);await page.click('#deck-close');fail=false;
 await page.screenshot({path:path.resolve(root,'../tmp/deck-palette-proof.png'),fullPage:true});
 const legacy=await page.evaluate(()=>{const rows=events.map(e=>Object.fromEntries(Object.entries(e).filter(([k])=>!k.includes('deck_json')&&!k.includes('deck_code'))));const keys=[...new Set(rows.flatMap(e=>Object.keys(e)))],q=v=>'"'+String(v??'').replaceAll('"','""')+'"';return [keys.join(','),...rows.map(e=>keys.map(k=>q(e[k])).join(','))].join('\n');});
 await page.evaluate(async text=>{await importCsv(new File([text],'legacy.csv'));},legacy);assert(await page.evaluate(()=>['left','right'].every(s=>DeckPalette.state[s].mode==='recent'&&DeckPalette.state[s].deck===null)));
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({ok:true,cases:['deck shape and counts','default recent view','no log/HP changes on load','stable card positions','normal memoria use','attack and 40 damage','independent sides','PP outside deck','wrong-turn guard','CSV restore','cache restore','hash and network rollback','legacy CSV']}));
}finally{await browser.close()}
