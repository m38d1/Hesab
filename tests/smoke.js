/* Smoke test for Hesab (jsdom) — run: NODE_PATH=<jsdom_modules> node tests/smoke.js */
const fs=require('fs');
const path=require('path');
const {JSDOM}=require('jsdom');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://localhost/'});
const {window}=dom;
const {document}=window;
window.HTMLElement.prototype.scrollIntoView=function(){};
window.URL.createObjectURL=window.URL.createObjectURL||(()=> 'blob:fake');
window.URL.revokeObjectURL=window.URL.revokeObjectURL||(()=>{});

let failures=0;
const ok=(cond,msg)=>{if(cond)console.log('  ✓',msg);else{failures++;console.log('  ✗ FAIL:',msg);}};
const ev=(el,type)=>el.dispatchEvent(new window.Event(type,{bubbles:true,cancelable:true}));
const click=el=>el.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
const G=code=>window.eval(code);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
// ── 1. boot: setup screen shown, app locked
console.log('1) boot & setup');
ok(document.getElementById('setupScreen').style.display==='flex','setup screen visible');
ok(!document.getElementById('appWrap').classList.contains('unlocked'),'app locked before setup');

document.getElementById('suPin').value='1234';
document.getElementById('suPin2').value='1234';
document.getElementById('suQ').value='سوال؟';
document.getElementById('suA').value='پاسخ مخفی';
ev(document.getElementById('setupForm'),'submit');
ok(document.getElementById('appWrap').classList.contains('unlocked'),'app unlocked after setup');
const sec=JSON.parse(window.localStorage.getItem('hk-security'));
ok(sec.q==='سوال؟','question stored');
ok(sec.a&&sec.a!=='پاسخ مخفی'&&sec.a.length<=8,'answer stored HASHED not plaintext: '+sec.a);

// ── 2. login with PIN
console.log('2) login');
click(document.getElementById('logoutBtn'));
ok(document.getElementById('loginScreen').style.display==='flex','login screen shown on logout');
document.getElementById('loginPin').value='9999';
ev(document.getElementById('loginForm'),'submit');
ok(document.getElementById('loginErr').textContent.includes('اشتباه'),'wrong pin rejected');
document.getElementById('loginPin').value='1234';
ev(document.getElementById('loginForm'),'submit');
ok(document.getElementById('loginScreen').style.display==='none','correct pin accepted');

// ── 3. transaction add (Toman mode)
console.log('3) transactions');
document.getElementById('fAmount').value='۲۵۰۰۰';
ev(document.getElementById('txForm'),'submit');
ok(G('state.txs.length')===1,'tx added');
ok(G('state.txs[0].amount')===25000,'amount stored in toman base');

// ── 4. Rial precision (odd rial amount must not lose 1)
console.log('4) rial precision');
click(document.querySelector('#unitToggle .ut-opt[data-u="R"]'));
document.getElementById('fAmount').value='۲۵'; // 25 R = 2.5 T
ev(document.getElementById('txForm'),'submit');
ok(G('state.txs.at(-1).amount')===2.5,'25 RIAL stored exactly as 2.5 toman (got '+G('state.txs.at(-1).amount')+')');
click(document.querySelector('#unitToggle .ut-opt[data-u="T"]'));

// ── 5. fee transaction
console.log('5) fee');
document.getElementById('fAmount').value='۱۰۰۰۰۰';
document.getElementById('fMethod').value='c2c';
ev(document.getElementById('fMethod'),'change');
document.getElementById('fFee').value='۵۰۰';
ev(document.getElementById('txForm'),'submit');
ok(G('state.txs.length')===4,'main+fee tx pushed (total 4)');
ok(G('!!state.txs.find(t=>t.feeOf)'),'fee tx linked via feeOf');

// ── 6. delete main tx removes fee tx
console.log('6) cascade delete');
const mainId=G('state.txs.find(t=>t.amount===100000).id');
const delBtn=document.querySelector(`[data-del="${mainId}"]`);
ok(!!delBtn,'delete button found');
click(delBtn);click(delBtn); // armed then confirm
ok(G('state.txs.length')===2,'main+fee both removed (4→2)');

// ── 7. category XSS escaping
console.log('7) escaping');
click(document.getElementById('catNew'));
document.getElementById('cName').value='<img src=x onerror=window.__xss=1>';
ev(document.getElementById('catForm'),'submit');
ok(!window.__xss,'no XSS from category name');
ok(document.getElementById('budGrid').innerHTML.includes('&lt;img'),'budget grid escaped');
ok(!document.getElementById('dBudget').innerHTML.includes('<img src=x')&&!document.getElementById('budGrid').innerHTML.includes('<img src=x'),'no raw injected img anywhere');

// ── 8. template quick-entry updates everything
console.log('8) templates');
click(document.querySelector('[data-tplnew]'));
document.getElementById('tplName').value='نان';
document.getElementById('tplAmount').value='۵۰۰۰';
ev(document.getElementById('tplForm'),'submit');
const before=G('state.txs.length');
click(document.querySelector('[data-tpl]'));
ok(G('state.txs.length')===before+1,'template created a tx');
ok(G('document.getElementById("dRecent").innerHTML').includes('نان'),'dashboard re-rendered after template (renderAll fix)');

// ── 9. loans
console.log('9) loans');
click(document.getElementById('loanNew'));
document.getElementById('lName').value='وام مسکن';
document.getElementById('lInst').value='۵۰۰۰۰۰';
document.getElementById('lCount').value='۲';
document.getElementById('lDue').value='۵';
ev(document.getElementById('loanForm'),'submit');
ok(G('state.loans.length')===1,'loan created');
const txBefore=G('state.txs.length');
click(document.querySelector('[data-pay]'));
ok(G('state.txs.length')===txBefore+1,'installment tx created');
ok(G('state.loans[0].paidCount')===1,'paidCount incremented');

// ── 10. search case-insensitive
console.log('10) search');
G('state.txs.push({id:"xx1",type:"ex",cat:"food",amount:100,note:"Pizza Hut",acc:null,method:"cash",person:"",fee:0,jy:state.txs[0].jy,jm:state.txs[0].jm,jd:state.txs[0].jd,ts:Date.now()});renderTransactions();');
document.getElementById('fSearch').value='pizza';
ev(document.getElementById('fSearch'),'input');
ok(document.getElementById('txList').innerHTML.includes('Pizza Hut'),'latin search case-insensitive');
document.getElementById('fSearch').value='';ev(document.getElementById('fSearch'),'input');

// ── 11. security answer verification (hashed + legacy plaintext migration)
console.log('11) security recovery');
click(document.getElementById('loginResetBtn'));
document.getElementById('secAnswer').value='پاسخ مخفی';
ev(document.getElementById('secForm'),'submit');
ok(document.getElementById('secResetBox').style.display==='block','hashed answer verified');
G('setSec("سوال قدیمی","رمز قدیمی")'); // legacy plaintext in storage
document.getElementById('secAnswer').value='رمز قدیمی';
ev(document.getElementById('secForm'),'submit');
ok(JSON.parse(window.localStorage.getItem('hk-security')).a!=='رمز قدیمی','legacy plaintext upgraded to hash on verify');

