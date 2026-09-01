const port = process.env.CDP_PORT || '9335';
const pages = await fetch(`http://127.0.0.1:${port}/json`).then(r => r.json());
const page = pages.find(x => x.type === 'page' && x.url.endsWith('/index.html'));
if (!page) throw new Error('Log maker page was not found in Chrome DevTools targets.');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener('message', event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function send(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
for (let attempt = 0; attempt < 40; attempt++) {
  await new Promise(resolve => setTimeout(resolve, 100));
  const ready = await send('Runtime.evaluate', {
    expression: `document.readyState === 'complete' && document.title.includes('v11')`,
    returnByValue: true
  });
  if (ready.result.value) break;
  if (attempt === 39) throw new Error('Updated v11 page did not finish loading.');
}
const expression = `(() => {
  localStorage.clear();
  const makeLeader = (id, name) => ({id,name,hp:100,atk:30,awaken_hp:130,awaken_atk:40,effect:''});
  roster = {
    left: ['L1','L2','L3','L4'].map((id, i) => makeLeader(id, 'Left ' + (i + 1))),
    right: ['R1','R2','R3','R4'].map((id, i) => makeLeader(id, 'Right ' + (i + 1)))
  };
  firstPlayer = 'left';
  events = [
    {time_sec:'0.000',time:'00:00.000',event:'match_start',side:'left',first_player:'left'},
    {time_sec:'180.000',time:'03:00.000',event:'damage',side:'left',attacker:'L1',target:'R1',damage:30,card_name:'Test Attack'},
    {time_sec:'240.000',time:'04:00.000',event:'hp_effect',side:'left',target:'R1',operation:'damage',amount:20},
    {time_sec:'300.000',time:'05:00.000',event:'damage',side:'right',attacker:'R2',target:'L1',damage:40,card_name:'Reply'}
  ];
  recalculateTimeline();
  const initial = {
    r1: currentDamage('R1'),
    l1: currentDamage('L1'),
    firstBefore: events[1].damage_before,
    secondBefore: events[2].damage_before,
    secondAfter: events[2].damage_after
  };

  renderAll();
  openEventEditor(1);
  const stateCopy = document.getElementById('event-edit-hp').textContent;
  document.getElementById('edit-target').value = 'R2';
  document.getElementById('edit-amount').value = '20';
  saveEditedEvent();
  const edited = {
    r1: currentDamage('R1'),
    r2: currentDamage('R2'),
    l1: currentDamage('L1'),
    firstTarget: events[1].target,
    firstAfter: events[1].damage_after,
    secondBefore: events[2].damage_before,
    secondAfter: events[2].damage_after,
    editButtons: document.querySelectorAll('[data-edit]').length,
    stateShowsR1: stateCopy.includes('R1') && stateCopy.includes('100/100')
  };

  events.push({time_sec:'360.000',time:'06:00.000',event:'round',round:1,winner:'left'});
  events.push({time_sec:'420.000',time:'07:00.000',event:'damage',side:'right',attacker:'R2',target:'R1',damage:10,card_name:'Round 2'});
  recalculateTimeline();
  const roundReset = {
    r1: currentDamage('R1'),
    r2: currentDamage('R2'),
    l1: currentDamage('L1'),
    round,
    turn,
    leftScore: score.left,
    postResetBefore: events.at(-1).damage_before
  };

  document.getElementById('speed').click();
  const speedOn = video.playbackRate === 1.5 && document.getElementById('speed').classList.contains('speed-active');
  document.getElementById('speed').click();
  const speedOff = video.playbackRate === 1 && !document.getElementById('speed').classList.contains('speed-active');
  return {initial, edited, roundReset, speedOn, speedOff};
})()`;

const evaluation = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true
});

if (process.env.SCREENSHOT_PATH) {
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
  await send('Runtime.evaluate', { expression: `renderAll(); openEventEditor(1);` });
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const { writeFile } = await import('node:fs/promises');
  await writeFile(process.env.SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
}
socket.close();

if (evaluation.exceptionDetails) {
  throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
}
const result = evaluation.result.value;
const expected =
  result.initial.r1 === 50 &&
  result.initial.l1 === 40 &&
  result.initial.firstBefore === 0 &&
  result.initial.secondBefore === 30 &&
  result.initial.secondAfter === 50 &&
  result.edited.r1 === 20 &&
  result.edited.r2 === 20 &&
  result.edited.l1 === 40 &&
  result.edited.firstTarget === 'R2' &&
  result.edited.firstAfter === 20 &&
  result.edited.secondBefore === 0 &&
  result.edited.secondAfter === 20 &&
  result.edited.editButtons === 4 &&
  result.edited.stateShowsR1 &&
  result.roundReset.r1 === 10 &&
  result.roundReset.r2 === 0 &&
  result.roundReset.l1 === 0 &&
  result.roundReset.round === 2 &&
  result.roundReset.turn === 'right' &&
  result.roundReset.leftScore === 1 &&
  result.roundReset.postResetBefore === 0 &&
  result.speedOn &&
  result.speedOff;

if (!expected) throw new Error(`Smoke test failed: ${JSON.stringify(result, null, 2)}`);
console.log(JSON.stringify({ success: true, ...result }, null, 2));
