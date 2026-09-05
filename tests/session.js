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
  people:[],loans:[],recurring:[],budgets:{'c-food':3000000},templates:[],imports:[]
};
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/',
  beforeParse(w){w.URL.createObjectURL=w.URL.createObjectURL||(()=> 'blob:fake');w.URL.revokeObjectURL=w.URL.revokeObjectURL||(()=>{});w.localStorage.setItem('hk-finance-v2',JSON.stringify(seed));w.localStorage.setItem('hk-setup-done','1');}});
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
  ok(JSON.parse(window.localStorage.getItem('hk-finance-v2')).txs.length===4,'persist() still writes without the chip');
  console.log(fails?'\n❌ '+fails+' FAILURES':'\n✅ REAL SESSION OK');
  process.exit(fails?1:0);
},1600);
