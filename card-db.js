/* Versioned static database. No credentials or official API calls in the browser. */
window.CardDB=(()=>{
 const base='https://megumi4150.github.io/xrossstars-card-assets/db/',key='xrossstars-card-db-v1';
 function validate(p){
  if(p?.schema!==1||typeof p.version!=='string'||!Array.isArray(p.cards)||p.cards.length!==p.total||!p.total||p.total>20000)throw Error('カードDBの形式が不正です');
  const ids=new Set();for(const c of p.cards){
   if(!Number.isInteger(c.id)||ids.has(c.id)||typeof c.name!=='string'||typeof c.effect!=='string'||typeof c.code!=='string'||!['leader','attack','memoria','tactics'].includes(c.type))throw Error('カード情報が不正です');ids.add(c.id);
   for(const k of ['local_image','local_awaken_image'])if(c[k]&&!/^card-images\/[\w.-]+\.png$/.test(c[k]))throw Error('画像パスが不正です');
   for(const k of ['image_url','awaken_image_url'])if(c[k]&&!String(c[k]).startsWith('https://assets.xross-stars.com/'))throw Error('画像URLが不正です');
  }return p;
 }
 let current={schema:1,version:'bundled-20260820',total:window.XROSS_ALL_CARDS.length,cards:window.XROSS_ALL_CARDS};
 try{const cached=JSON.parse(localStorage.getItem(key)||'null');if(cached){current=validate(cached);window.XROSS_ALL_CARDS=current.cards;}}catch(e){console.warn('保存DBを読めないため同梱DBを使用',e);}
 async function manifest(){const r=await fetch(base+'manifest.json?t='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('更新情報を取得できません');const m=await r.json();if(m.schema!==1||!/^cards-[a-f0-9]{20}\.json$/.test(m.file)||!m.sha256?.match(/^[a-f0-9]{64}$/))throw Error('更新情報が不正です');return m;}
 async function download(m){const r=await fetch(base+m.file,{cache:'no-cache',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('カードDBを取得できません');const bytes=await r.arrayBuffer();if(bytes.byteLength>10000000)throw Error('DBが大きすぎます');const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');if(hash!==m.sha256)throw Error('DB整合性チェックに失敗しました');const p=validate(JSON.parse(new TextDecoder().decode(bytes)));if(p.version!==m.version||p.total!==m.total)throw Error('DB版が一致しません');return {...p,updated_at:m.updated_at};}
 function commit(p){validate(p);localStorage.setItem(key,JSON.stringify(p));current=p;}
 return{validate,manifest,download,commit,get current(){return current}};
})();
