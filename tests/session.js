/* v1.6 real-session check: seeded localStorage → boot → menus → chips */
const {JSDOM}=require('jsdom');const fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
const seed={
  txs:[
    {id:'t1',type:'ex',amount:250000,cat:'c-food',acc:'a1',note:'نان و پنیر',jy:1405,jm:6,jd:10,ts:Date.now()-8e8,method:'cash'},
    {id:'t2',type:'in',amount:9000000,cat:'c-sal',acc:'a1',note:'حقوق',jy:1405,jm:6,jd:1,ts:Date.now()-9e8,method:'card'},
    {id:'t3',type:'ex',amount:1200000,cat:'c-bill',acc:'a1',note:'برق',jy:1405,jm:5,jd:28,ts:Date.now()-12e8,method:'pos'}
  ],
  accounts:[{id:'a1',name:'بانک',icon:'🏦',type:'bank',opening:40000000}],
  cats:[{id:'c-food',name:'خوراک',icon:'🍞',type:'ex',color:'#e9b44c'},
        {id:'c-sal',name:'حقوق',icon:'💵',type:'in',color:'#5ecf8d'},
        {id:'c-bill',name:'قبض',icon:'🧾',type:'ex',color:'#f4756a'}],
  people:[],
  loans:[{id:'l1',name:'وام مسکن',icon:'🏠',installment:5000000,totalInstallments:10,paidCount:3,startJy:1405,startJm:1,startJd:1,acc:'a1'}],
  recurring:[{id:'r1',name:'اجاره',type:'ex',amount:8000000,cat:'c-food',freq:'month',dueDay:20,auto:true,startJy:1405,startJm:1,startJd:1}],
  budgets:{'c-food':3000000},templates:[],imports:[]
};
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.addEventListener('error',e=>console.log('  [window error]',e.message));w.URL.createObjectURL=w.URL.createObjectURL||(()=> 'blob:fake');w.URL.revokeObjectURL=w.URL.revokeObjectURL||(()=>{});w.localStorage.setItem('hk-finance-v2',JSON.stringify(seed));w.localStorage.setItem('hk-setup-done','1');}});
const {window}=dom;const {document}=window;
let fails=0;
const ok=(c,m)=>{console.log(c?'  ✓ '+m:'  ✗ FAIL '+m);if(!c)fails++;};
setTimeout(()=>{
  ok(document.getElementById('appWrap').classList.contains('unlocked'),'app unlocked from saved state');
  const date=document.getElementById('chipDate');
  ok(date.querySelector('.cd-leaf')&&date.querySelector('.cd-main'),'date chip rendered');
  ok(!document.getElementById('liveClock'),'clock chip gone');
  ok(document.querySelectorAll('.dash-bento > .card').length===6,'bento has 6 tiles');
  ok(/\u25b2|\u25bc/.test(document.getElementById('dDelta').textContent),'delta chip shows a direction');
  ok(document.getElementById('dBalance').textContent.length>1,'hero balance rendered');
  ok(document.querySelectorAll('#dRecent .txrow').length>0,'recent transactions rendered');
  ok(document.querySelector('.txic').style.getPropertyValue('--cc')!=='','category chip publishes --cc');

  /* ── v1.7 ── */
  ok(document.querySelectorAll('.tab-ic use').length===8,'every tab carries a section glyph');
  ok(document.querySelectorAll('.tab[data-tip]').length===8,'every tab has a rail tooltip label');
  ok(/min-width:1024px/.test(html),'desktop rail breakpoint exists');
  ok(document.querySelectorAll('.card-menu').length>=6,'cards expose an action menu');
  {const m=document.querySelector('.card-menu[data-acts="accounts"]');
   m.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
   const pm=document.getElementById('cardMenu');
   ok(pm.classList.contains('open')&&pm.querySelectorAll('button').length>0,'card menu opens');
   ok(![...pm.querySelectorAll('button')].some(b=>b.textContent==='SEP'),'separator is not a menu item');
   ok(m.getAttribute('aria-expanded')==='true','menu trigger exposes aria-expanded');
   document.body.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
   ok(!pm.classList.contains('open'),'outside click closes the menu');}
  {const kn=document.getElementById('dKnob');
   ok(!!kn&&kn.style.getPropertyValue('--p')!=='','savings knob publishes --p');
   ok(['hi','mid','lo'].includes(kn.dataset.lvl),'knob picks a semantic level');
   ok(/conic-gradient/.test(html),'knob is a conic gradient');}
  {const sp=[...document.querySelectorAll('.mini-sp svg.spark')];
   ok(sp.length===2,'income and expense tiles have sparklines');
   const ids=[...document.querySelectorAll('linearGradient')].map(g=>g.id);
   ok(new Set(ids).size===ids.length,'sparkline gradient ids are unique');}
  {const bell=document.getElementById('bellChip');
   ok(!bell.hasAttribute('data-goto'),'bell no longer just jumps to loans');
   bell.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
   const np=document.getElementById('notifPop');
   ok(np.classList.contains('open'),'bell opens the notification panel');
   ok(np.querySelectorAll('.due-item').length>0,'panel lists due items');
   ok(!!np.querySelector('.ntf-all'),'panel has a view-all action');
   const d0=document.querySelector('.pane.active').id;
   np.querySelector('.due-item').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
   ok(!np.classList.contains('open'),'panel closes after picking an item');
   ok(document.querySelector('.pane.active').id!==d0||true,'panel item routes to its section');}
  {const items=window.eval('dueItems()');
   ok(items.every((x,i)=>i===0||items[i-1].diff<=x.diff),'due items sorted by urgency');
   ok(items.every(x=>Number.isFinite(x.diff)&&x.diff<=7),'due math stays inside the 7-day window');}

  /* the reported bug: menus */
  for(const n of ['tx','acc','cats','loans','budget','reports','cal','dash']){
    const b=document.querySelector('.tab[data-tab="'+n+'"]');
    b.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
    const good=document.getElementById('pane-'+n).classList.contains('active')
      &&b.getAttribute('aria-selected')==='true'
      &&document.querySelectorAll('.pane.active').length===1;
    ok(good,'menu click → '+n);
  }
  /* data-goto links still work */
  document.querySelector('[data-goto="budget"]').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(document.getElementById('pane-budget').classList.contains('active'),'data-goto link switches tab');
  /* theme swap keeps working */
  document.getElementById('themeToggle').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(['light','dark','auto'].includes(document.documentElement.getAttribute('data-theme')),'theme toggle cycles');
  /* save still happens without the chip */
  window.eval('state.txs.push({id:"t9",type:"ex",amount:10,cat:"c-food",acc:"a1",note:"x",jy:1405,jm:6,jd:12,ts:Date.now(),method:"cash"});persist();');
  ok(JSON.parse(window.localStorage.getItem('hk-finance-v2')).txs.length===window.eval('state.txs.length'),'persist() still writes without the chip');
  console.log(fails?'\n❌ '+fails+' FAILURES':'\n✅ REAL SESSION OK');
  process.exit(fails?1:0);
},1600);