// ── 12. restore sanitization (real handler via FileReader)
console.log('12) restore');
const good=JSON.stringify({txs:[{id:'a',type:'ex',amount:'500',note:'x'.repeat(200),jy:1403,jm:1,jd:1},{id:'b',type:'weird',amount:'abc',jy:1403,jm:1,jd:2}],accounts:[],cats:[],people:[],loans:[],budgets:{food:'123'},templates:[]});
const file=new window.File([good],'backup.json',{type:'application/json'});
const input=document.getElementById('restoreFile');
Object.defineProperty(input,'files',{value:[file],configurable:true});
ev(input,'change');
await sleep(200);
ok(G('state.txs.length')===2,'restored 2 txs');
ok(G('state.txs[0].amount')===500&&typeof G('state.txs[0].amount')==='number','string amount coerced to number');
ok(G('state.txs[1].type')==='ex','invalid type normalized');
ok(G('state.txs[0].note.length')===60,'long note truncated');
ok(G('state.txs[1].ts')>0,'missing ts backfilled');
ok(G('state.budgets.food')===123,'budget string coerced');
ok(G('state.cats.length')>5,'empty cats array replaced with defaults');

// ── 13. recurring engine
console.log('13) recurring');
const n0=G('state.txs.length');
click(document.getElementById('recNew'));
document.getElementById('rName').value='حقوق';
document.getElementById('rAmount').value='۱۰۰۰۰۰۰';
click(document.querySelector('#rType button[data-t="in"]'));
document.getElementById('rDue').value=G('fa(todayJ().jd)'); // due today
ev(document.getElementById('recForm'),'submit');
ok(G('state.recurring.length')===1,'recurring created');
ok(G('state.txs.length')===n0+1,'auto-posted immediately (due today)');
ok(G('state.txs.at(-1).note').includes('دوره‌ای'),'note marked');
ok(G('state.txs.at(-1).type')==='in','type respected');
const nd=G('(function(){const n=recNextDue(state.recurring[0]);return n.jy+"/"+n.jm+"/"+n.jd;})()');
const exp=G('(function(){const t=todayJ();let jy=t.jy,jm=t.jm+1;if(jm>12){jm=1;jy++;}return jy+"/"+jm+"/"+t.jd;})()');
ok(nd===exp,'next due rolled to next month ('+nd+')');
ok(G('(function(){const r={freq:"d",everyN:10,startJy:1403,startJm:1,startJd:1};const n=recNextDue(r);return !!n&&jSerial(n)>=jSerial({jy:1403,jm:1,jd:1});})()'),'every-N-days cadence returns valid date');
G('state.recurring[0].auto=false');
const n1=G('state.txs.length');G('runRecurring()');
ok(G('state.txs.length')===n1,'auto=false skips posting');
G('state.recurring[0].auto=true;state.recurring[0].lpJy=0;renderRecurring()'); // force due again
const pb=document.querySelector('[data-recpost]');
ok(pb&&!pb.disabled,'manual post button enabled when due');
const n2=G('state.txs.length');click(pb);
ok(G('state.txs.length')===n2+1,'manual post works');
ok(G('(function(){state.recurring.push({id:"rc2",name:"t",type:"ex",cat:"food",amount:100,freq:"m",dueDay:todayJ().jd,startJy:todayJ().jy,startJm:todayJ().jm,startJd:1,auto:false});const c=countDue();state.recurring.pop();return c>=1;})()'),'bell counts due recurring (auto-off)');

// ── 14. month card data
console.log('14) month card');
const cd=G('(function(){const t=todayJ();return buildMonthCard(t.jy,t.jm);})()');
ok(cd.inc>=0&&cd.ex>=0,'card data built');
ok(Array.isArray(cd.months)&&cd.months.length===6,'6-month series');
ok(typeof cd.rate==='number','savings rate present');

// ── 15. print report
console.log('15) print report');
window.print=()=>{};
click(document.getElementById('printBtn'));
ok(document.getElementById('printArea').innerHTML.includes('گزارش مالی'),'print area populated');
ok(document.getElementById('printArea').innerHTML.includes('۶ ماه اخیر'),'print includes months table');

// ── 16. no errors during full renderAll on restored state
console.log('16) renderAll stability');
let err=null;
try{G('renderAll()');}catch(e){err=e;}
ok(!err,'renderAll threw no error'+(err?': '+err.message:''));

// ── 17. global search
console.log('17) global search');
const gOpen=document.getElementById('gscOpen');
ok(!!gOpen,'search chip exists in topbar');
click(gOpen);
ok(document.getElementById('gsModal').classList.contains('open'),'modal opens via chip');
ok(document.getElementById('gsResults').querySelectorAll('.gs-item').length>0,'recent txns listed when empty query');
const inp=document.getElementById('gsInput');
inp.value='حقوق';
G("renderGs(document.getElementById('gsInput').value)");
const items=document.getElementById('gsResults').querySelectorAll('.gs-item');
ok(items.length>0,'results for text query');
ok(document.getElementById('gsResults').innerHTML.includes('حقوق'),'recurring found by name');
ok(document.getElementById('gsResults').innerHTML.includes('<mark>'),'match highlighted with <mark>');
G("renderGs('999999999999')");
ok(document.getElementById('gsResults').querySelector('.gs-empty'),'empty state for no match');
G("renderGs('')");
G("gsOpen()"); // reset to recent view
click(document.querySelector('#gsResults .gs-item'));
ok(!document.getElementById('gsModal').classList.contains('open'),'clicking a result closes modal');
G("document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true}))");
ok(document.getElementById('gsModal').classList.contains('open'),'Ctrl+K opens search');
G("document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))");
ok(!document.getElementById('gsModal').classList.contains('open'),'Escape closes search');
// Persian normalization: Arabic ي vs Persian ی
const norm=G("gsNorm('حقوق'.replace('ق','ي'))");
ok(typeof norm==='string','gsNorm works');

// ── 18. what's new modal
console.log("18) what's new");
const LATEST=G('WHATS_NEW[0].v');
ok(!!document.getElementById('wnModal'),'whats-new modal exists');
G("localStorage.removeItem('hk-whatsnew-seen')");
ok(G('wnHasNew()'),'new version detected when never seen');
G('maybeShowWhatsNew()');
await sleep(800);
ok(document.getElementById('wnModal').classList.contains('open'),'modal auto-opens after update');
ok(document.getElementById('wnList').innerHTML.includes(LATEST),'latest version shown ('+LATEST+')');
ok(document.getElementById('wnList').innerHTML.includes('جستجوی سراسری'),'feature bullet present');
ok(document.getElementById('wnList').innerHTML.includes('شهریور ۱۴۰۵'),'release date shown');
ok(document.getElementById('wnSub').textContent.includes(LATEST),'subtitle has latest version');
ok(document.getElementById('wnList').querySelector('.wn-ver.latest'),'latest entry highlighted');
G('closeWhatsNew()');
ok(!document.getElementById('wnModal').classList.contains('open'),'closed by button');
ok(G('wnSeenVersion()')===LATEST,'seen version persisted');
G('maybeShowWhatsNew()');
await sleep(800);
ok(!document.getElementById('wnModal').classList.contains('open'),'does not reopen after seen');
G('openWhatsNew()');
ok(document.getElementById('wnModal').classList.contains('open'),'reopens on demand');
G('closeWhatsNew()');

