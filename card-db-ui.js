(()=>{
 const button=document.createElement('button');button.id='update-card-db';button.className='button';button.textContent='カードDB更新';
 document.querySelector('.topbar .spacer').after(button);
 const status=document.createElement('span');status.id='card-db-status';status.style.cssText='display:block;font-size:11px;color:var(--muted)';document.querySelector('.brand').append(status);
 const version=()=>CardDB.current.version;
 function display(extra=''){status.textContent=`カードDB ${allCards.length}枚｜${CardDB.current.updated_at?.slice(0,10)||'同梱版'}${extra?'｜'+extra:''}`;}
 const originalAdd=addEvent;addEvent=e=>originalAdd({card_db_version:version(),...e});
 const originalSelect=selectCard;
 selectCard=c=>{
  if(!c?.review_required)return originalSelect(c);
  video.pause();
  if(c.type!=='attack')return alert(`${c.name} は新しい効果のため自動処理未対応です。誤ったHP処理を防ぐため使用記録を停止しました。対応の確認を依頼してください。\n\n${c.effect}`);
  if(!confirm(`${c.name}：効果の自動処理は要確認です。\n${c.effect}\n\n攻撃の最終ダメージを手入力で確認して記録します。特殊な効果は別途確認してください。続けますか？`))return;
  selectedCard=c;selectedAttacker='';lastAttack=null;derivedTargetMode=false;pauseForDialog();renderLeaders();
 };
 const originalBegin=beginAttack;
 beginAttack=target=>{originalBegin(target);if(selectedCard?.review_required){$('attack-effect').textContent='【要確認・最終ダメージを手入力】'+$('attack-effect').textContent;$('card-damage-copy').textContent='未計算';$('attack-amount').value='';updateAttackHp();}};
 const originalRecord=recordAttack;
 recordAttack=()=>{if(pendingAttack?.card?.review_required&&$('attack-amount').value==='')return alert('最終ダメージを入力してください（0も入力できます）。');originalRecord();};
 $('attack-record').onclick=recordAttack;
 const originalCollect=collectAfterAttackSources;
 collectAfterAttackSources=(card,attacker,target)=>originalCollect(card?.review_required?{...card,effect:''}:card,attacker,target);
 // Unreviewed leader effects must not be interpreted by broad text heuristics.
 const originalAwaken=updateAwaken;
 updateAwaken=()=>{const l=leaderFor($('awaken-leader').value),unknown=!!cardById(l?.card_id)?.review_required;$('awaken-record').disabled=unknown;if(unknown){$('awaken-effect').textContent='【要確認】'+l.effect;$('awaken-confirm').textContent='この新しい覚醒時効果は未対応です。対応を確認してから記録してください。';$('awaken-target-wrap').style.display='none';$('awaken-amount-wrap').style.display='none';return;}originalAwaken();};
 $('awaken-leader').onchange=updateAwaken;
 const originalRender=renderCatalog;
 renderCatalog=()=>{originalRender();for(const b of document.querySelectorAll('[data-card-id]'))if(cardById(b.dataset.cardId)?.review_required){const tag=document.createElement('span');tag.textContent='要確認';tag.style.cssText='position:absolute;bottom:2px;left:2px;background:#654b13;color:#fff;padding:2px;font-size:10px';b.append(tag);}};
 let pending=null;
 async function check(){pending=await CardDB.manifest();const stale=Date.now()-Date.parse(pending.checked_at)>3*86400000;display(stale?'自動更新の確認が必要':pending.version!==CardDB.current.upstream_version&&pending.version!==version()?'新版あり':'最新');return pending;}
 button.onclick=async()=>{
  if(document.querySelector('dialog[open]')||selectedCard||pendingAttack||pendingTactics||afterAttackSources.length)return alert('カード使用・効果処理を完了または取り消してから更新してください。');
  button.disabled=true;try{
   const m=await check();if(m.version===version()||m.version===CardDB.current.upstream_version)return notify('公開されている最新版です');
   const p=await CardDB.download(m);
   if(document.querySelector('dialog[open]')||selectedCard||pendingAttack||pendingTactics||afterAttackSources.length)throw Error('カード処理が始まったため更新を中断しました。処理完了後に再度更新してください');
   const active=events.length>0||allRoster().some(l=>l.card_id),existing=new Set(allCards.map(c=>c.id)),added=p.cards.filter(c=>!existing.has(c.id));
   if(!confirm(`${p.total}枚のDBを読み込みます（新規${added.length}枚）。${active?'\n作業中のため、新カードのみ追加します。既存カード・編成・ログ・HPは変更しません。':''}\n${p.cards.filter(c=>c.review_required).length}枚は新しい効果の確認が必要です。`))return;
   const next=active?{...p,upstream_version:p.version,version:version()+'+'+p.version,cards:[...allCards,...added],total:allCards.length+added.length}:p;
   // Persist before touching in-memory state; a quota failure leaves the old database intact.
   CardDB.commit(next);allCards.splice(0,allCards.length,...next.cards);leaders.splice(0,leaders.length,...allCards.filter(c=>c.type==='leader'));playCards.splice(0,playCards.length,...allCards.filter(c=>c.type!=='leader'));renderAll();display(active?'既存データ固定':'最新');notify('カードDBを更新しました');
  }catch(e){display('更新失敗・旧DBを維持');alert(e.message+'\n既存のDBとログはそのまま使用できます。');}finally{button.disabled=false;}
 };
 display();renderCatalog();check().catch(()=>display('更新確認できません・保存DB使用'));
})();
