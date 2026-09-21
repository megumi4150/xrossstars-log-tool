import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const req=createRequire(new URL('../../xrossstars-video-maker/package.json',import.meta.url));
const {default:puppeteer}=await import(pathToFileURL(req.resolve('puppeteer-core')));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:fs.mkdtempSync(path.resolve('../tmp/db-live-')),defaultViewport:{width:1440,height:900}});
try{
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.goto('https://megumi4150.github.io/xrossstars-log-tool/?v=card-db-20260921',{waitUntil:'networkidle2'});
 await p.waitForSelector('#update-card-db');await p.click('#update-card-db');await p.waitForFunction(()=>!document.getElementById('update-card-db').disabled);
 const result=await p.evaluate(()=>({count:allCards.length,version:CardDB.current.version,newLeader:leaders.some(c=>c.id===621),status:document.getElementById('card-db-status').innerText,statusVisible:getComputedStyle(document.getElementById('card-db-status')).display!=='none'}));
 assert(result.count>=592);assert(result.newLeader);assert(result.statusVisible);assert(!result.status.includes('失敗'));assert.deepEqual(errors,[]);
 await p.evaluate(()=>{document.getElementById('card-search').value='AN01';renderCatalog();});
 await p.waitForFunction(()=>[...document.querySelectorAll('#card-results img')].every(i=>i.complete&&i.naturalWidth>0));
 await p.screenshot({path:path.resolve('../tmp/card-db-live.png')});console.log(JSON.stringify({ok:true,...result,images:'new card images loaded'}));
}finally{await browser.close()}
