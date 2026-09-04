/* Play-time HP effects. This file shares the log maker's classic-script globals. */
function playEffectSpec(card) {
  const text = String(card?.effect || '').match(/【プレイ時】([\s\S]*?)(?=【|$)/)?.[1]?.trim() || '';
  if (!text.includes('ダメージ')) return null;
  if (/このターン、メモリアカードとアタックカードの効果で引いたカード1枚につき20ダメージ/.test(text)
      && /100ダメージまで/.test(text)) return {kind:'jail',text};
  if (/自分のリーダーを合計40回復/.test(text)
      && /このカードの効果で回復した数値と同じダメージ/.test(text)) return {kind:'drain',text};
  const fixed = text.match(/^対戦相手のリーダー(1体|すべて)に(\d+)ダメージ。/);
  if (fixed) return {kind:fixed[1]==='すべて'?'all':'single',amount:Number(fixed[2]),text};
  return {kind:'review',text};
}

let pendingPlayEffect = null;
function updateGroupedEventTime(event, seconds) {
  const delta=seconds-Number(event.time_sec||0);
  if(event.play_id) for(const child of events.filter(e=>e.source_play_id===event.play_id)) {
    const shifted=Math.max(0,Number(child.time_sec||0)+delta);
    child.time_sec=shifted.toFixed(3);child.time=fmt(shifted);
  }
  event.time_sec=seconds.toFixed(3);event.time=fmt(seconds);
}
function updateGroupedEventSide(event) {
  if(event.play_id) for(const child of events.filter(e=>e.source_play_id===event.play_id))child.side=event.side;
}
function startPlayEffect(card) {
  const spec = playEffectSpec(card);
  if (!spec) return false;
  if (spec.kind==='review' || !['memoria','tactics'].includes(card.type)) {
    alert(`${card.name} のプレイ時HP効果は自動処理の対応外です。ルールを確認してから対応を追加してください。\n\n${spec.text}`);
    return true;
  }
  const stamp = snap();
  const prior = events.filter(e=>Number(e.time_sec)<=Number(stamp.time_sec));
  if (!prior.some(e=>e.event==='match_start')) {notify('この時刻より前に試合開始とリーダー編成を記録してください');return true;}
  const state = replayTimeline(prior).final;
  pauseForDialog();
  pendingPlayEffect = {card,spec,stamp,state,side:state.turn,allocation:{},target:'',drawCount:0};
  selectedCard=null;selectedAttacker='';derivedTargetMode=false;
  $('play-effect-image').src=imageSrc(card);
  $('play-effect-name').textContent=card.name;
  $('play-effect-text').textContent=spec.text;
  $('play-draw-count').value='0';
  $('play-draw-wrap').hidden=spec.kind!=='jail';
  renderPlayEffectInputs();
  $('play-effect-dialog').showModal();
  renderLeaders();
  return true;
}
function playEligible(side) {
  return roster[side].filter(l=>!pendingPlayEffect.state.down[l.id]);
}
function playBudget() {
  const p=pendingPlayEffect;
  return p.spec.kind==='jail'?Math.min(100,p.drawCount*20):p.spec.kind==='drain'?40:p.spec.amount;
}
function playAllocationTotal() {
  return Object.values(pendingPlayEffect.allocation).reduce((a,b)=>a+b,0);
}
function playActualHealing() {
  const p=pendingPlayEffect;
  return Object.entries(p.allocation).reduce((sum,[id,n])=>sum+Math.min(n,Number(p.state.damage[id]||0)),0);
}
function playHpLabel(l) {
  const s=pendingPlayEffect.state,max=maxHpAt(l.id,s);
  return `HP ${Math.max(0,max-Number(s.damage[l.id]||0))}/${max}`;
}
function renderPlayEffectInputs() {
  const p=pendingPlayEffect,k=p.spec.kind,pool=k==='jail'||k==='drain';
  const poolSide=k==='drain'?p.side:opposite(p.side);
  $('play-pool-wrap').hidden=!pool;
  $('play-pool-title').textContent=k==='drain'?'① 味方への回復を配分':'ダメージを配分';
  $('play-allocation').innerHTML=pool?roster[poolSide].map(l=>`<div class="play-allocation-row ${p.state.down[l.id]?'down':''}"><div><b>${esc(l.id)} ${esc(l.name)}</b><small>${esc(playHpLabel(l))}${p.state.down[l.id]?'・ダウン':''}</small></div><div class="play-stepper"><button data-play-adjust="${l.id}" data-delta="-10" ${p.state.down[l.id]?'disabled':''}>−</button><input aria-label="${esc(l.name)}への配分" data-play-amount="${l.id}" type="number" min="0" step="10" max="${playBudget()}" value="${p.allocation[l.id]||0}" ${p.state.down[l.id]?'disabled':''}><button data-play-adjust="${l.id}" data-delta="10" ${p.state.down[l.id]?'disabled':''}>＋</button></div><span id="play-hp-${l.id}" class="play-hp-result"></span></div>`).join(''):'';
  $('play-target-wrap').hidden=!(k==='single'||k==='drain');
  $('play-target-title').textContent=k==='drain'?'② ダメージを与える相手':'ダメージを与える相手';
  $('play-targets').innerHTML=roster[opposite(p.side)].map(l=>`<button class="play-target" data-play-target="${l.id}" ${p.state.down[l.id]?'disabled':''}><b>${esc(l.id)} ${esc(l.name)}</b><small>${esc(playHpLabel(l))}${p.state.down[l.id]?'・ダウン':''}</small></button>`).join('');
  document.querySelectorAll('[data-play-target]').forEach(b=>b.onclick=()=>{p.target=b.dataset.playTarget;updatePlayEffectPreview()});
  document.querySelectorAll('[data-play-adjust]').forEach(b=>b.onclick=()=>setPlayAllocation(b.dataset.playAdjust,(p.allocation[b.dataset.playAdjust]||0)+Number(b.dataset.delta)));
  document.querySelectorAll('[data-play-amount]').forEach(input=>input.oninput=()=>setPlayAllocation(input.dataset.playAmount,Number(input.value)));
  updatePlayEffectPreview();
}
function setPlayAllocation(id,value) {
  const p=pendingPlayEffect;
  if (!p || p.state.down[id]) return;
  const available=Math.max(0,playBudget()-playAllocationTotal()+(p.allocation[id]||0));
  p.allocation[id]=Math.min(available,Math.max(0,Math.floor((Number(value)||0)/10)*10));
  const input=document.querySelector(`[data-play-amount="${id}"]`);
  if(input)input.value=String(p.allocation[id]);
  updatePlayEffectPreview();
}
function updatePlayEffectPreview() {
  const p=pendingPlayEffect,k=p.spec.kind,budget=playBudget(),sum=playAllocationTotal(),enemy=playEligible(opposite(p.side));
  const damage=k==='drain'?playActualHealing():budget;
  const validTarget=enemy.some(l=>l.id===p.target);
  const poolSide=k==='drain'?p.side:opposite(p.side);
  let valid=true,copy='';
  if(k==='jail'||k==='drain') {
    const possible=playEligible(poolSide).length>0;
    valid=!possible||sum===budget;
    $('play-pool-status').textContent=`配分 ${sum} / ${budget}　残り ${Math.max(0,budget-sum)}`;
    for(const l of roster[poolSide]) {
      const max=maxHpAt(l.id,p.state),before=Math.max(0,max-Number(p.state.damage[l.id]||0)),amount=p.allocation[l.id]||0;
      const after=k==='drain'?Math.min(max,before+amount):Math.max(0,before-amount);
      const el=$('play-hp-'+l.id);if(el)el.textContent=p.state.down[l.id]?'対象外':`HP ${before} → ${after}`;
    }
  }
  if(k==='drain') {
    valid=valid && (!enemy.length||validTarget);
    copy=`実際の回復合計：${damage}。${damage?`相手1体へのダメージも${damage}です。`:'ダメージは発生しません。'} 最大HPを超えた回復分はダメージに含めません。`;
  } else if(k==='single') {
    valid=!enemy.length||validTarget;
    copy=p.target?`${nameFor(p.target)}に${damage}ダメージ。`:`相手リーダーを選択してください（${damage}ダメージ）。`;
  } else if(k==='all') copy=`${enemy.length?enemy.map(l=>l.name).join('・')+'にそれぞれ'+damage+'ダメージ。':'対象となる相手リーダーがいません。'}`;
  else copy=`効果で引いた${p.drawCount}枚 × 20 → 合計${budget}ダメージ（上限100）。通常のターン開始・終了時のドローは数えません。`;
  if(!enemy.length)copy+=' 相手に対象がいないため、ダメージ処理は記録しません。';
  $('play-effect-summary').textContent=copy;
  $('play-effect-record').disabled=!valid;
  document.querySelectorAll('[data-play-target]').forEach(b=>b.classList.toggle('selected',b.dataset.playTarget===p.target));
}
function playEffectOperations() {
  const p=pendingPlayEffect,k=p.spec.kind,enemy=playEligible(opposite(p.side)),ops=[];
  if(k==='single'&&enemy.some(l=>l.id===p.target)) ops.push({target:p.target,operation:'damage',amount:p.spec.amount});
  if(k==='all') for(const l of enemy)ops.push({target:l.id,operation:'damage',amount:p.spec.amount});
  if(k==='jail') for(const l of enemy)if(p.allocation[l.id]>0)ops.push({target:l.id,operation:'damage',amount:p.allocation[l.id]});
  if(k==='drain') {
    for(const l of playEligible(p.side))if(p.allocation[l.id]>0)ops.push({target:l.id,operation:'heal',amount:p.allocation[l.id]});
    if(enemy.some(l=>l.id===p.target))ops.push({target:p.target,operation:'damage',amount:playActualHealing(),linked:true});
  }
  return ops;
}
function recordPlayEffect() {
  if(!pendingPlayEffect)return;
  updatePlayEffectPreview();if($('play-effect-record').disabled)return;
  const p=pendingPlayEffect,c=p.card,group=crypto.randomUUID();
  const use={...p.stamp,event:c.type,side:p.side,card_id:c.id,card_name:c.name,card_code:c.code,card_type:c.type,card_image:c.image_url,card_local_image:c.local_image,effect:c.effect,confidence:'manual-card',play_id:group,effect_rule:p.spec.kind,draw_count:p.spec.kind==='jail'?p.drawCount:''};
  if(c.type==='tactics')use.tactics_mode=tacticsMode(c);
  const changes=playEffectOperations().map(op=>({...p.stamp,event:'hp_effect',side:p.side,target:op.target,operation:op.operation,amount:op.amount,damage:op.operation==='damage'?op.amount:'',effect_timing:'play',source_play_id:group,derived_from_heal_group:op.linked?group:'',source_type:c.type,source_card_id:c.id,source_card_name:c.name,source_card_code:c.code,source_card_type:c.type,source_card_image:c.image_url,source_card_local_image:c.local_image,source_effect:c.effect,confidence:'manual-play-effect'}));
  events.push(use,...changes);
  pendingPlayEffect=null;
  save();
  closeAndResume($('play-effect-dialog'));
  notify(`${c.name} の使用とプレイ時HP処理を記録しました`);
}
function cancelPlayEffect() {pendingPlayEffect=null;closeAndResume($('play-effect-dialog'));}

$('play-effect-record').onclick=recordPlayEffect;
$('play-effect-cancel').onclick=cancelPlayEffect;
$('play-effect-close').onclick=cancelPlayEffect;
$('play-effect-dialog').addEventListener('cancel',e=>{e.preventDefault();cancelPlayEffect()});
$('play-draw-count').oninput=()=>{if(!pendingPlayEffect)return;pendingPlayEffect.drawCount=Math.max(0,Math.floor(Number($('play-draw-count').value)||0));pendingPlayEffect.allocation={};renderPlayEffectInputs()};
