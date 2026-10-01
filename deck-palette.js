/* Optional deck shortcuts. The original recent-card view remains the default. */
window.DeckPalette=(()=>{
 const base=CARD_ASSET_BASE+'decks/',storageKey='xrossstars-deck-palette-v1';
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
 const sides=['left','right'],blank=()=>({mode:'recent',filter:'all',deck:null});
 let state={left:blank(),right:blank()},editingSide='left',index=null;
 function validate(p){
  if(p?.schema!==1||!uuid.test(p.code)||!/^[a-f0-9]{20}$/.test(p.version)||typeof p.label!=='string'||p.label.length>100||!Array.isArray(p.leaders)||p.leaders.length!==4||!p.leaders.every(Number.isInteger))throw Error('デッキデータの形式が不正です');
  for(const [key,total] of [['main',50],['tactics',5]]){
   const rows=p[key];if(!Array.isArray(rows)||!rows.length||rows.length>total||rows.reduce((n,c)=>n+c.count,0)!==total||new Set(rows.map(c=>c.card_id)).size!==rows.length||rows.some(c=>!Number.isInteger(c.card_id)||!Number.isInteger(c.count)||c.count<1||c.count>total))throw Error('デッキ枚数が不正です');
  }
  if(p.pp!==null&&!Number.isInteger(p.pp))throw Error('PPカード情報が不正です');return p;
 }
 function persist(next=state){localStorage.setItem(storageKey,JSON.stringify(next));state=next;}
 try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved)for(const side of sides){const row=saved[side];if(row?.deck)validate(row.deck);state[side]={mode:row?.mode==='deck'?'deck':'recent',filter:['all','attack','memoria','tactics'].includes(row?.filter)?row.filter:'all',deck:row?.deck||null};}}catch{state={left:blank(),right:blank()};}
 const originalRecent=renderRecent;
 const panel=document.querySelector('.recent-panel');panel.querySelector('h3').textContent='カード選択';
 for(const side of sides){
  const group=$('recent-'+side).parentElement;
  const toolbar=document.createElement('div');toolbar.className='palette-tools';toolbar.innerHTML=`<button data-palette-mode="recent" aria-pressed="true">最近使用</button><button data-palette-mode="deck" aria-pressed="false">デッキ内</button><select aria-label="${sideLabel(side)}デッキのカード種類"><option value="all">すべて</option><option value="attack">アタック</option><option value="memoria">メモリア</option><option value="tactics">タクティクス</option></select><button class="deck-settings">デッキ設定</button>`;
  const info=document.createElement('div');info.className='palette-info';info.id='deck-info-'+side;
  group.insertBefore(toolbar,$('recent-'+side));group.insertBefore(info,$('recent-'+side));
  toolbar.querySelectorAll('[data-palette-mode]').forEach(b=>b.onclick=()=>{try{persist({...state,[side]:{...state[side],mode:b.dataset.paletteMode}});renderRecent(side);}catch{notify('設定を保存できません。CSVを保存してブラウザの空き容量を確認してください。');}});
  toolbar.querySelector('select').onchange=e=>{try{persist({...state,[side]:{...state[side],filter:e.target.value}});renderRecent(side);}catch{notify('設定を保存できません');}};
  toolbar.querySelector('.deck-settings').onclick=()=>open(side);
 }
 function useCounts(side){const map=new Map();for(const e of events)if(e.side===side&&['damage','memoria','tactics'].includes(e.event)&&e.card_id){const id=Number(e.card_id);map.set(id,(map.get(id)||0)+1);}return map;}
 renderRecent=side=>{
  const setting=state[side],group=$('recent-'+side).parentElement,toolbar=group.querySelector('.palette-tools'),info=$('deck-info-'+side);
  toolbar.querySelectorAll('[data-palette-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.paletteMode===setting.mode)));
  const filter=toolbar.querySelector('select');filter.hidden=setting.mode!=='deck';filter.value=setting.filter;
  if(setting.mode==='recent'){info.textContent='';info.hidden=true;originalRecent(side);return;}
  info.hidden=false;
  if(!setting.deck){info.textContent='';$('recent-'+side).innerHTML='<div class="deck-empty">「デッキ設定」から登録済みデッキを選択してください。<br>コード不明の場合は「最近使用」を使えます。</div>';return;}
  const deck=setting.deck,counts=useCounts(side);
  info.textContent=`${deck.label}｜採＝採用枚数・使＝使用回数`;info.title=deck.code;
  const first=events.find(e=>e.event==='match_start')?.first_player||events.find(e=>e.event==='match_start')?.side||firstPlayer;
  const rows=[...deck.main,...deck.tactics];if(deck.pp&&first&&side===opposite(first))rows.push({card_id:deck.pp,count:1,extra:true});
  $('recent-'+side).innerHTML=rows.filter(row=>setting.filter==='all'||cardById(row.card_id)?.type===setting.filter).map(row=>{
   const c=cardById(row.card_id),count=counts.get(row.card_id)||0;
   if(!c)return `<button class="recent-card deck-card" disabled title="カードDBを更新してください">未収録 ${row.card_id}</button>`;
   return `<button class="recent-card deck-card ${count?'used':''}" data-deck-card="${c.id}" title="${esc(c.name)}｜${row.extra?'デッキ外・R1後攻用PPチケット':`採用${row.count}枚`}｜使用${count}回${c.type==='tactics'?'（候補一覧。エリア残数ではありません）':''}"><img src="${esc(imageSrc(c))}" alt="${esc(c.name)}" loading="lazy"><span class="deck-adopted">${row.extra?'外':'採'+row.count}</span><span class="deck-used">使${count}</span></button>`;
  }).join('')||'<div class="deck-empty">この種類のカードはありません。</div>';
  $('recent-'+side).querySelectorAll('[data-deck-card]').forEach(b=>b.onclick=()=>{if(side!==turn)return notify(`現在は${sideLabel(turn)}プレイヤーのターンです。ターンを確認してください。`);selectCard(cardById(b.dataset.deckCard));});
 };
 const dialog=document.createElement('dialog');dialog.id='deck-dialog';dialog.innerHTML='<div class="dialog-head"><strong id="deck-dialog-title"></strong><div class="spacer"></div><button class="icon-button" id="deck-close" aria-label="閉じる">×</button></div><div class="dialog-body"><label>登録済みデッキ<select id="deck-registered"><option value="">一覧を読み込み中…</option></select></label><label>デッキコード<input id="deck-code" placeholder="登録済みコードを入力" autocomplete="off" spellcheck="false"></label><div class="deck-dialog-note">カードの使用候補を事前表示します。リーダー編成は動画の並びに合わせて従来の欄で設定してください。未登録のコードは管理者に登録を依頼してください。</div><div id="deck-result" class="deck-result" role="status"></div></div><div class="deck-dialog-actions"><button id="deck-remove" class="button">デッキ設定を解除</button><button id="deck-refresh" class="button">一覧更新</button><button id="deck-load" class="button primary">このデッキを読み込む</button></div>';
 document.body.append(dialog);$('deck-close').onclick=()=>dialog.close();
 async function readIndex(){
  const response=await fetch(base+'index.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('登録デッキ一覧を取得できません。保存済みのデッキは引き続き使えます。');
  const p=await response.json();if(p.schema!==1||!Array.isArray(p.decks)||p.decks.length!==p.total||p.total>1000||new Set(p.decks.map(d=>d.code)).size!==p.total)throw Error('登録デッキ一覧の形式が不正です');
  for(const d of p.decks)if(!uuid.test(d.code)||typeof d.label!=='string'||d.label.length>100||!/^[a-f0-9]{20}$/.test(d.version)||d.file!==`deck-${d.code}-${d.version}.json`||!/^[a-f0-9]{64}$/.test(d.sha256))throw Error('登録デッキの情報が不正です');index=p;
  $('deck-registered').innerHTML='<option value="">登録済みデッキを選択</option>'+p.decks.map(d=>`<option value="${d.code}">${esc(d.label)}（${d.main_types}種類）</option>`).join('');
  if(p.decks.some(d=>d.code===$('deck-code').value))$('deck-registered').value=$('deck-code').value;
 }
 async function open(side){editingSide=side;$('deck-dialog-title').textContent=`${sideLabel(side)}プレイヤーのデッキ設定`;$('deck-code').value=state[side].deck?.code||'';$('deck-result').textContent=state[side].deck?`現在：${state[side].deck.label}`:'';dialog.showModal();try{await readIndex();}catch(e){$('deck-result').textContent=e.message;}}
 $('deck-registered').onchange=e=>{$('deck-code').value=e.target.value;$('deck-result').textContent='';};
 $('deck-refresh').onclick=async()=>{try{await readIndex();$('deck-result').textContent='一覧を更新しました';}catch(e){$('deck-result').textContent=e.message;}};
 $('deck-remove').onclick=()=>{try{persist({...state,[editingSide]:blank()});renderRecent(editingSide);dialog.close();notify('デッキ設定を解除しました');}catch(e){$('deck-result').textContent='設定を保存できません。';}};
 let loading=false;
 $('deck-load').onclick=async()=>{
  if(loading)return;loading=true;$('deck-load').disabled=true;const side=editingSide;
  try{
   const code=$('deck-code').value.trim().toLowerCase();if(!uuid.test(code))throw Error('デッキコードを確認してください');
   await readIndex();const entry=index.decks.find(d=>d.code===code);if(!entry)throw Error('このコードはまだ登録されていません。管理者に登録を依頼してください。');
   const response=await fetch(base+entry.file,{cache:'no-cache',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('デッキを取得できません');const bytes=await response.arrayBuffer();if(bytes.byteLength>1000000)throw Error('デッキデータが大きすぎます');
   const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');if(hash!==entry.sha256)throw Error('デッキの整合性チェックに失敗しました');
   const deck=validate(JSON.parse(new TextDecoder().decode(bytes)));if(deck.code!==code||deck.version!==entry.version)throw Error('デッキの版が一致しません');
   const missing=[...deck.leaders,...deck.main.map(c=>c.card_id),...deck.tactics.map(c=>c.card_id),deck.pp].filter(id=>id&&!cardById(id));if(missing.length)throw Error('カードDBに未収録のカードがあります。画面上部の「カードDB更新」を行ってから読み込んでください。');
   if(!dialog.open||editingSide!==side)return;
   persist({...state,[side]:{mode:'deck',filter:'all',deck}});renderRecent(side);dialog.close();notify(`${sideLabel(side)}のデッキを読み込みました（${deck.main.length}種類）`);
  }catch(e){$('deck-result').textContent=e.message;}finally{loading=false;$('deck-load').disabled=false;}
 };
 const originalImport=importCsv;
 importCsv=async file=>{const before=events;await originalImport(file);if(events===before)return;const start=events.find(e=>e.event==='match_start'),next={left:blank(),right:blank()};for(const side of sides){try{const json=start?.[side+'_deck_json'];if(json){next[side]={mode:'deck',filter:'all',deck:validate(JSON.parse(json))};}}catch{notify(`${sideLabel(side)}のデッキ設定を復元できません。最近使用を表示します。`);}}try{persist(next);}catch{state=next;}for(const side of sides)renderRecent(side);};
 $('import-csv').onchange=async e=>{const file=e.target.files[0];if(file)await importCsv(file);e.target.value='';};
 for(const side of sides)renderRecent(side);
 return {csvValue(e,key){const side=key.startsWith('left_')?'left':key.startsWith('right_')?'right':'';if(!side||!['left_deck_code','right_deck_code','left_deck_json','right_deck_json'].includes(key))return undefined;if(e.event!=='match_start')return '';const deck=state[side].deck;return key.endsWith('_json')?(deck?JSON.stringify(deck):''):(deck?.code||'');},get state(){return structuredClone(state)},validate};
})();
