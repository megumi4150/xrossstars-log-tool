import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const dependencyRequire=createRequire(new URL('../../xrossstars-video-maker/package.json',import.meta.url));
const {default:puppeteer}=await import(pathToFileURL(dependencyRequire.resolve('puppeteer-core')));

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=fs.mkdtempSync(path.resolve(root,'../tmp/play-effects-'));
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,userDataDir:path.join(out,'profile'),defaultViewport:{width:1366,height:900}});
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setRequestInterception(true);
  page.on('request',async req=>{
    if(req.url().startsWith('https://megumi4150.github.io/xrossstars-card-assets/card-images/')){
      const name=new URL(req.url()).pathname.split('/').at(-1),file=path.resolve(root,'../xrossstars-card-assets-public/card-images',name);
      return req.respond({status:200,contentType:'image/png',body:fs.readFileSync(file)});
    }
    return req.continue();
  });
  await page.goto(pathToFileURL(path.join(root,'index.html')).href,{waitUntil:'load'});
  const result=await page.evaluate(()=>{
    const check=(ok,label)=>{if(!ok)throw Error(label)};
    localStorage.clear();
    let testTime=10,paused=true,plays=0;
    Object.defineProperty(video,'currentTime',{configurable:true,get:()=>testTime,set:v=>testTime=v});
    Object.defineProperty(video,'paused',{configurable:true,get:()=>paused});
    video.pause=()=>{paused=true};video.play=()=>{paused=false;plays++;return Promise.resolve()};
    const c=name=>allCards.find(c=>c.name===name);
    function setup(damage={}){
      document.querySelectorAll('dialog[open]').forEach(d=>d.close());
      roster={left:[],right:[]};for(const side of ['left','right'])for(let i=1;i<=4;i++)roster[side].push({id:(side==='left'?'L':'R')+i,name:(side==='left'?'味方':'相手')+i,hp:100,atk:30,awaken_hp:130,awaken_atk:40,effect:''});
      firstPlayer='left';events=[{event:'match_start',time_sec:'0.000',time:'00:00.000',side:'left',first_player:'left',roster_json:JSON.stringify(roster)}];
      for(const [target,amount] of Object.entries(damage))events.push({event:'hp_effect',time_sec:'1.000',time:'00:01.000',target,operation:'damage',amount});
      testTime=10;paused=true;resumeAfterDialog=false;afterAttackSources=[];activeDerivedSource=null;lastAttack=null;pendingPlayEffect=null;
      save();
    }
    setup({R4:100});paused=false;
    selectCard(c('でからむち♪'));
    check(paused&&$('play-effect-dialog').open,'pause on play');
    check(events.length===2,'transaction not committed before target');
    check(document.querySelector('[data-play-target="R4"]').disabled,'down excluded');
    check($('play-effect-record').disabled,'requires target');
    document.querySelector('[data-play-target="R2"]').click();recordPlayEffect();
    check(currentDamage('R2')===20&&!paused,'immediate HP and playback resume');
    check(events.at(-1).source_card_name==='でからむち♪'&&events.at(-1).effect_timing==='play','correct source');
    check(events.at(-1).time_sec==='10.000','play timestamp');
    const used=events.length;selectCard(c('でからむち♪'));cancelPlayEffect();check(events.length===used&&!paused,'cancel is atomic and resumes');
    undo();check(events.length===2&&currentDamage('R2')===0,'undo removes whole play');
    setup({R1:90});selectCard(c('収穫の刻'));document.querySelector('[data-play-target="R1"]').click();recordPlayEffect();
    check(isDown('R1')&&!events.some(e=>e.event==='awaken'),'play down without awaken');
    check(collectAfterAttackSources(c('フラッシュバン'),'L1','R2').every(s=>s.card_name!=='収穫の刻'),'play damage never queued as after-attack');
    setup({R4:100});selectCard(c('勝利へのジャンプ'));recordPlayEffect();
    check(['R1','R2','R3'].every(id=>currentDamage(id)===50)&&currentDamage('R4')===100,'all damage living only');
    setup();selectCard(c('攻撃要請'));document.querySelector('[data-play-target="R3"]').click();recordPlayEffect();
    check(events.at(-2).event==='tactics'&&currentDamage('R3')===40,'tactics source/use exactly once');
    setup();selectCard(c('ジェイルブレイク'));$('play-draw-count').value=6;$('play-draw-count').dispatchEvent(new Event('input'));
    check(playBudget()===100,'jail capped at100');
    setPlayAllocation('R1',70);setPlayAllocation('R2',50);
    check(pendingPlayEffect.allocation.R2===30,'remaining allocation clamped');recordPlayEffect();
    check(currentDamage('R1')===70&&currentDamage('R2')===30,'jail allocation');
    check(events.find(e=>e.play_id).draw_count===6,'draw count persisted');
    setup({L1:10,L2:30});selectCard(c('ドレインロッド'));setPlayAllocation('L1',30);setPlayAllocation('L2',10);
    check(playActualHealing()===20,'actual heal excludes overheal');
    document.querySelector('[data-play-target="R1"]').click();recordPlayEffect();
    check(currentDamage('L1')===0&&currentDamage('L2')===20&&currentDamage('R1')===20,'drain actual damage');
    events.find(e=>e.target==='L1'&&e.time_sec==='1.000').amount=20;save();
    check(currentDamage('R1')===30&&events.at(-1).amount===30,'historical HP recalculates linked drain');
    openEventEditor(events.length-1);check($('edit-amount').disabled,'linked damage edit explains dependency');$('event-edit-dialog').close();
    let csv='';download=(name,type,body)=>{csv=body};exportCsv();
    check(csv.includes('source_play_id')&&csv.includes('derived_from_heal_group'),'CSV columns');
    const imported=parseCsv(csv).map(normalizeImportedEvent);rebuildImportedState(imported,roster);save();
    check(currentDamage('R1')===30&&events.at(-1).source_card_name==='ドレインロッド','CSV roundtrip');
    const drainCsv=csv;
    const source=events.find(e=>e.play_id);updateGroupedEventTime(source,12);save();
    check(events.filter(e=>e.source_play_id===source.play_id).every(e=>Number(e.time_sec)===12),'source time edit moves HP group');
    source.side='right';updateGroupedEventSide(source);save();
    check(events.filter(e=>e.source_play_id===source.play_id).every(e=>e.side==='right'),'source owner edit keeps effect image direction');
    const coverage=[...new Map(allCards.filter(card=>/【プレイ時】[^【]*ダメージ/.test(card.effect||'')).map(card=>[card.name,playEffectSpec(card)?.kind])).entries()];
    check(coverage.every(([,kind])=>kind&&kind!=='review'),'all current play-damage cards covered');
    setup({L1:10,L2:30});selectCard(c('ドレインロッド'));setPlayAllocation('L1',30);setPlayAllocation('L2',10);document.querySelector('[data-play-target="R2"]').click();
    const rect=$('play-effect-dialog').getBoundingClientRect();check(rect.top>=0&&rect.bottom<=innerHeight,'dialog fits height');
    return {ok:true,coverage,drainCsv,plays};
  });
  if(errors.length)throw Error(errors.join('\n'));
  fs.writeFileSync(path.join(out,'drain-roundtrip.csv'),result.drainCsv);
  await page.screenshot({path:path.join(out,'drain-ui.png')});
  await page.evaluate(()=>{cancelPlayEffect();selectCard(allCards.find(c=>c.name==='ジェイルブレイク'));$('play-draw-count').value=3;$('play-draw-count').dispatchEvent(new Event('input'));setPlayAllocation('R1',20);setPlayAllocation('R2',40)});
  await page.waitForFunction(()=>{const img=document.getElementById('play-effect-image');return img.complete&&img.naturalWidth>0});
  await page.screenshot({path:path.join(out,'jail-ui.png')});
  console.log(JSON.stringify({...result,drainCsv:path.join(out,'drain-roundtrip.csv'),screenshots:out}));
  // Reuse the isolated page for existing HP/history/after-attack regression coverage.
  page.removeAllListeners('request');
  await page.setRequestInterception(false);
  const legacy=spawnSync(process.execPath,[path.join(root,'tests/browser-smoke.mjs')],{encoding:'utf8',env:{...process.env,CDP_PORT:new URL(browser.wsEndpoint()).port},timeout:45000});
  if(legacy.status!==0)throw Error(legacy.stderr||legacy.stdout);
  console.log(legacy.stdout);
} finally {await browser.close();}