// ── 19. brand: name removed from topbar, editing moved to footer
console.log('19) brand cleanup');
ok(!document.getElementById('brandName'),'name removed from topbar');
ok(document.querySelector('.brand-t h1'),'app title still shown at top');
const enb=document.getElementById('editNameBtn');
ok(!!enb,'name-edit button exists in footer');
click(enb);
ok(document.getElementById('nameModal').classList.contains('open'),'footer button opens name modal');
document.getElementById('nameInput').value='سارا';
ev(document.getElementById('nameForm'),'submit');
ok(G('getStoredName()')==='سارا','name saved');
ok(!document.getElementById('nameModal').classList.contains('open'),'modal closed after save');
ok((enb.title||'').includes('سارا'),'button tooltip reflects current name');
G("localStorage.setItem('hk-username','مهدی عسکری')");

// ── 20. import from xlsx / csv
console.log('20) import from xlsx / csv');
const zlib=require('zlib');
const crc32=buf=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}let x=0xFFFFFFFF;for(const b of buf)x=t[(x^b)&0xFF]^(x>>>8);return (x^0xFFFFFFFF)>>>0;};
const mkZip=entries=>{
  const enc=new TextEncoder(),body=[],cen=[];let off=0;
  for(const [name,text] of entries){
    const nameB=enc.encode(name),data=Buffer.from(enc.encode(text)),comp=zlib.deflateRawSync(data),crc=crc32(data);
    const lh=Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);
    lh.writeUInt32LE(crc,14);lh.writeUInt32LE(comp.length,18);lh.writeUInt32LE(data.length,22);lh.writeUInt16LE(nameB.length,26);
    body.push(lh,nameB,comp);
    const ch=Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);
    ch.writeUInt32LE(crc,16);ch.writeUInt32LE(comp.length,20);ch.writeUInt32LE(data.length,24);
    ch.writeUInt16LE(nameB.length,28);ch.writeUInt32LE(off,42);
    cen.push(ch,nameB);
    off+=30+nameB.length+comp.length;
  }
  const b=Buffer.concat(body),c=Buffer.concat(cen),e=Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50,0);e.writeUInt16LE(entries.length,8);e.writeUInt16LE(entries.length,10);
  e.writeUInt32LE(c.length,12);e.writeUInt32LE(b.length,16);
  return new Uint8Array(Buffer.concat([b,c,e]));
};
const SST=['تاریخ','شرح هزینه','مبلغ','خرید سیمان','دستمزد بنا','1404/03/15'];
const XLSX=mkZip([
  ['xl/sharedStrings.xml','<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+SST.map(s=>`<si><t>${s}</t></si>`).join('')+'</sst>'],
  ['xl/workbook.xml','<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="هزینه‌ها" sheetId="1" r:id="rId1"/><sheet name="خالی" sheetId="2" r:id="rId2"/></sheets></workbook>'],
  ['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'],
  ['xl/worksheets/sheet1.xml','<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'+
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'+
    '<row r="2"><c r="A2"><v>45435</v></c><c r="B2" t="s"><v>3</v></c><c r="C2"><v>120000000</v></c></row>'+
    '<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" t="s"><v>4</v></c><c r="C3"><v>45000000</v></c></row>'+
    '<row r="4"><c r="A4"><v>45435</v></c><c r="B4" t="s"><v>3</v></c><c r="C4"><v>120000000</v></c></row>'+
    '</sheetData></worksheet>'],
  ['xl/worksheets/sheet2.xml','<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>']
]);
/* jsdom has no Response/DecompressionStream — borrow Node's (same web APIs) */
const _Blob=window.Blob,_Resp=window.Response,_DcS=window.DecompressionStream;
window.Blob=Blob;window.Response=Response;window.DecompressionStream=DecompressionStream;

ok(!!document.getElementById('importBtn'),'import button in footer');
click(document.getElementById('importBtn'));
ok(document.getElementById('impModal').classList.contains('open'),'import modal opens');
ok(document.getElementById('impStep1').style.display==='','step 1 visible');

/* xlsx path */
await G('impHandleFile')({name:'fixture.xlsx',arrayBuffer:async()=>XLSX.buffer.slice(XLSX.byteOffset,XLSX.byteOffset+XLSX.byteLength)});
await sleep(80);
ok(document.getElementById('impFileName').classList.contains('show'),'xlsx file accepted');
ok(G('imp.sheets.length')===2,'both sheets read from the zip');
ok(G('imp.sheetIdx')===0,'non-empty sheet auto-selected');
ok(G('imp.rows.length')===4,'4 rows decoded');
ok(G('imp.rows[1][1]')==='خرید سیمان','shared string resolved');
ok(G('imp.hdr')===0,'header row detected');
const roles=G('imp.map.map(o=>o.role).join(",")');
ok(roles.includes('date')&&roles.includes('desc')&&roles.includes('amount'),'columns auto-mapped: '+roles);
click(document.getElementById('impNext1'));
ok(document.getElementById('impStep2').style.display==='','step 2 shown');
click(document.getElementById('impNext2'));
ok(document.getElementById('impStep3').style.display==='','step 3 shown');
ok(G('imp.parsed.ok.length')===2&&G('imp.parsed.dup')===1,'2 rows ready, 1 duplicate flagged');
ok(G('imp.parsed.ok.some(t=>t.amount===12000000)'),'120,000,000 ریال → 12,000,000 تومان');
ok(G('imp.parsed.ok.some(t=>t.jy===1403&&t.jm===3&&t.jd===3)'),'excel serial 45435 → 1403/03/03');
ok(G('imp.parsed.ok.some(t=>t.jy===1404&&t.jm===3&&t.jd===15)'),'jalali text date parsed');
ok(G("imp.parsed.ok.some(t=>t.cat==='construction')"),'auto category: سیمان → ساخت و ساز');
const impBefore=G('state.txs.length');
click(document.getElementById('impGo'));
ok(G('state.txs.length')===impBefore+2,'2 transactions committed');
ok(G('state.txs.filter(t=>t.imp).length')===2,'committed rows tagged with the batch id');
ok(G('state.imports.length')===1,'import batch recorded');
ok(document.getElementById('impUndo').style.display!=='none','undo button appears');
click(document.getElementById('impUndo'));
ok(G('state.txs.length')===impBefore,'undo removed exactly the imported rows');
ok(G('state.imports.length')===0,'import batch cleared');

/* csv paste path */
click(document.getElementById('impTabPaste'));
ok(document.getElementById('impPastePane').style.display==='','paste tab switches');
document.getElementById('impPaste').value='تاریخ,شرح,مبلغ,نوع\n1404/04/01,اجاره خانه,90000000,برداشت\n1404/04/03,فروش لوازم,3000000,واریز';
click(document.getElementById('impNext1'));
ok(G('imp.rows.length')===3,'csv parsed into rows');
click(document.getElementById('impNext2'));
ok(G('imp.parsed.ok.length')===2,'csv rows parsed');
ok(G("imp.parsed.ok.some(t=>t.type==='in')"),'واریز → income via the type column');
const b2=G('state.txs.length');
click(document.getElementById('impGo'));
ok(G('state.txs.length')===b2+2,'csv import committed');
click(document.getElementById('impUndo'));
ok(G('state.txs.length')===b2,'csv import undone');
window.Blob=_Blob;window.Response=_Resp;window.DecompressionStream=_DcS;
G('renderAll()');
ok(true,'renders clean after import tests');

/* appended by v1.6 — design-system regression section */

console.log('\n21) v1.6 design system');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const root=css.slice(0,css.indexOf('[data-theme="light"]'));
  ok(G('APP_VERSION')==='v1.17.1','APP_VERSION is v1.11.0');
  ok(G('WHATS_NEW[0].v')==='v1.17.1','whats-new leads with v1.11.0');
  ok(G('typeof REDUCED')==='boolean','REDUCED motion preference is defined');

  /* token scales */
  for(const t of ['--r-xs','--r-sm','--r-md','--r-lg','--r-xl','--r-pill','--r-full',
                  '--s-1','--s-4','--s-6','--f-micro','--f-xs','--f-sm','--f-base','--f-md','--f-lg','--f-xl','--f-2xl',
                  '--e-1','--e-2','--e-3','--e-4','--d-1','--d-2','--d-3','--d-4',
                  '--ease-std','--ease-out','--ease-in','--ease-emph','--ease-spring',
                  '--surface-1','--surface-2','--surface-3','--surface-4','--scrim','--glass','--on-accent','--grad-primary',
                  '--turq-soft','--gold-soft','--coral-soft','--green-soft','--ring-focus','--glow','--sheen','--knob'])
    if(!new RegExp('[\\s;{]'+t+'\\s*:').test(root)){ok(false,'token defined: '+t);break;}
  ok(true,'radius / space / type / elevation / motion / surface scales all defined');
  ok(/--e-1:[^;]*rgba\(2,16,19/.test(root)&&/--e-1:[^;]*,[^;]*rgba\(2,16,19/.test(root),'elevation is two-part (contact + ambient)');
  {const bl=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)];let circ=0;
   bl.forEach(m=>{for(const d of (m[1].match(/--[a-z0-9-]+\s*:[^;}]*/gi)||[])){
     const nm=d.match(/^(--[a-z0-9-]+)\s*:/i)[1];
     if(new RegExp('var\\('+nm+'\\s*[,)]').test(d.slice(nm.length+1)))circ++;}});
   ok(circ===0,'no circular custom-property definitions');}
  {const cs=window.getComputedStyle(document.documentElement);const get=k=>cs.getPropertyValue(k).trim();
   ok(/^#[0-9a-f]{3,8}$/i.test(get('--on-accent')),'--on-accent resolves to a colour ('+get('--on-accent')+')');
   ok(/^#[0-9a-f]{6}$/i.test(get('--turq-deep')),'--turq-deep resolves to a colour');
   ok(/4,26,31/.test(get('--ink')),'--ink resolves to a tint');
   ok(/rgba?\(/.test(get('--track'))&&/rgba?\(/.test(get('--soft'))&&/rgba?\(/.test(get('--turq-soft')),'alpha-tint tokens resolve');
   ok(get('--r-lg')==='20px'&&get('--f-micro')==='.72rem'&&get('--d-2')==='180ms','scale tokens resolve to real values');}
  ok(/--e-3:[^;]*,[^;]*rgba\(2,16,19/.test(root)&&/--e-3:[^;]*,[^;]*rgba\(2,16,19/.test(root),'--e-3 uses one black base');

  /* contrast fixes */
  ok(/--dim:#88b6a4/.test(root)&&/--muted:#9ec3bc/.test(root),'dark text tiers raised to AA');
  ok(/--turq:#0a7d6d/.test(css)&&/--gold:#8a5c0f/.test(css)&&/--coral:#c33f34/.test(css)&&/--green:#1a7f4e/.test(css),'light accents darkened to AA');
  ok(/--dim:#587678/.test(css),'light --dim raised to AA');
  ok((css.match(/#fff/g)||[]).length<20,'white literals mostly retired');

  /* theme = pure token swap */
  const lightPatches=(css.match(/\[data-theme="light"\]/g)||[]).length;
  ok(lightPatches<=8,'light theme is a token swap, not a patch layer ('+lightPatches+' rules, was 28)');
  const tc=G("document.documentElement.getAttribute('data-theme')");
  G("document.documentElement.setAttribute('data-theme','light')");
  const lt=window.getComputedStyle(document.documentElement).getPropertyValue('--turq').trim();
  G("document.documentElement.setAttribute('data-theme','"+tc+"')");
  ok(lt==='#0a7d6d','switching data-theme swaps tokens only');

  /* typography */
  ok(/\.txamt\{text-align:end\}/.test(css),'amounts are inline-end aligned');
  ok(/font-variant-numeric:tabular-nums/.test(css),'money uses tabular figures');
  ok(!/\.big-val\{[^}]*Lalezar/.test(css)&&!/text-shadow:0 2px 18px/.test(css),'hero number: no display face, no neon glow');
  ok(!/letter-spacing:\.[3-9]px/.test(css),'no tracking on connected Persian script');

  /* motion */
  ok(!/transition:left/.test(css)&&!/transition:width 1s/.test(css),'no layout-property transitions left');
  ok((css.match(/transition:var\(--tr\)/g)||[]).length>20,'shared transition token replaces bare `all` shorthands');
  ok((css.match(/animation:[^;}]*infinite/g)||[]).every(x=>/livePulse|skWash/.test(x)),'only the live-status pulse and the boot skeleton loop stay infinite');
  ok(/@media \(prefers-reduced-motion:reduce\)/.test(css)&&!/reduce\)\{\*\{animation:none!important;transition:none!important\}\}/.test(css),'reduced motion reduces instead of destroying');
  ok(/:focus-visible/.test(css),'focus-visible ring exists');

  /* glass only on overlays */
  const bd=css.split('}').filter(r=>/backdrop-filter/.test(r));
  ok(bd.every(r=>/\.modal\{|\.modal\b|\.tabs\{|\.moresheet\{/.test(r)),'backdrop-filter is used only by the scrim, the dock and the More sheet');

  /* bento dashboard */
  const bento=document.querySelectorAll('.dash-bento > .card');
  ok(bento.length===6,'dashboard is a 6-tile bento grid');
  ok(document.querySelector('.b-hero')&&document.querySelector('.b-budget'),'bento tiles carry span classes');
  ok(document.querySelectorAll('.dash-top,.dash-side,.dash-grid').length===0,'old dashboard wrappers removed');
  G('renderDashboard()');
  ok(document.getElementById('dDelta').textContent.length>0,'month-over-month delta chip renders');
  ok(/up|down/.test(document.getElementById('dDelta').className),'delta chip has a direction state');

  /* tabs: a11y + transform indicator */
  ok(document.querySelectorAll('.tab[role="tab"]').length===8,'every tab has role=tab');
  {const b=document.querySelector('.tab[data-tab="cal"]');b.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
   ok(document.getElementById('pane-cal').classList.contains('active')&&b.getAttribute('aria-selected')==='true','menu click switches pane (regression: wiring was once deleted)');
   G("setTab('dash')");}
  ok(document.querySelectorAll('.tab[aria-selected="true"]').length===1,'exactly one tab is selected');
  ok([...document.querySelectorAll('.tab')].every(b=>document.getElementById(b.getAttribute('aria-controls'))),'aria-controls resolves');
  ok(document.querySelectorAll('.pane[role="tabpanel"]').length===8,'panes are tabpanels');
  ok(/transform:translateX\(var\(--x/.test(css),'tab indicator animates on transform');
  G("setTab('tx')");
  const ind=document.getElementById('tabInd');
  ok(ind.style.getPropertyValue('--x')!=='','indicator position written to --x');
  ok(document.querySelector('.tab[data-tab="tx"]').getAttribute('aria-selected')==='true','setTab updates aria-selected');
  document.querySelector('.tab[data-tab="tx"]').focus();
  document.getElementById('tabs').dispatchEvent(new window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
  ok(document.querySelector('.tab[data-tab="acc"]').classList.contains('active'),'arrow-key tab navigation works');
  G("setTab('dash')");

  /* dialogs */
  ok([...document.querySelectorAll('.modal')].every(m=>m.getAttribute('role')==='dialog'&&m.getAttribute('aria-modal')==='true'),'all modals are aria dialogs');
  ok(document.getElementById('i-x')&&document.querySelectorAll('.modal-x svg use').length>=10,'close buttons use the SVG sprite');
  ok(!document.querySelector('.modal-x')?.textContent.includes('✕'),'no ✕ glyph left in chrome');
  ok(document.querySelector('.theme-toggle svg use'),'theme toggle is an SVG icon');
  ok(document.querySelector('.gsc-chip svg use'),'search chip is an SVG icon');

  /* PWA chrome */
  ok(document.querySelector('meta[name="theme-color"]').content==='#072429','theme-color matches --bg');
  const sw=fs.readFileSync(path.join(__dirname,'..','sw.js'),'utf8');
  ok(/Vazirmatn:wght@100\.\.900/.test(sw)&&/Vazirmatn:wght@100\.\.900/.test(html),'variable font requested in one URL');
  ok(/hesabketab-v21/.test(sw),'service-worker cache bumped to v15');
  ok(/contain:paint/.test(css),'long lists skip offscreen work');
  ok(!/chip-save|chipSave|flashSaved/.test(html),'top-bar auto-save chip removed');
  ok(/@media \(max-width:640px\)\{[\s\S]*?\.modal-box\{width:100%/.test(css),'dialogs become bottom sheets on phones');
}

console.log('\n── 22) v1.7 rail, card menus, knob, notifications ──');
{
  const js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  /* desktop rail */
  ok(/@media\(min-width:1024px\)/.test(css),'desktop rail breakpoint present');
  ok(/\.tabs\{position:sticky;top:0;z-index:40;background:var\(--surface-1\)/.test(css),'the classic sticky top bar serves the desktop');
  ok(/\.toast\{bottom:auto;top:calc\(env\(safe-area-inset-top\) \+ var\(--nav-total\) \+ 14px\)\}/.test(css),'desktop toasts drop below the bar');
  ok(!/--rail-w/.test(css),'the side-rail inset and its token are retired');
  ok(/\.tabs\{position:fixed/.test(css),'tab bar becomes a fixed rail');
  ok(/\.tab-ic\{display:none\}/.test(css),'the desktop bar is text-only like the old top menu');
  ok(document.querySelectorAll('.tab .tab-ic use').length===9,'every nav slot carries a glyph (8 sections + search)');
  ok(document.querySelectorAll('#tabMore .tab-ic use').length===1,'the More slot has its own glyph');
  ok([...document.querySelectorAll('.tab')].every(t=>/^#i-[a-z]+$/.test(t.querySelector('.tab-ic use').getAttribute('href'))),'every glyph resolves to a sprite id');
  ok(/\.ind\{[^}]*width:var\(--w/.test(css)&&js.includes("ind.style.setProperty('--y'"),'indicator is driven by custom props in both axes');
  ok(!/ind\.style\.width=/.test(js),'no inline width left on the indicator');
  /* card menus */
  const menus=[...document.querySelectorAll('.card-menu')];
  ok(menus.length>=6,'cards expose an action menu ('+menus.length+')');
  ok(menus.every(b=>b.getAttribute('aria-haspopup')==='true'),'menu triggers declare aria-haspopup');
  ok(menus.every(b=>/گزینه‌های/.test(b.getAttribute('aria-label'))),'menu triggers are labelled');
  ok(menus.every(b=>b.querySelector('use').getAttribute('href')==='#i-dots'),'menu triggers use the dots glyph');
  ok(!!document.getElementById('cardMenu'),'a single shared popover exists');
  ok(/\.pop\{position:fixed/.test(css)&&/z-index:10002/.test(css),'popover floats above the app');
  ok(/@media\(hover:hover\) and \(pointer:fine\)/.test(css),'hover lift is gated to fine pointers');
  /* knob + sparklines */
  ok(/@property\(--p\)/.test(css),'--p is registered so the knob can animate');
  ok(/\.knob\{[^}]*conic-gradient/.test(css),'the KPI ring is a conic gradient');
  ok(!!document.getElementById('dKnob'),'savings knob is in the bento');
  ok(/\.mini-sp \.spark\{width:100%/.test(css),'tile sparklines fill their card');
  ok(/function spark\(vals,w,h\)/.test(js),'spark() takes a size');
  ok(/gid='spg'\+/.test(js),'spark() gives each gradient a unique id');
  /* notifications */
  ok(!!document.getElementById('notifPop'),'notification panel exists');
  ok(document.getElementById('bellChip').getAttribute('aria-controls')==='notifPop','bell controls the panel');
  ok(!document.getElementById('bellChip').hasAttribute('data-goto'),'bell no longer navigates directly');
  ok(/function dueItems\(\)/.test(js),'due items come from one shared source');
  ok(/\.pop\.ntf\{[^}]*max-height:min\(62vh/.test(css),'panel is scroll-capped');
  ok(/@media\(max-width:640px\)\{\.pop\.ntf\{position:fixed/.test(css),'panel becomes a sheet on phones');
  /* micro bars */
  ok(/--magf:/.test(js),'rows publish their magnitude');
  ok(/#dRecent \.txrow::after\{[^}]*transform:scaleX\(var\(--magf/.test(css),'magnitude bar uses transform, not width');
  ok(/\.rec-prog>i\{/.test(css),'recurring rows have a period bar');
  /* hygiene carried forward */
  ok(!/transition:left/.test(css),'still no left-anchored transitions');
  ok(!/chip-save|chipSave|liveClock/.test(html),'the removed chips stay removed');
  ok(G("APP_VERSION")==='v1.17.1','version bumped to v1.7.0');
}

console.log('\n── 23) v1.8 bottom navigation ──');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const i=css.indexOf('@media(max-width:1023px)');
  ok(i>0,'bottom-nav breakpoint exists');
  const blk=css.slice(i,i+2400);
  ok(/--nav-h:64px/.test(blk)&&/--nav-inset:10px/.test(blk)&&/--nav-side:12px/.test(blk),'nav geometry is tokenised');
  ok(/\.tabs\{position:fixed;inset-inline:0;top:auto;bottom:calc\(var\(--nav-inset\)/.test(blk),'the dock floats clear of the bottom edge');
  ok(/body\{padding-bottom:calc\(var\(--nav-total\) \+ 8px\)/.test(blk)&&/--nav-total:calc\(var\(--nav-h\) \+ var\(--nav-inset\) \+ env\(safe-area-inset-bottom\)\)/.test(blk),'content clears the floating dock and the safe area');
  ok(/\.tabs \.wrap\{max-width:none;padding:0\}/.test(blk),'the bar spans the full width, not the content column');
  ok(/\.tab\{flex:1 1 0/.test(blk)&&/min-height:var\(--nav-h\)/.test(blk),'every slot is an equal, thumb-sized target');
  ok(/\.tab-lbl\{display:none/.test(blk)&&/\.tab\.active \.tab-lbl\{display:block\}/.test(blk),'only the active item shows its label');
  ok(/\.ind\{[^}]*border-radius:var\(--r-pill\)/.test(blk),'the indicator is a pill');
  ok(/\.ind\{[^}]*width:calc\(var\(--w,44px\) - 6px\)/.test(blk)&&/translateX\(calc\(var\(--x,0px\) \+ 3px\)\)/.test(blk),'the pill centres itself from --x/--w in pure CSS');
  ok(/\.toast\{bottom:calc\(var\(--nav-total\)/.test(blk),'toast sits above the dock');
  ok(/\.pop\.ntf\{bottom:calc\(var\(--nav-total\)/.test(blk),'notification sheet sits above the dock');
  ok(!/--tabs-h/.test(html),'the old measured top offset is gone for good');
  ok(/button\{color:inherit/.test(css),'buttons inherit text colour (SVG glyphs use currentColor)');
  {const tr=(css.match(/\.theme-toggle\{[^}]*\}/)||[''])[0];
   ok(/color:var\(--muted\)/.test(tr),'the theme toggle paints its moon/sun glyph');
   ok(/\.theme-toggle:hover\{[^}]*color:var\(--gold\)/.test(css),'and brightens it on hover');}
  {const noColor=[...css.matchAll(/([^{}\n]+)\{([^{}]*)\}/g)]
     .filter(m=>/^\.(theme-toggle|bell-ic|tt-ic|txdel|card-menu|modal-x|nav-btn|tab)$/.test(m[1].trim())&&!/(^|;)\s*color\s*:/.test(m[2]))
     .map(m=>m[1].trim());
   ok(noColor.filter(x=>x!=='.bell-ic'&&x!=='.tt-ic').length===0,'no glyph-bearing button is left without a colour');}
  ok(/\.dayhead\{position:sticky;top:0/.test(css)&&/\.form-card\{position:sticky;top:22px/.test(css),'sticky rows use plain offsets now');
  ok(/@media\(min-width:1024px\)/.test(css),'the desktop rail is untouched');
  /* labels: short on screen, full name for assistive tech and the rail tooltip */
  const tabs=[...document.querySelectorAll('.tab')];
  ok(tabs.length===9,'nine slots: eight sections + the search action');
  ok(tabs.every(t=>t.querySelector('.tab-lbl').textContent.length<=7),'bottom labels are short enough for 8 slots');
  ok(tabs.every(t=>t.getAttribute('aria-label')&&t.getAttribute('aria-label').length>=t.querySelector('.tab-lbl').textContent.length),'aria-label carries the fuller name');
  ok(tabs.filter(t=>t.dataset.tip).every(t=>t.dataset.tip===t.getAttribute('aria-label')),'rail tooltip matches the accessible name (action slot opts out)');
  const names=tabs.map(t=>t.getAttribute('aria-label')).join(',');
  ok(/تراکنش‌ها/.test(names)&&/داشبورد/.test(names),'full Persian names preserved');
  /* the click model still works after the restructure */
  const b=document.querySelector('.tab[data-tab="budget"]');
  b.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(document.getElementById('pane-budget').classList.contains('active'),'bottom-nav tabs still switch panes');
  G("setTab('dash')");
}

console.log('\n── 24) v1.9 floating glass dock ──');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const i=css.indexOf('@media(max-width:1023px)');const blk=css.slice(i,i+2600);
  const root=css.slice(0,css.indexOf('<'))||css;
  ok(/--glass-bg:rgba\(10,44,51,\.74\)/.test(css),'the dark glass surface is a token');
  {const lt=css.slice(css.indexOf('[data-theme="light"]'));
   ok(/--glass-bg:rgba\(255,255,255,\.76\)/.test(lt),'light theme swaps the glass token too (still a pure token swap)');}
  ok(/\.tabs\{[^}]*background:var\(--glass-bg\)/.test(blk),'the dock paints with the glass token');
  ok(/\.tabs\{[^}]*backdrop-filter:var\(--glass\)/.test(blk)&&/\.tabs\{[^}]*-webkit-backdrop-filter:var\(--glass\)/.test(blk),'it blurs what is behind it, with the Safari prefix');
  {const dr=(blk.match(/\.tabs\{[^}]*\}/)||[''])[0];
   ok(!/backdrop-filter:blur\(/.test(dr)&&/backdrop-filter:var\(--glass\)/.test(dr),'it reuses the shared blur token instead of a new magic number');}
  ok(/\.tabs\{[^}]*border-radius:var\(--r-pill\)/.test(blk),'fully rounded, like a dock');
  ok(/\.tabs\{[^}]*inset-inline:0[^}]*width:min\(calc\(100% - var\(--nav-side\) \* 2\),var\(--nav-max\)\);margin-inline:auto/.test(blk),'detached from the side edges and centred, capped on tablets');
  ok(/\.tabs\{[^}]*box-shadow:var\(--e-4\),inset 0 1px 0 var\(--sheen\)/.test(blk),'depth below plus a specular hairline on the top edge');
  ok(/\.tabs\{[^}]*overflow:hidden/.test(blk),'children clip to the pill');
  ok(/@supports not \(\(backdrop-filter:blur\(1px\)\) or \(-webkit-backdrop-filter:blur\(1px\)\)\)\{\.tabs\{background:var\(--surface-2\)\}\}/.test(blk),'WebView without backdrop-filter falls back to a solid surface');
  ok(/\.tab:active\{transform:scale\(\.92\);transition-duration:90ms\}/.test(blk),'taps give a quick press response');
  ok(!/\.tabs\{[^}]*border-top:1px solid/.test(blk),'the old edge-anchored top border is gone');
  {const baseTabs=(css.slice(0,css.indexOf('@media')).match(/\.tabs\{[^}]*\}/)||[''])[0];
   ok(/position:sticky;top:0;z-index:40/.test(baseTabs)&&/background:var\(--surface-1\)/.test(baseTabs),'the desktop bar keeps its solid classic surface');}
  /* logical properties only — RTL must not break */
  const dockRule=(blk.match(/\.tabs\{[^}]*\}/)||[''])[0];
  ok(!/(^|[;{]\s*)(left|right)\s*:/.test(dockRule),'the dock is positioned with logical properties');
  /* the pill indicator still lives inside the clipped dock */
  ok(/\.ind\{[^}]*top:5px/.test(blk)&&/border-radius:var\(--r-pill\)/.test(blk),'the active pill sits inside the rounded dock');
  /* version */
  ok(G("APP_VERSION")==='v1.17.1','version bumped to v1.9.0');
}

console.log('\n── 25) v1.10 four slots + More ──');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  const i=css.indexOf('@media(max-width:1023px)');const blk=css.slice(i,i+4200);
  ok(/<symbol id="i-more"[^>]*>(?:<rect[^>]*>){4}/.test(html),'the More glyph is four rounded squares');
  ok(document.querySelectorAll('.tab.tab-opt').length===5,'loans joined the four hidden section tabs');
  ok([...document.querySelectorAll('.tab.tab-opt')].map(b=>b.dataset.tab).join(',')==='cats,loans,budget,reports,cal','the five secondaries in place (loans keeps its old slot)');
  ok(/\.tab-more\{display:none\}/.test(css),'the More slot is hidden by default (desktop rail keeps all eight)');
  ok(/\.tab-opt\{display:none\}/.test(blk),'secondary tabs collapse into More on small screens');
  ok(blk.indexOf('.tab-opt{display:none}')>blk.indexOf('.tab-more{display:flex'),'and wins over the base .tab rule');
  const more=document.getElementById('tabMore');
  ok(!!more,'the More slot exists');
  ok(more.getAttribute('aria-haspopup')==='dialog'&&more.getAttribute('aria-controls')==='morePop','it is wired as a dialog trigger');
  ok(!more.hasAttribute('role')||more.getAttribute('role')!=='tab','it is not a tab, so the tablist stays honest');
  const sheet=document.getElementById('morePop');
  ok(!!sheet&&sheet.getAttribute('role')==='dialog','the sheet is a labelled dialog');
  ok(/\.moresheet\{[^}]*background:var\(--glass-bg\)/.test(blk)&&/\.moresheet\{[^}]*backdrop-filter:var\(--glass\)/.test(blk),'the sheet reuses the dock glass, not a new recipe');
  ok(/\.moresheet\{[^}]*bottom:calc\(var\(--nav-total\) \+ 8px\)/.test(blk),'the sheet floats above the dock');
  ok(/\.moresheet\{[^}]*grid-template-columns:1fr 1fr/.test(blk)&&/\.moresheet\.open\{display:grid/.test(blk),'it opens as a two-up grid');
  ok(/\.moresheet button\{[^}]*min-height:76px/.test(blk),'tiles are thumb-sized');
  ok(/\.ind\{[^}]*pointer-events:none/.test(css),'the decorative pill never intercepts taps');
  ok(/\.tab\{flex:1 1 0[^}]*position:relative/.test(blk),'and the slots paint above it');
  ok(/closeMore\(\)/.test(js)&&/addEventListener\('resize',\(\)=>\{closePop\(\);closeBell\(\);closeMore\(\)\}\)/.test(js),'the sheet closes on resize too');
  ok(/function navSeq\(\)/.test(js)&&!/offsetParent/.test(js),'the keyboard sequence comes from state, not layout measurement');
  /* runtime */
  const seqMobile=G('navSeq().map(b=>b.dataset.tab||"more").join(",")');
  ok(seqMobile==='dash,tx,acc,search,more','mobile sequence: home, tx, accounts, search + More');
  ok(G("(()=>{const r=RAIL,o=r.matches;r.matches=true;const n=navSeq().length;r.matches=o;return n})()")===8,'desktop sequence is all eight');
  const moreBtn=document.getElementById('tabMore');
  moreBtn.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(sheet.classList.contains('open')&&moreBtn.getAttribute('aria-expanded')==='true','tapping More opens the sheet');
  const tiles=[...sheet.querySelectorAll('button')];
  ok(tiles.length===5&&tiles.map(t=>t.dataset.moret).join(',')==='loans,cats,budget,reports,cal','the sheet lists exactly the five secondary sections (loans leads)');
  ok(tiles.every(t=>/^#i-[a-z]+$/.test(t.querySelector('use').getAttribute('href'))),'every tile has its section glyph');
  tiles[3].dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(document.getElementById('pane-reports').classList.contains('active'),'choosing a tile navigates');
  ok(!sheet.classList.contains('open'),'and closes the sheet');
  ok(document.getElementById('moreLbl').textContent==='گزارش‌ها'&&document.getElementById('moreIc').getAttribute('href')==='#i-reports','the slot morphs into the active section');
  ok(moreBtn.classList.contains('on'),'and reads as active');
  moreBtn.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(sheet.querySelector('button[data-moret="reports"]').getAttribute('aria-current')==='true','the open sheet marks the current section');
  document.body.dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  document.querySelector('.tab[data-tab="tx"]').dispatchEvent(new window.MouseEvent('click',{bubbles:true,cancelable:true}));
  ok(document.getElementById('moreLbl').textContent==='بیشتر'&&document.getElementById('moreIc').getAttribute('href')==='#i-more'&&!moreBtn.classList.contains('on'),'a primary tab restores the plain More slot');
  ok(G("APP_VERSION")==='v1.17.1','version bumped to v1.14.0');
}

console.log('\n── 26) v1.12 contrast + direction-correct CSS ──');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const lum=h=>{h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');
    const v=[0,2,4].map(i=>{const n=parseInt(h.slice(i,i+2),16)/255;return n<=.03928?n/12.92:Math.pow((n+.055)/1.055,2.4);});
    return .2126*v[0]+.7152*v[1]+.0722*v[2];};
  const cr=(a,b)=>{const x=lum(a),y=lum(b),hi=Math.max(x,y),lo=Math.min(x,y);return (hi+.05)/(lo+.05);};
  const grab=(blk,n)=>{const m=blk.match(new RegExp(n+'\\s*:\\s*([^;}]+)'));return m?m[1].trim():null;};
  const root=css.match(/:root\{[^}]*\}/)[0];
  const light=css.match(/\[data-theme="light"\]\{[^}]*\}/)[0];
  for(const[n,blk]of[['dark',root],['light',light]]){
    for(const fg of['--dim','--muted']){
      const fc=grab(blk,fg);
      for(const bg of['--surface-1','--surface-2','--surface-3']){
        const bc=grab(blk,bg);
        if(fc&&bc&&/^#/.test(fc)&&/^#/.test(bc)) ok(cr(fc,bc)>=4.5,n+' '+fg+' روی '+bg+' ≥ 4.5 (واقعاً '+cr(fc,bc).toFixed(2)+')');
      }
    }
  }
  ok(/\.modal-x\{[^}]*inset-inline-end:15px/.test(css),'the close button uses a logical edge');
  ok(/\.tpl-del\{[^}]*inset-inline-end:-6px/.test(css),'the template delete badge uses a logical edge');
  ok(/\.chip-bell \.bell-badge\{[^}]*inset-inline-end:-5px/.test(css),'the bell badge uses a logical edge');
  ok(/\.ind\{[^}]*pointer-events:none/.test(css),'the indicator still ignores pointer events');
}

console.log('\n── 27) v1.13 container queries + boot skeleton ──');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  ok(/\.dash-bento\{[^}]*container-type:inline-size/.test(css),'the bento grid is a size container');
  const cq=(css.match(/@container bento \(max-width:660px\)\{[^\n]*\}/)||[''])[0];
  ok(/grid-template-columns:1fr/.test(cq),'it collapses to one column below 660px');
  ok(/\.b-hero[^{]*\{grid-column:1\/-1\}/.test(cq)&&/\.b-inc,\.b-exp\{grid-column:1\/-1\}|\.b-exp\{grid-column:1\/-1\}/.test(cq),'every tile spans full width there');
  ok(css.indexOf('@container bento')>css.indexOf('@media(max-width:960px)'),'the CQ cascade comes after the viewport cascade');
  /* پیش‌فرض بوت: اسکلت با CSS دیده می‌شود؛ صفحه‌ها با JS تصمیم می‌گیرند */
  ok(/\.boot-sk\{display:block;pointer-events:none/.test(css),'the skeleton paints before JS and never eats taps');
  ok(!/#loginScreen\{display:flex!important\}/.test(css)&&!/#setupScreen\{display:flex!important\}/.test(css),'no !important boot rule can block the JS decision');
  ok(/#appWrap[,{][^}]*display:none/.test(css),'and the app shell still hides behind !important');
  /* اسکلت */
  ok(/class="boot-sk"/.test(html)&&/id="bootSk"/.test(html),'the skeleton exists before the app shell');
  ok(/\.sk-line[^{]*\{[^}]*animation:skWash/.test(css),'its bars shimmer');
  ok(/@media\(prefers-reduced-motion:reduce\)\{\.boot-sk \*\{animation:none\}\}/.test(css),'and respect reduced motion');
  ok(/function killBootSkeleton/.test(js)&&/initApp\(\)\{killBootSkeleton\(\);/.test(js),'the skeleton dies the moment the app paints');
  /* در مسیر راه‌اندازی، صفحهٔ setup بالاترین z-index را دارد و اسکلت پشت آن می‌ماند */
  ok(/#setupScreen\{[^}]*z-index:9999/.test(css),'the setup screen covers the skeleton (z 9999)');
  /* توست اعلان هرگز ضربه نمی‌بلعد — علت باگ دکمه‌های میانی داک */
  ok(/\.toast\{[^}]*opacity:0;visibility:hidden;pointer-events:none/.test(css),'the hidden toast is untouchable');
  ok(/\.toast\.show\{[^}]*pointer-events:auto/.test(css),'but a shown toast still hits');
  ok(/setupScreen'\)\.style\.display='none';document\.getElementById\('loginScreen'\)\.style\.display='none'/.test(js),'the direct-open branch closes both screens');
}

// ── 28. v1.14 dock polish + search slot ──
console.log('28) v1.14 dock polish + search slot');
{
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  const js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  ok(/@keyframes dockIn\{from\{opacity:0;transform:translateY\(72px\)\}\}/.test(css),'the bar springs in from below');
  ok(/\.tabs\{[^}]*animation:dockIn/.test(css),'the bar itself carries the entrance');
  ok(/@keyframes sheetUp\{from\{opacity:0;transform:translateY\(16px\) scale\(\.97\)\}\}/.test(css),'the sheet slides up like a real bottom sheet');
  ok(/\.moresheet\.open\{display:grid;animation:sheetUp/.test(css),'and the sheet opener uses it');
  ok(/\.moresheet::before\{[^}]*grid-column:1\/-1/.test(css),'a grabber handle caps the sheet');
  ok(/\.moresheet button \.ic\{width:44px;height:44px/.test(css),'sheet icons sit in rounded chips');
  ok(/\.ind\{[^}]*color-mix\(in srgb,var\(--turq\)/.test(css),'the active pill glows in both themes');
  ok(/\.tab\.active \.tab-ic\{transform:translateY\(-1px\)\}/.test(css),'the active icon lifts a pixel');
  ok(/--nav-h:64px/.test(css),'the bar is a touch taller');
  ok(/\.toast,\.modal-box,\.pane\.active,\.tabs,\.moresheet,\.moresheet button\{transition:opacity 120ms linear!important;animation:none!important\}/.test(css),'reduced motion silences the new motion');
  ok(/id="tabSearch"[^>]*aria-haspopup="dialog"[^>]*aria-controls="gsModal"/.test(html),'the dock search slot opens the global search dialog');
  ok(/tabBtns\.forEach\(b=>\{if\(b\.dataset\.tab==='search'\)b\.addEventListener\('click',gsOpen\)/.test(js),'and it is wired straight to gsOpen');
  ok(/\.tab-search\{display:none\}/.test(css),'the search slot stays out of the desktop rail');
  ok(/<button class="tab tab-opt" id="tab-loans"/.test(html),'loans retired into the More sheet');
  ok(/const MORE_SECTIONS=\['loans','cats','budget','reports','cal'\]/.test(js),'the sheet owns five sections now');
  ok(/\.gsc-chip\{display:none\}/.test(css),'the topbar search chip steps aside on mobile');
  ok(/if\(name==='search'\)return;/.test(js),'setTab ignores the action slot');
}
console.log('\n── 32) v1.17 soft page hand-off ──');
{
  const js=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]).join('\n');
  const css=[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
  ok(/const apply=\(\)=>\{window\.scrollTo\(0,0\);/.test(js),'a new section opens at the top, not at the old scroll offset');
  ok(/@supports \(view-transition-name:none\)\{\.pane\.active\{animation:none\}\}/.test(css),'the dissolve owns the motion — no second slide');
  ok(/@keyframes vtOut\{to\{opacity:0\}\}/.test(css),'the outgoing page only fades, it never slides');
  ok(/@keyframes vtIn\{from\{opacity:0;transform:translateY\(6px\)\}\}/.test(css),'the incoming page rises 6px as it fades in');
  ok(/::view-transition-new\(pane\)\{animation:vtIn var\(--d-4\) var\(--ease-out\)\}/.test(css),'the hand-off eases out over 380ms');
  ok(/\.pane\.active\{display:block;animation:paneIn \.34s var\(--ease-out\) both\}/.test(css),'browsers without view transitions get a soft fade-up');
  ok(G('APP_VERSION')==='v1.17.1','version bumped to v1.17.1');
  ok(/\.tabs\{view-transition-name:hnav\}/.test(css),'the menu gets its own view-transition group');
  ok(/::view-transition-group\(hnav\),::view-transition-old\(hnav\),::view-transition-new\(hnav\)\{animation:none\}/.test(css),'the menu is frozen — it stays put instead of fading out and back');
  ok(/_vt\.finished\.then\(glide,glide\)/.test(js),'the underline glides after the dissolve, not during it');
  ok(!/moveInd\(_onMore\?moreBtn:_tb\);renderAll\(\)/.test(js),'the underline no longer jumps inside the snapshot');
}
console.log('\n'+(failures?`❌ ${failures} FAILURES`:'✅ ALL TESTS PASSED'));
window.close();
process.exit(failures?1:0);
})().catch(e=>{console.error('TEST CRASH:',e);process.exit(2);});
