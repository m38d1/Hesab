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

console.log('\n'+(failures?`❌ ${failures} FAILURES`:'✅ ALL TESTS PASSED'));
window.close();
process.exit(failures?1:0);
})().catch(e=>{console.error('TEST CRASH:',e);process.exit(2);});
