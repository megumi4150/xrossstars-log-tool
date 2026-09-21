import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const req=createRequire(new URL('../../xrossstars-video-maker/package.json',import.meta.url));
const {default:puppeteer}=await import(pathToFileURL(req.resolve('puppeteer-core')));
const root=path.resolve(import.meta.dirname,'..');
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:fs.mkdtempSync(path.resolve(root,'../tmp/recent-layout-'))});
try{
 const page=await browser.newPage();await page.setRequestInterception(true);page.on('request',r=>r.url().startsWith('http')?r.abort():r.continue());
 for(const width of [1920,1366,640]){
  await page.setViewport({width,height:1080});await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  await page.evaluate(()=>{events=['left','right'].flatMap(side=>playCards.slice(0,36).map(c=>({event:c.type,side,card_id:c.id,card_name:c.name})));renderAll();});
  const result=await page.evaluate(()=>['left','right'].map(side=>{const box=document.getElementById('recent-'+side),rect=box.getBoundingClientRect(),cards=[...box.children],rows=[...new Set(cards.map(c=>Math.round(c.offsetTop)))];const second=cards.filter(c=>Math.round(c.offsetTop)===rows[1]);return {height:rect.height,twoRows:second.length>0&&second.every(c=>c.getBoundingClientRect().bottom<=rect.bottom),scroll:box.scrollHeight>box.clientHeight,width:cards[0].getBoundingClientRect().width}}));
  assert(result.every(r=>r.height===164&&r.twoRows&&r.scroll&&r.width<=57),JSON.stringify({width,result}));
  if(width===1920)await page.screenshot({path:path.resolve(root,'../tmp/recent-cards-two-rows.png'),fullPage:true});
 }
 console.log('PASS: two full card rows at 1920, 1366 and 640px; overflow scroll retained');
}finally{await browser.close()}
