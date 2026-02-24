// ── CONFIG（見 config.js）──

// ── STATE ──
let currentUser = null;
let events = [];
// cart item: {eid, ename, pi, pname, priceOrig, priceTWD, currency, rate, qty, member(null=無選項), threshold, thresholdCurrency, thresholdRate, excludeThreshold, _editOrderIdx?}
let cart = [];
let _loginUser = null;
let _allOrders = [];

// ── LOCAL STORAGE ──
const LS = 'sj_proxy_v3';
function saveLocal(){ localStorage.setItem(LS, JSON.stringify(events)); }
function loadLocal(){ try{ events = JSON.parse(localStorage.getItem(LS))||[]; }catch(e){ events=[]; } }

// ══════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════
function selectUser(btn){
  document.querySelectorAll('.user-btn').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  _loginUser = btn.dataset.user;
  document.getElementById('login-btn').disabled = false;
  const hint = document.getElementById('pw-hint');
  if(_loginUser==='管理員'){ hint.textContent='💡 提示：XXXX + 動物園長是誰？兩位數字'; hint.style.color='var(--gold)'; }
  else { hint.textContent='💡 提示：動物園長是誰？兩位數字'; hint.style.color='var(--text3)'; }
}

function doLogin(){
  if(!_loginUser){ toast('請選擇帳號','error'); return; }
  const pw = document.getElementById('login-password').value;
  if(!pw){ toast('請輸入密碼','error'); return; }
  const role = _loginUser==='管理員'?'admin':'user';
  const btn = document.getElementById('login-btn');
  btn.disabled=true; btn.textContent='驗證中...';
  callAPI({action:'verifyPassword',role,password:pw})
    .then(data=>{
      if(data.valid){
        currentUser = _loginUser;
        const isAdmin = currentUser==='管理員';
        document.getElementById('user-label').textContent = isAdmin?'管理員':currentUser;
        document.getElementById('chip-dot').className = 'chip-dot'+(isAdmin?' gold':'');
        document.getElementById('login-screen').classList.remove('active');
        document.getElementById('app-screen').classList.add('active');
        document.getElementById('tab-orders-btn').style.display='';
        if(isAdmin){
          document.getElementById('tab-admin-btn').style.display='';
          document.getElementById('cart-btn').style.display='none';
          addProdRow(); updateRateHelp();
        } else {
          document.getElementById('tab-admin-btn').style.display='none';
          document.getElementById('cart-btn').style.display='';
        }
        loadLocal(); renderEvents();
        callAPI({action:'getEvents'}).then(d=>{
          if(d.events&&d.events.length){ events=d.events; saveLocal(); renderEvents(); if(currentUser==='管理員') renderAdminEvents(); }
        }).catch(()=>{});
      } else {
        toast('密碼錯誤','error');
        document.getElementById('login-password').value='';
      }
    })
    .catch(()=>toast('驗證失敗，請確認網路','error'))
    .finally(()=>{ btn.disabled=false; btn.textContent='進入系統'; });
}

function logout(){
  currentUser=null; _loginUser=null; cart=[];
  document.querySelectorAll('.user-btn').forEach(b=>b.classList.remove('selected'));
  document.getElementById('login-btn').disabled=true;
  document.getElementById('app-screen').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');
  switchTab('events');
  document.getElementById('view-list').style.display='';
  document.getElementById('view-products').style.display='none';
}

// ══════════════════════════════════════
//  TABS
// ══════════════════════════════════════
function switchTab(t){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===t));
  ['events','admin','orders'].forEach(p=>{ document.getElementById('pane-'+p).style.display=p===t?'':'none'; });
  if(t==='admin') renderAdminEvents();
  if(t==='orders') loadOrders();
}

// ══════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════
function renderEvents(){
  const grid = document.getElementById('events-grid');
  if(!events.length){ grid.innerHTML='<div class="empty-state"><span class="ico">📭</span><p>目前沒有活動場次</p></div>'; return; }
  grid.innerHTML = events.map(e=>`
    <div class="event-card" onclick="openEvent('${e.id}')">
      <div class="ec-head">
        <div class="ec-name">${esc(e.name)}</div>
        <div class="ec-tags">
          ${e.date?`<span class="ec-tag tag-date">📅 ${e.date}</span>`:''}
          ${e.threshold>0?`<span class="ec-tag tag-threshold">🎁 滿 ${fmt(e.threshold)} ${e.currency||'TWD'}</span>`:''}
          ${e.currency&&e.currency!=='TWD'?`<span class="ec-tag tag-fx">💱 ${e.currency} × ${e.rate}</span>`:''}
          ${e.deadline?`<span class="ec-tag" style="${isExpired(e.deadline)?'background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:var(--red)':'background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)'}">⏰ ${isExpired(e.deadline)?'已截止':'截止 '+fmtDeadline(e.deadline)}</span>`:''}
          ${e.products&&e.products.some(p=>p.optType==='members')?`<span class="ec-tag tag-fx">👥 可選成員</span>`:''}
        </div>
      </div>
      ${e.desc?`<div class="ec-body"><p class="ec-desc">${esc(e.desc)}</p></div>`:''}
      <div class="ec-foot">
        <span class="ec-count">共 ${e.products.length} 項商品</span>
        <button class="btn-enter" onclick="event.stopPropagation();openEvent('${e.id}')">選購 →</button>
      </div>
    </div>
  `).join('');
}

function openEvent(id){
  const ev = events.find(e=>e.id===id);
  if(!ev) return;
  document.getElementById('view-list').style.display='none';
  document.getElementById('view-products').style.display='';
  document.getElementById('pv-title').textContent=ev.name;

  let tags='';
  if(ev.date) tags+=`<span class="ec-tag tag-date">📅 ${ev.date}</span>`;
  if(ev.threshold>0) tags+=`<span class="ec-tag tag-threshold">🎁 滿 ${fmt(ev.threshold)} ${ev.currency||'TWD'} 獲得滿額卡</span>`;
  if(ev.deadline){
    const expired=isExpired(ev.deadline);
    tags+=`<span class="ec-tag" style="${expired?'background:rgba(248,113,113,.12);border:1px solid rgba(248,113,113,.25);color:var(--red)':'background:rgba(74,222,128,.08);border:1px solid rgba(74,222,128,.2);color:var(--green)'}">⏰ ${expired?'已截止 '+fmtDeadline(ev.deadline):'截止 '+fmtDeadline(ev.deadline)}</span>`;
  }
  document.getElementById('pv-tags').innerHTML=tags;

  const fxEl=document.getElementById('pv-fx');
  if(ev.currency&&ev.currency!=='TWD'){ fxEl.style.display=''; fxEl.innerHTML=`💱 1 ${ev.currency} = ${ev.rate} TWD`; }
  else fxEl.style.display='none';

  const thEl=document.getElementById('pv-thresh');
  if(ev.threshold>0){ thEl.style.display='flex'; document.getElementById('pv-thresh-val').textContent=fmt(ev.threshold); document.getElementById('pv-thresh-cur').textContent=ev.currency||'TWD'; }
  else thEl.style.display='none';

  const tbody=document.getElementById('prod-tbody');
  const isTWD=!ev.currency||ev.currency==='TWD';

  if(!ev.products.length){
    tbody.innerHTML=`<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:30px">此活動尚無商品</td></tr>`;
    return;
  }

  // 動態欄位：整場活動有任何圖/備注才顯示該欄
  const hasImg=ev.products.some(p=>p.imgUrl);
  const hasNote=ev.products.some(p=>p.note&&p.note.trim());
  const colImg=document.getElementById('pcol-img');
  const colNote=document.getElementById('pcol-note');
  const thImg=document.getElementById('pth-img');
  const thNote=document.getElementById('pth-note');
  if(colImg) colImg.style.display=hasImg?'':'none';
  if(colNote) colNote.style.display=hasNote?'':'none';
  if(thImg){ thImg.style.display=hasImg?'':'none'; }
  if(thNote){ thNote.style.display=hasNote?'':'none'; }

  tbody.innerHTML = ev.products.map((p,i)=>{
    const twdP=isTWD?p.price:Math.round(p.price*ev.rate);
    const priceHtml=isTWD
      ?`<div class="price-orig">NT$ ${fmt(p.price)}</div>`
      :`<div class="price-orig">${ev.currency} ${fmt(p.price)}</div><div class="price-twd">≈ NT$ ${fmt(twdP)}</div>`;

    const imgTd=hasImg
      ?(p.imgUrl
        ?`<td style="padding:6px 8px;width:56px"><div class="pimg-wrap"><img class="pimg-thumb" src="${esc(p.imgUrl)}" onclick="triggerImgFromView(this)" style="cursor:pointer"></div></td>`
        :`<td style="width:56px"></td>`)
      :'';
    const noteTd=hasNote?`<td style="color:var(--text3);font-size:12px">${esc(p.note||'')}</td>`:'';
    if(currentUser==='管理員'){
      return `<tr>
        ${imgTd}
        <td style="font-weight:500;color:var(--text)">${esc(p.name)}</td>
        ${noteTd}
        <td>${priceHtml}</td>
        <td><span style="color:var(--text3);font-size:11px">（管理員）</span></td>
      </tr>`;
    }

    // 無選項：單一數量控制
    if(!p.optType||p.optType==='none'){
      const curQty=(cart.find(c=>c.eid===id&&c.pi===i&&c.member===null)||{qty:0}).qty;
      return `<tr>
        ${imgTd}
        <td style="font-weight:500;color:var(--text)">${esc(p.name)}</td>
        ${noteTd}
        <td>${priceHtml}</td>
        <td>
          <div class="qty-ctrl">
            <button class="qty-btn" onclick="chQty('${id}',${i},null,-1)">−</button>
            <span class="qty-num" id="qn-${id}-${i}-none">${curQty}</span>
            <button class="qty-btn" onclick="chQty('${id}',${i},null,1)">＋</button>
          </div>
        </td>
      </tr>`;
    }

    // 有選項：每個選項各自有 ＋／－
    const vals=p.optType==='members'?MEMBERS:(p.optVals||[]);
    const rowsHtml=vals.map(v=>{
      const mk=encodeURIComponent(v);
      const curQty=(cart.find(c=>c.eid===id&&c.pi===i&&c.member===v)||{qty:0}).qty;
      return `<div class="mem-qty-row">
        <span class="mem-label">${esc(v)}</span>
        <button class="qty-btn" onclick="chQty('${id}',${i},'${mk}',-1)">−</button>
        <span class="qty-num" id="qn-${id}-${i}-${mk}">${curQty}</span>
        <button class="qty-btn" onclick="chQty('${id}',${i},'${mk}',1)">＋</button>
      </div>`;
    }).join('');

    return `<tr>
      ${imgTd}
      <td style="font-weight:500;color:var(--text)">${esc(p.name)}</td>
      ${noteTd}
      <td>${priceHtml}</td>
      <td><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:4px 10px;padding:4px 0">${rowsHtml}</div></td>
    </tr>`;
  }).join('');
}

function backToList(){
  document.getElementById('view-list').style.display='';
  document.getElementById('view-products').style.display='none';
}

// ── chQty：member=null 代表無選項，其他為 encodeURIComponent 後的選項值 ──
function chQty(eid, pi, memberKey, delta){
  const ev=events.find(e=>e.id===eid);
  if(!ev) return;
  if(ev.deadline&&isExpired(ev.deadline)&&delta>0){ toast('此活動已截止下單','error'); return; }

  const p=ev.products[pi];
  const isTWD=!ev.currency||ev.currency==='TWD';
  const twdP=isTWD?p.price:Math.round(p.price*ev.rate);
  const member=memberKey===null?null:decodeURIComponent(memberKey);

  let item=cart.find(c=>c.eid===eid&&c.pi===pi&&c.member===member);
  const newQty=Math.max(0,(item?item.qty:0)+delta);

  if(newQty===0){
    cart=cart.filter(c=>!(c.eid===eid&&c.pi===pi&&c.member===member));
  } else if(item){
    item.qty=newQty;
    item.excludeThreshold=!!p.excludeThreshold;
  } else {
    cart.push({
      eid, ename:ev.name, pi, pname:p.name,
      priceOrig:p.price, priceTWD:twdP,
      currency:ev.currency||'TWD', rate:ev.rate||1,
      qty:newQty, member,
      threshold:ev.threshold,
      thresholdCurrency:ev.currency||'TWD', thresholdRate:ev.rate||1,
      excludeThreshold:!!p.excludeThreshold
    });
  }
  const qid=memberKey===null?`qn-${eid}-${pi}-none`:`qn-${eid}-${pi}-${memberKey}`;
  const el=document.getElementById(qid);
  if(el) el.textContent=newQty;
  updateBadge();
}

function updateBadge(){
  const n=cart.reduce((s,i)=>s+i.qty,0);
  const b=document.getElementById('cart-badge');
  b.textContent=n;
  b.classList.toggle('hidden',n===0);
}

// ══════════════════════════════════════
//  CART
// ══════════════════════════════════════
function toggleCart(){
  document.getElementById('cart-ov').classList.toggle('open');
  renderCart();
}
function ovClick(e){ if(e.target===document.getElementById('cart-ov')) toggleCart(); }

// 把 cart 按 eid+pi 分組，同品項合併顯示
function groupCart(){
  const map={};
  cart.forEach(item=>{
    const key=`${item.eid}__${item.pi}`;
    if(!map[key]) map[key]={
      eid:item.eid, ename:item.ename, pi:item.pi, pname:item.pname,
      priceOrig:item.priceOrig, priceTWD:item.priceTWD, currency:item.currency,
      threshold:item.threshold, thresholdCurrency:item.thresholdCurrency, thresholdRate:item.thresholdRate,
      excludeThreshold:item.excludeThreshold,
      entries:[]
    };
    map[key].entries.push({member:item.member, qty:item.qty});
  });
  return Object.values(map);
}

function calcCardsFromCart(){
  const evTotals={};
  cart.forEach(i=>{
    if(!evTotals[i.eid]) evTotals[i.eid]={name:i.ename,total:0,thr:i.threshold};
    if(!i.excludeThreshold) evTotals[i.eid].total+=i.priceOrig*i.qty;
  });
  const cards=[];
  Object.values(evTotals).forEach(ev=>{
    if(ev.thr>0&&ev.total>=ev.thr){
      const n=Math.floor(ev.total/ev.thr);
      cards.push({name:ev.name,count:n});
    }
  });
  return cards;
}

function renderCart(){
  const list=document.getElementById('cart-items-list');
  const sumEl=document.getElementById('cart-sum');

  if(!cart.length){
    list.innerHTML='<div class="cart-empty"><span class="ico">🛒</span><p>購物車是空的</p></div>';
    sumEl.innerHTML=''; return;
  }

  const groups=groupCart();

  list.innerHTML=groups.map(g=>{
    const totalQty=g.entries.reduce((s,e)=>s+e.qty,0);
    const totalTWD=g.priceTWD*totalQty;
    const hasMembers=g.entries.some(e=>e.member!==null);

    // 成員分佈 chips（換行顯示）
    const memDistHtml=hasMembers
      ?`<div class="ci-mem-dist">${g.entries.map(e=>`
          <span class="ci-mem-chip">
            <span class="cmn">${esc(e.member)}</span>
            <span class="cmq">×${e.qty}</span>
          </span>`).join('')}
        </div>`:'';

    return `<div class="cart-item">
      <div class="ci-top">
        <div class="ci-info">
          <div class="ci-name">${esc(g.pname)}</div>
          <div class="ci-ev">${esc(g.ename)}</div>
          <div class="ci-price">
            ${g.currency!=='TWD'?`${g.currency} ${fmt(g.priceOrig)} × ${totalQty} &nbsp;|&nbsp; `:''}NT$ ${fmt(totalTWD)}
          </div>
          ${g.currency!=='TWD'?`<div class="ci-twd">原幣 ${g.currency} ${fmt(g.priceOrig*totalQty)}</div>`:''}
        </div>
        <button class="ci-rm" onclick="rmCartGroup('${g.eid}',${g.pi})">✕</button>
      </div>
      ${memDistHtml}
    </div>`;
  }).join('');

  const subtotal=cart.reduce((s,i)=>s+i.priceTWD*i.qty,0);
  const cards=calcCardsFromCart();

  let html=`<div class="sum-row"><span>小計</span><span class="sv">NT$ ${fmt(subtotal)}</span></div>`;
  if(cards.length){ html+='<div class="card-badges">'; cards.forEach(c=>{ html+=`<span class="card-badge">🎁 ${esc(c.name)} 滿額卡${c.count>1?' ×'+c.count:''}</span>`; }); html+='</div>'; }
  html+=`<div class="sum-row total"><span>合計</span><span class="sv">NT$ ${fmt(subtotal)}</span></div>`;
  sumEl.innerHTML=html;
}

function rmCartGroup(eid, pi){
  cart=cart.filter(c=>!(c.eid===eid&&c.pi===pi));
  // 清掉商品頁數量顯示
  const ev=events.find(e=>e.id===eid);
  if(ev){
    const p=ev.products[pi];
    if(p){
      if(!p.optType||p.optType==='none'){
        const el=document.getElementById(`qn-${eid}-${pi}-none`); if(el) el.textContent='0';
      } else {
        const vals=p.optType==='members'?MEMBERS:(p.optVals||[]);
        vals.forEach(v=>{ const el=document.getElementById(`qn-${eid}-${pi}-${encodeURIComponent(v)}`); if(el) el.textContent='0'; });
      }
    }
  }
  updateBadge(); renderCart();
}

// ══════════════════════════════════════
//  SHARE
// ══════════════════════════════════════
function shareCart(){
  if(!cart.length){ toast('購物車是空的','error'); return; }
  const subtotal=cart.reduce((s,i)=>s+i.priceTWD*i.qty,0);
  const cards=calcCardsFromCart();

  let lines=[`🛍️ ${currentUser} 的代購清單`,'─────────────────'];
  const groups=groupCart();
  // 按活動分組
  const byEvent={};
  groups.forEach(g=>{ if(!byEvent[g.eid]) byEvent[g.eid]={name:g.ename,groups:[]}; byEvent[g.eid].groups.push(g); });
  Object.values(byEvent).forEach(ev=>{
    lines.push(`📦 ${ev.name}`);
    ev.groups.forEach(g=>{
      const totalQty=g.entries.reduce((s,e)=>s+e.qty,0);
      const price=g.currency!=='TWD'
        ?`${g.currency} ${fmt(g.priceOrig*totalQty)} ≈ NT$${fmt(g.priceTWD*totalQty)}`
        :`NT$${fmt(g.priceTWD*totalQty)}`;
      const hasMembers=g.entries.some(e=>e.member!==null);
      if(hasMembers){
        const memStr=g.entries.map(e=>`${e.member}×${e.qty}`).join(' ');
        lines.push(`  • ${g.pname} × ${totalQty}　${price}`);
        lines.push(`    ${memStr}`);
      } else {
        lines.push(`  • ${g.pname} × ${totalQty}　${price}`);
      }
    });
  });
  lines.push('─────────────────');
  lines.push(`💰 合計 NT$${fmt(subtotal)}`);
  if(cards.length) lines.push(`🎁 ${cards.map(c=>c.name+' 滿額卡'+(c.count>1?' ×'+c.count:'')).join('、')}`);

  const text=lines.join('\n');
  navigator.clipboard.writeText(text)
    .then(()=>toast('已複製！貼到 LINE 吧 🎉','success'))
    .catch(()=>{ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已複製！貼到 LINE 吧 🎉','success'); });
}

// ══════════════════════════════════════
//  SUBMIT
// ══════════════════════════════════════
function submitOrder(){
  if(!cart.length){ toast('購物車是空的','error'); return; }
  const subtotal=cart.reduce((s,i)=>s+i.priceTWD*i.qty,0);
  const remark=document.getElementById('cart-remark').value.trim();
  const cards=calcCardsFromCart();

  const editIdx=cart.find(i=>i._editOrderIdx!==undefined)?._editOrderIdx;

  const payload={
    action: editIdx!==undefined?'updateOrder':'submitOrder',
    user:currentUser,
    // 每筆 item 包含 member（null 或 成員名稱）
    items:cart.map(i=>({
      eventName:i.ename, prodName:i.pname,
      priceOrig:i.priceOrig, priceTWD:i.priceTWD,
      currency:i.currency, qty:i.qty,
      member:i.member  // null or string
    })),
    subtotal,
    cards:cards.map(c=>c.count>1?`${c.name} 滿額卡 ×${c.count}`:`${c.name} 滿額卡`),
    remark,
    deadline:(()=>{
      const eids=[...new Set(cart.map(i=>i.eid))];
      const dl=eids.map(eid=>{ const ev=events.find(e=>e.id===eid); return ev&&ev.deadline?ev.deadline:''; }).filter(Boolean);
      return dl.length?dl.sort()[0]:'';
    })(),
    timestamp:new Date().toLocaleString('zh-TW')
  };
  if(editIdx!==undefined) payload.orderIndex=editIdx;

  const btn=document.getElementById('submit-btn');
  btn.innerHTML='<span class="loading"></span>送出中...'; btn.disabled=true;

  callAPI(payload)
    .then(()=>{
      toast(editIdx!==undefined?'訂單已更新！':'訂單已送出！','success');
      cart=[];
      document.getElementById('cart-remark').value='';
      updateBadge();
      document.getElementById('cart-ov').classList.remove('open');
      document.querySelectorAll('.qty-num').forEach(el=>el.textContent='0');
    })
    .catch(()=>toast('送出失敗，請稍後再試','error'))
    .finally(()=>{ btn.innerHTML='確認送出訂單'; btn.disabled=false; });
}

// ══════════════════════════════════════
//  ORDERS
// ══════════════════════════════════════
function loadOrders(filterUser){
  const isAdmin=currentUser==='管理員';
  const defaultFilter=isAdmin?'':currentUser;
  const activeFilter=filterUser!==undefined?filterUser:defaultFilter;

  const w=document.getElementById('orders-wrap');
  w.innerHTML='<div style="padding:20px;color:var(--text3)"><span class="loading"></span>載入中...</div>';
  callAPI({action:'getOrders'})
    .then(data=>{
      _allOrders=data.orders||[];
      let orders=_allOrders.slice();
      if(activeFilter) orders=orders.filter(o=>o.user===activeFilter);
      if(!orders.length){ w.innerHTML='<div class="empty-state"><span class="ico">📋</span><p>目前沒有訂單記錄</p></div>'; return; }

      const allUsers=[...new Set(_allOrders.map(o=>o.user))];

      // 篩選按鈕 HTML
      const filterBtns=`
        <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
          <button onclick="loadOrders('${currentUser}')" style="padding:6px 14px;border-radius:8px;border:1px solid ${activeFilter===currentUser?'var(--royal-lt)':'var(--border)'};background:${activeFilter===currentUser?'rgba(45,79,212,.25)':'transparent'};color:${activeFilter===currentUser?'var(--sky-lt)':'var(--text3)'};cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">我的訂單</button>
          <button onclick="loadOrders('')" style="padding:6px 14px;border-radius:8px;border:1px solid ${activeFilter===''?'var(--royal-lt)':'var(--border)'};background:${activeFilter===''?'rgba(45,79,212,.25)':'transparent'};color:${activeFilter===''?'var(--sky-lt)':'var(--text3)'};cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">全部</button>
          ${isAdmin?allUsers.filter(u=>u!==currentUser).map(u=>`<button onclick="loadOrders('${esc(u)}')" style="padding:6px 14px;border-radius:8px;border:1px solid ${activeFilter===u?'var(--royal-lt)':'var(--border)'};background:${activeFilter===u?'rgba(45,79,212,.25)':'transparent'};color:${activeFilter===u?'var(--sky-lt)':'var(--text3)'};cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">${esc(u)}</button>`).join(''):''}
        </div>`;

      // 匯出列 HTML
      const exportRow=`
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px">
          <select id="export-event-filter" style="padding:7px 10px;background:rgba(22,32,64,.7);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:'Noto Sans TC',sans-serif;font-size:12px;flex:1">
            <option value="">全部活動</option>
            ${events.map(e=>`<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('')}
          </select>
          <button onclick="exportOrders()" style="padding:7px 16px;background:linear-gradient(135deg,var(--royal),var(--royal-lt));border:none;border-radius:var(--r);color:#fff;font-size:12px;cursor:pointer;font-family:'Noto Sans TC',sans-serif;white-space:nowrap;box-shadow:0 2px 10px var(--glow-sm)">⬇ 匯出 Excel</button>
        </div>`;

      // 手機版：card 排版
      if(window.innerWidth<=640){
        const cardsHtml=orders.map(o=>{
          const realIdx=_allOrders.indexOf(o);
          const canAct=o.user===currentUser&&o.deadline&&!isExpired(o.deadline);
          const evNames=[...new Set((o.items||[]).map(i=>i.eventName))].join('、');
          const itemMap={};
          (o.items||[]).forEach(i=>{
            const key=i.prodName;
            let priceTWD=i.priceTWD||0;
            if(!priceTWD&&i.priceOrig){ const ev=events.find(e=>e.name===i.eventName); priceTWD=ev&&ev.rate?Math.round(i.priceOrig*ev.rate):i.priceOrig; }
            if(!itemMap[key]) itemMap[key]={prodName:i.prodName,currency:i.currency||'TWD',priceOrig:i.priceOrig||0,priceTWD,entries:[],totalQty:0};
            itemMap[key].entries.push({member:i.member,qty:i.qty});
            itemMap[key].totalQty+=i.qty;
          });
          const itemsHtml=Object.values(itemMap).map(g=>{
            const hasMembers=g.entries.some(e=>e.member);
            const memChips=hasMembers
              ?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${g.entries.map(e=>`<span class="ci-mem-chip"><span class="cmn">${esc(e.member)}</span><span class="cmq">×${e.qty}</span></span>`).join('')}</div>`
              :'';
            return `<div style="margin-bottom:6px">`+
              `<span style="color:var(--text2)">${esc(g.prodName)}</span>`+
              (g.currency&&g.currency!=='TWD'?`<span style="color:var(--text3);font-size:11px"> [${g.currency}]</span>`:'')+
              `<span style="color:var(--text3)"> ×${g.totalQty}</span>`+
              memChips+
              `</div>`;
          }).join('');
          const cardsStr=(o.cards||[]).length
            ?(o.cards||[]).map(cd=>{const nm=cd.match(/×(\d+)/);return '🎁'+(nm?' ×'+nm[1]:'');}).join(' ')
            :'—';
          return `<div class="o-mobile-card">
            <div class="o-mc-row"><span class="o-mc-label">時間</span><span class="o-mc-val ot-date">${fmtTimestamp(o.timestamp||'')}</span></div>
            <div class="o-mc-row"><span class="o-mc-label">用戶</span><span class="o-mc-val ot-user">${esc(o.user)}</span></div>
            <div class="o-mc-row"><span class="o-mc-label">活動</span><span class="o-mc-val" style="color:var(--text3);font-size:11px">${esc(evNames)}</span></div>
            <div style="margin-bottom:4px"><span class="o-mc-label">品項</span></div>
            <div class="ot-items" style="padding:6px 10px;background:rgba(45,79,212,.06);border-radius:6px;margin-bottom:4px;font-size:13px">${itemsHtml}</div>
            <div class="o-mc-row"><span class="o-mc-label">合計</span><span class="o-mc-val ot-total">NT$ ${fmt(o.subtotal||0)}</span></div>
            <div class="o-mc-row"><span class="o-mc-label">滿額卡</span><span class="o-mc-val">${cardsStr}</span></div>
            ${o.remark?`<div class="o-mc-row"><span class="o-mc-label">備注</span><span class="o-mc-val">${esc(o.remark)}</span></div>`:''}
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">
              ${canAct?`<button onclick="openEditOrder(${realIdx})" style="padding:5px 12px;background:rgba(45,79,212,.15);border:1px solid rgba(107,142,240,.3);border-radius:6px;color:var(--sky-lt);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">修改</button><button onclick="deleteOrder(${realIdx})" style="padding:5px 12px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:6px;color:var(--red);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">刪除</button>`:''}
              <button onclick="shareOrder(${realIdx})" style="padding:5px 12px;background:rgba(45,79,212,.08);border:1px solid rgba(107,142,240,.25);border-radius:6px;color:var(--sky-lt);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">分享</button>
            </div>
          </div>`;
        }).join('');
        w.innerHTML=filterBtns+exportRow+cardsHtml;
        return;
      }

      // 桌機版：table 排版
      const rowsHtml=orders.map(o=>{
        const realIdx=_allOrders.indexOf(o);
        const canAct=o.user===currentUser&&o.deadline&&!isExpired(o.deadline);
        const evNames=[...new Set((o.items||[]).map(i=>i.eventName))].join('、');
        const itemMap={};
        (o.items||[]).forEach(i=>{
          const key=`${i.eventName}||${i.prodName}`;
          let priceTWD=i.priceTWD||0;
          if(!priceTWD&&i.priceOrig){
            const ev=events.find(e=>e.name===i.eventName);
            priceTWD=ev&&ev.rate?Math.round(i.priceOrig*ev.rate):i.priceOrig;
          }
          if(!itemMap[key]) itemMap[key]={eventName:i.eventName,prodName:i.prodName,currency:i.currency||'TWD',priceOrig:i.priceOrig||0,priceTWD,entries:[],totalQty:0};
          itemMap[key].entries.push({member:i.member,qty:i.qty});
          itemMap[key].totalQty+=i.qty;
        });
        const itemsHtml=Object.values(itemMap).map(g=>{
          const hasMembers=g.entries.some(e=>e.member);
          const memChips=hasMembers?`<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${g.entries.map(e=>`<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 6px;background:rgba(45,79,212,.18);border:1px solid rgba(107,142,240,.28);border-radius:20px;font-family:'DM Mono',monospace"><span style="font-size:11px;color:var(--sky-lt)">${esc(e.member)}</span><span style="font-size:10px;color:var(--text3)">×${e.qty}</span></span>`).join('')}</div>`:'';
          return `<div style="margin-bottom:6px">`+
            `<span style="color:var(--text2)">${esc(g.prodName)}</span>`+
            (g.currency&&g.currency!=='TWD'?`<span style="color:var(--text3);font-size:11px"> [${g.currency}]</span>`:'')+
            `<span style="color:var(--text3)"> ×${g.totalQty}</span>`+
            memChips+
            `</div>`;
        }).join('');
        const cardsHtml=(o.cards||[]).length
          ?(o.cards||[]).map(cd=>{const nm=cd.match(/×(\d+)/);return `<span class="ot-card">🎁${nm?' ×'+nm[1]:''}</span>`;}).join('')
          :'—';
        return `<tr>
          <td class="ot-date">${fmtTimestamp(o.timestamp||'')}</td>
          <td class="ot-user">${esc(o.user)}</td>
          <td style="color:var(--text3);font-size:12px;white-space:nowrap">${esc(evNames)}</td>
          <td class="ot-items">${itemsHtml}</td>
          <td class="ot-total">NT$ ${fmt(o.subtotal||0)}</td>
          <td>${cardsHtml}</td>
          <td style="color:var(--text3);font-size:12px">${esc(o.remark||'—')}</td>
          <td style="white-space:nowrap">
            ${canAct?`<button onclick="openEditOrder(${realIdx})" style="padding:4px 8px;background:rgba(45,79,212,.15);border:1px solid rgba(107,142,240,.3);border-radius:6px;color:var(--sky-lt);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">修改</button><button onclick="deleteOrder(${realIdx})" style="margin-left:4px;padding:4px 8px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:6px;color:var(--red);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">刪除</button>`:''}
            <button onclick="shareOrder(${realIdx})" style="margin-left:4px;padding:4px 8px;background:rgba(45,79,212,.08);border:1px solid rgba(107,142,240,.25);border-radius:6px;color:var(--sky-lt);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">分享</button>
          </td>
        </tr>`;
      }).join('');

      w.innerHTML=filterBtns+`<div class="otable-wrap"><table class="otable">
        <thead>
          <tr><td colspan="8" style="padding:0 0 12px;border:none;background:transparent">${exportRow}</td></tr>
          <tr><th>時間</th><th>用戶</th><th>活動</th><th>品項</th><th>合計</th><th>滿額卡</th><th>備注</th><th></th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table></div>`;
    })
    .catch(()=>{ w.innerHTML='<div class="empty-state"><p>無法載入訂單（請確認 API 設定）</p></div>'; });
}
function allOrderMembers(items){
  const s=new Set();
  (items||[]).forEach(i=>{ if(i.member) s.add(i.member); });
  return [...s];
}

function openEditOrder(idx){
  const o=_allOrders[idx];
  if(!o) return;
  const doLoad=()=>{
    cart=[];
    updateBadge();
    (o.items||[]).forEach(item=>{
      const ev=events.find(e=>e.name===item.eventName);
      if(!ev) return;
      const pi=ev.products.findIndex(p=>p.name===item.prodName);
      if(pi===-1) return;
      const p=ev.products[pi];
      const isTWD=!ev.currency||ev.currency==='TWD';
      const twdP=isTWD?p.price:Math.round(p.price*ev.rate);
      cart.push({
        eid:ev.id, ename:ev.name, pi, pname:p.name,
        priceOrig:p.price, priceTWD:twdP,
        currency:ev.currency||'TWD', rate:ev.rate||1,
        qty:item.qty,
        member: item.member!==undefined ? item.member : null,
        threshold:ev.threshold,
        thresholdCurrency:ev.currency||'TWD', thresholdRate:ev.rate||1,
        excludeThreshold:!!p.excludeThreshold,
        _editOrderIdx:idx
      });
    });
    document.getElementById('cart-remark').value=o.remark||'';
    updateBadge();
    switchTab('events');
    const firstEid=cart.length?cart[0].eid:null;
    if(firstEid) openEvent(firstEid);
    setTimeout(()=>toggleCart(),300);
    toast('已載入訂單，修改後重新送出即可');
  };
  if(cart.length) showModal('購物車已有東西','是否清空購物車並載入此訂單？',doLoad);
  else doLoad();
}

// ══════════════════════════════════════
//  EXCEL EXPORT
// ══════════════════════════════════════
function exportOrders(){
  const filterEid=document.getElementById('export-event-filter')?.value||'';
  callAPI({action:'getOrders'}).then(data=>{
    let orders=data.orders||[];
    let filterName='全部活動';
    if(filterEid){ const ev=events.find(e=>e.id===filterEid); filterName=ev?ev.name:''; orders=orders.filter(o=>(o.items||[]).some(i=>i.eventName===filterName)); }
    if(!orders.length){ toast('沒有符合的訂單','error'); return; }

    const detailRows=[['時間','用戶','活動','品項','成員','數量','原幣','原幣金額','TWD單價','TWD小計','滿額卡','備注']];
    orders.forEach(o=>{
      (o.items||[]).forEach((item,idx)=>{
        if(filterEid&&item.eventName!==filterName) return;
        detailRows.push([
          idx===0?o.timestamp:'', idx===0?o.user:'',
          item.eventName||'', item.prodName||'',
          item.member||'',
          item.qty||0,
          item.currency&&item.currency!=='TWD'?item.currency:'',
          item.currency&&item.currency!=='TWD'?(item.priceOrig||0)*(item.qty||0):'',
          item.priceTWD||0, (item.priceTWD||0)*(item.qty||0),
          idx===0?(o.cards||[]).join('、'):'',
          idx===0?(o.remark||''):''
        ]);
      });
    });

    const sumMap={};
    orders.forEach(o=>{
      (o.items||[]).forEach(item=>{
        if(filterEid&&item.eventName!==filterName) return;
        const key=`${item.eventName}||${item.prodName}||${item.member||''}`;
        if(!sumMap[key]) sumMap[key]={eventName:item.eventName,prodName:item.prodName,member:item.member||'',currency:item.currency||'TWD',totalQty:0,totalOrig:0,totalTWD:0};
        sumMap[key].totalQty+=item.qty||0;
        sumMap[key].totalOrig+=(item.priceOrig||0)*(item.qty||0);
        sumMap[key].totalTWD+=(item.priceTWD||0)*(item.qty||0);
      });
    });
    const sumRows=[['活動','品項','成員','幣別','數量合計','原幣金額合計','TWD金額合計']];
    Object.values(sumMap).forEach(r=>{ sumRows.push([r.eventName,r.prodName,r.member,r.currency,r.totalQty,r.currency!=='TWD'?r.totalOrig:'',r.totalTWD]); });
    const totalTWD=Object.values(sumMap).reduce((s,r)=>s+r.totalTWD,0);
    sumRows.push(['','','','','','合計 NT$'+totalTWD,'']);

    buildXlsx(detailRows,sumRows,filterName);
  }).catch(()=>toast('載入訂單失敗','error'));
}

function buildXlsx(detailRows,sumRows,sheetTitle){
  if(typeof XLSX==='undefined'){ const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload=()=>_doXlsx(detailRows,sumRows,sheetTitle); document.head.appendChild(s); }
  else _doXlsx(detailRows,sumRows,sheetTitle);
}
function _doXlsx(detailRows,sumRows,sheetTitle){
  const wb=XLSX.utils.book_new();
  const ws1=XLSX.utils.aoa_to_sheet(detailRows);
  ws1['!cols']=[12,10,16,16,8,6,6,10,8,10,14,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws1,'訂單明細');
  const ws2=XLSX.utils.aoa_to_sheet(sumRows);
  ws2['!cols']=[16,16,8,6,8,12,12].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws2,'商品加總');
  const fname=`SJ代購_${sheetTitle}_${new Date().toLocaleDateString('zh-TW').replace(/\//g,'-')}.xlsx`;
  XLSX.writeFile(wb,fname);
  toast('匯出成功！','success');
}

// ══════════════════════════════════════
//  ADMIN
// ══════════════════════════════════════
function updateRateHelp(){
  const cur=document.getElementById('a-currency')?.value;
  const rateEl=document.getElementById('a-rate');
  const grp=document.getElementById('rate-grp');
  const lbl=document.getElementById('rate-cur-label');
  if(!cur) return;
  if(cur==='TWD'){ rateEl.value='1'; grp.style.opacity='.4'; if(lbl) lbl.textContent='TWD'; }
  else { grp.style.opacity='1'; if(rateEl.value===''||rateEl.value==='1') rateEl.value=FX_DEFAULTS[cur]||''; if(lbl) lbl.textContent=cur; }
  document.getElementById('threshold-cur-label').textContent=cur;
}

function addProdRow(n='',p='',no='',optType='none',optVals='',imgUrl='',excludeThreshold=false){
  const list=document.getElementById('prod-list');
  const row=document.createElement('div');
  row.className='prow';
  const imgHtml=imgUrl
    ?`<div class="pimg-wrap pimg-wrap-has"><img class="pimg-thumb" src="${esc(imgUrl)}" onclick="triggerImgChange(this)" title="點擊換圖" data-fileid="${esc(_fileIdFromUrl(imgUrl))}"><button class="pimg-del-x" onclick="clearProdImg(this)" title="刪除圖片">✕</button><input type="hidden" class="pimg" value="${esc(imgUrl)}"><input type="file" class="pimg-file" accept="image/*" style="display:none" onchange="handleImgUpload(this)"></div>`
    :`<div class="pimg-wrap"><div class="pimg-empty" onclick="triggerImgUpload(this)" title="上傳圖片">📷</div><input type="hidden" class="pimg" value=""><input type="file" class="pimg-file" accept="image/*" style="display:none" onchange="handleImgUpload(this)"></div>`;
  row.innerHTML=`
    ${imgHtml}
    <input placeholder="品名" value="${esc(n)}" class="pn">
    <input placeholder="原幣售價" type="number" value="${p}" class="pp" min="0" step="0.01">
    <input placeholder="備注" value="${esc(no)}" class="pno">
    <select class="pot" onchange="const pov=this.parentElement.querySelector('.povs'); if(pov) pov.style.display=this.value==='custom'?'block':'none'" style="padding:8px 8px;background:rgba(22,32,64,.6);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:'Noto Sans TC',sans-serif;font-size:12px;cursor:pointer;width:100%">
      <option value="none" ${optType==='none'?'selected':''}>無選項</option>
      <option value="members" ${optType==='members'?'selected':''}>成員選擇</option>
      <option value="custom" ${optType==='custom'?'selected':''}>自訂選項</option>
    </select>
    <input placeholder="用 / 分隔，例：S/M/L" value="${esc(optVals)}" class="povs" style="display:${optType==='custom'?'block':'none'};padding:8px 8px;background:rgba(22,32,64,.6);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-family:'Noto Sans TC',sans-serif;font-size:12px;width:100%">
    <label class="pth-toggle"><input type="checkbox" class="pexcl" ${excludeThreshold?'checked':''}><span>不計入</span></label>
    <button class="rm-btn" onclick="this.parentElement.remove()">✕</button>
  `;
  list.appendChild(row);
}

// ── 圖片上傳相關 ──
function triggerImgUpload(el){
  const wrap=el.closest('.pimg-wrap');
  const fi=wrap.querySelector('.pimg-file');
  if(fi) fi.click();
}
function triggerImgFromView(imgEl){
  // 購物頁圖片：管理員點擊換圖，一般用戶 lightbox
  if(currentUser==='管理員') return; // 管理員在後台編輯，購物頁不動
  openLightbox(imgEl.src);
}
function triggerImgChange(el){
  const wrap=el.closest('.pimg-wrap');
  const fi=wrap.querySelector('.pimg-file');
  if(fi) fi.click();
}
function clearProdImg(btn){
  const wrap=btn.closest('.pimg-wrap');
  const img=wrap.querySelector('img.pimg-thumb');
  const fileId=img?img.dataset.fileid:'';
  // 先清 DOM
  wrap.className='pimg-wrap';
  wrap.innerHTML=`<div class="pimg-empty" onclick="triggerImgUpload(this)" title="上傳圖片">📷</div><input type="hidden" class="pimg" value=""><input type="file" class="pimg-file" accept="image/*" style="display:none" onchange="handleImgUpload(this)">`;
  // 背景刪 Drive（失敗靜默，不擋 UX）
  if(fileId) callAPI({action:'deleteImage',fileId}).catch(()=>{});
}

function handleImgUpload(fileInput){
  const file=fileInput.files[0];
  if(!file) return;
  const wrap=fileInput.closest('.pimg-wrap');
  const hiddenUrl=wrap.querySelector('.pimg');
  const emptyEl=wrap.querySelector('.pimg-empty');
  // 記住舊 fileId（換圖時用）
  const oldImg=wrap.querySelector('img.pimg-thumb');
  const oldFileId=oldImg?oldImg.dataset.fileid:'';

  // 顯示 loading（空狀態用 emptyEl，換圖狀態用 wrap 蓋板）
  const prevContent=wrap.innerHTML;
  if(emptyEl){ emptyEl.innerHTML='<span class="loading"></span>'; }
  else { wrap.innerHTML=`<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;background:rgba(10,15,30,.6);border-radius:6px"><span class="loading"></span></div>`; }

  compressImage(file, 500*1024, (base64, mimeType)=>{
    const filename=`prod_${Date.now()}.${mimeType.split('/')[1]||'jpg'}`;
    callAPI({action:'uploadImage', filename, base64, mimeType})
      .then(res=>{
        if(res.ok&&res.url){
          hiddenUrl.value=res.url;
          wrap.className='pimg-wrap pimg-wrap-has';
          wrap.innerHTML=`<img class="pimg-thumb" src="${res.url}" onclick="triggerImgChange(this)" title="點擊換圖" data-fileid="${res.fileId||''}"><button class="pimg-del-x" onclick="clearProdImg(this)" title="刪除圖片">✕</button><input type="hidden" class="pimg" value="${res.url}"><input type="file" class="pimg-file" accept="image/*" style="display:none" onchange="handleImgUpload(this)">`;
          toast('圖片上傳成功！','success');
          if(oldFileId) callAPI({action:'deleteImage',fileId:oldFileId}).catch(()=>{});
        } else {
          if(emptyEl){ emptyEl.innerHTML='📷'; }
          else { wrap.className='pimg-wrap'; wrap.innerHTML=prevContent; }
          toast('上傳失敗：'+(res.error||'未知錯誤'),'error');
        }
      })
      .catch(()=>{
        if(emptyEl){ emptyEl.innerHTML='📷'; }
        else { wrap.className='pimg-wrap'; wrap.innerHTML=prevContent; }
        toast('上傳失敗','error');
      });
  });
}

function compressImage(file, maxBytes, cb){
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      let {width:w,height:h}=img;
      // 縮放到最長邊 1200px
      const maxDim=1200;
      if(w>maxDim||h>maxDim){
        if(w>h){ h=Math.round(h*maxDim/w); w=maxDim; }
        else { w=Math.round(w*maxDim/h); h=maxDim; }
      }
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      canvas.getContext('2d').drawImage(img,0,0,w,h);
      // 逐步降低品質直到低於 maxBytes
      let quality=0.85;
      let dataUrl=canvas.toDataURL('image/jpeg',quality);
      while(dataUrl.length*0.75>maxBytes&&quality>0.3){
        quality-=0.1;
        dataUrl=canvas.toDataURL('image/jpeg',quality);
      }
      const base64=dataUrl.split(',')[1];
      cb(base64,'image/jpeg');
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

// ── 從 Drive thumbnail URL 萃取 fileId ──
function _fileIdFromUrl(url){
  if(!url) return '';
  const m=url.match(/[?&]id=([^&]+)/);
  return m?m[1]:'';
}

// ── Lightbox ──
function openLightbox(url){
  document.getElementById('lb-img').src=url;
  document.getElementById('lb-ov').classList.add('open');
}
function closeLightbox(){
  document.getElementById('lb-ov').classList.remove('open');
  document.getElementById('lb-img').src='';
}

function saveEvent(){
  const name=document.getElementById('a-name').value.trim();
  const date=document.getElementById('a-date').value;
  const currency=document.getElementById('a-currency').value;
  const rate=parseFloat(document.getElementById('a-rate').value)||1;
  const threshold=parseInt(document.getElementById('a-threshold').value)||0;
  const desc=document.getElementById('a-desc').value.trim();
  const deadline=document.getElementById('a-deadline').value;
  if(!name){ toast('請輸入活動名稱','error'); return; }
  const rows=document.querySelectorAll('#prod-list .prow');
  const products=[]; let valid=true;
  rows.forEach(row=>{
    const pn=row.querySelector('.pn').value.trim();
    const pp=parseFloat(row.querySelector('.pp').value);
    const pno=row.querySelector('.pno').value.trim();
    const pot=row.querySelector('.pot').value;
    const povs=row.querySelector('.povs').value.trim();
    const pimg=row.querySelector('.pimg')?.value||'';
    const pexcl=row.querySelector('.pexcl')?.checked||false;
    if(pn&&!isNaN(pp)&&pp>=0) products.push({name:pn,price:pp,note:pno,optType:pot,optVals:pot==='custom'?povs.split('/').map(s=>s.trim()).filter(Boolean):[],imgUrl:pimg,excludeThreshold:pexcl});
    else if(pn||row.querySelector('.pp').value) valid=false;
  });
  if(!valid){ toast('請確認商品資料完整','error'); return; }
  if(!products.length){ toast('請至少新增一項商品','error'); return; }
  const ev={id:'ev_'+Date.now(),name,date,currency,rate,threshold,desc,deadline,products};
  events.push(ev); saveLocal(); renderEvents(); renderAdminEvents();
  document.getElementById('a-name').value=''; document.getElementById('a-date').value='';
  document.getElementById('a-threshold').value=''; document.getElementById('a-desc').value='';
  document.getElementById('prod-list').innerHTML=''; document.getElementById('a-currency').value='TWD';
  document.getElementById('a-rate').value='1'; updateRateHelp(); addProdRow();
  callAPI({action:'saveEvent',event:ev}).catch(()=>{});
  toast('活動已儲存！','success');
}

function renderAdminEvents(){
  const c=document.getElementById('admin-ev-list');
  if(!events.length){ c.innerHTML='<div class="empty-state" style="padding:30px 0"><p>目前沒有活動</p></div>'; return; }
  c.innerHTML=`<div class="otable-wrap"><table class="otable">
    <thead><tr><th>活動名稱</th><th>日期</th><th>幣別 / 匯率</th><th>滿額門檻</th><th>商品</th><th>操作</th></tr></thead>
    <tbody>${events.map(e=>`<tr>
      <td style="font-weight:600;color:var(--text)">${esc(e.name)}${e.products&&e.products.some(p=>p.optType==='members')?' <span style="font-size:10px;color:var(--sky)">👥</span>':''}</td>
      <td>${e.date||'—'}</td>
      <td>${e.currency&&e.currency!=='TWD'?`<span class="fx-badge">${e.currency} × ${e.rate}</span>`:'<span style="color:var(--text3)">TWD</span>'}</td>
      <td>${e.threshold>0?`${e.currency||'TWD'} ${fmt(e.threshold)}`:'—'}</td>
      <td>${e.products.length}</td>
      <td style="display:flex;gap:6px">
        <button onclick="editEvent('${e.id}')" style="padding:4px 11px;background:rgba(45,79,212,.15);border:1px solid rgba(107,142,240,.3);border-radius:6px;color:var(--sky-lt);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">編輯</button>
        <button onclick="deleteEvent('${e.id}')" style="padding:4px 11px;background:rgba(248,113,113,.08);border:1px solid rgba(248,113,113,.25);border-radius:6px;color:var(--red);cursor:pointer;font-size:12px;font-family:'Noto Sans TC',sans-serif">刪除</button>
      </td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function editEvent(id){
  const ev=events.find(e=>e.id===id); if(!ev) return;
  document.getElementById('a-name').value=ev.name;
  document.getElementById('a-date').value=ev.date||'';
  document.getElementById('a-currency').value=ev.currency||'TWD';
  document.getElementById('a-rate').value=ev.rate||1;
  document.getElementById('a-threshold').value=ev.threshold||0;
  document.getElementById('a-desc').value=ev.desc||'';
  document.getElementById('a-deadline').value=ev.deadline?ev.deadline.replace(' ','T').slice(0,16):'';
  updateRateHelp();
  document.getElementById('prod-list').innerHTML='';
  ev.products.forEach(p=>addProdRow(p.name,p.price,p.note||'',p.optType||'none',(p.optVals||[]).join('/'),p.imgUrl||'',!!p.excludeThreshold));
  const saveBtn=document.querySelector('.save-btn');
  saveBtn.textContent='更新活動'; saveBtn.dataset.editId=id; saveBtn.onclick=()=>updateEvent(id);
  document.querySelector('.admin-card').scrollIntoView({behavior:'smooth'});
  toast('已載入活動資料，修改後按更新活動');
}

function updateEvent(id){
  const name=document.getElementById('a-name').value.trim();
  const date=document.getElementById('a-date').value;
  const currency=document.getElementById('a-currency').value;
  const rate=parseFloat(document.getElementById('a-rate').value)||1;
  const threshold=parseInt(document.getElementById('a-threshold').value)||0;
  const desc=document.getElementById('a-desc').value.trim();
  const deadline=document.getElementById('a-deadline').value;
  if(!name){ toast('請輸入活動名稱','error'); return; }
  const rows=document.querySelectorAll('#prod-list .prow');
  const products=[]; let valid=true;
  rows.forEach(row=>{
    const pn=row.querySelector('.pn').value.trim();
    const pp=parseFloat(row.querySelector('.pp').value);
    const pno=row.querySelector('.pno').value.trim();
    const pot=row.querySelector('.pot').value;
    const povs=row.querySelector('.povs').value.trim();
    const pimg=row.querySelector('.pimg')?.value||'';
    const pexcl=row.querySelector('.pexcl')?.checked||false;
    if(pn&&!isNaN(pp)&&pp>=0) products.push({name:pn,price:pp,note:pno,optType:pot,optVals:pot==='custom'?povs.split('/').map(s=>s.trim()).filter(Boolean):[],imgUrl:pimg,excludeThreshold:pexcl});
    else if(pn||row.querySelector('.pp').value) valid=false;
  });
  if(!valid){ toast('請確認商品資料完整','error'); return; }
  if(!products.length){ toast('請至少新增一項商品','error'); return; }
  const idx=events.findIndex(e=>e.id===id);
  if(idx===-1){ toast('找不到活動','error'); return; }
  events[idx]={id,name,date,currency,rate,threshold,desc,deadline,products};
  saveLocal(); renderEvents(); renderAdminEvents();
  callAPI({action:'deleteEvent',eventId:id}).then(()=>callAPI({action:'saveEvent',event:events[idx]})).catch(()=>{});
  resetSaveBtn();
  toast('活動已更新！','success');
}

function resetSaveBtn(){
  document.getElementById('a-name').value=''; document.getElementById('a-date').value='';
  document.getElementById('a-threshold').value=''; document.getElementById('a-desc').value='';
  document.getElementById('prod-list').innerHTML=''; document.getElementById('a-currency').value='TWD';
  document.getElementById('a-rate').value='1'; document.getElementById('a-deadline').value='';
  updateRateHelp(); addProdRow();
  const saveBtn=document.querySelector('.save-btn');
  saveBtn.textContent='儲存活動'; saveBtn.onclick=()=>saveEvent();
}

function deleteEvent(id){
  showModal('確認刪除','確定要刪除這個活動嗎？此動作無法復原。',()=>{
    events=events.filter(e=>e.id!==id);
    saveLocal(); renderEvents(); renderAdminEvents();
    callAPI({action:'deleteEvent',eventId:id}).catch(()=>{});
    toast('活動已刪除');
  });
}

// ══════════════════════════════════════
//  API / UTILS
// ══════════════════════════════════════
function callAPI(data){
  if(!API_URL||API_URL==='YOUR_APPS_SCRIPT_WEB_APP_URL_HERE') return Promise.resolve({ok:true,orders:[]});
  return fetch(API_URL,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(data)}).then(r=>r.json());
}

let _mCb=null;
function showModal(title,msg,cb){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-msg').textContent=msg;
  _mCb=cb;
  document.getElementById('modal').classList.add('open');
}
document.getElementById('modal-ok').addEventListener('click',()=>{ if(_mCb)_mCb(); closeModal(); });
function closeModal(){ document.getElementById('modal').classList.remove('open'); _mCb=null; }

function toast(msg,type=''){
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast'+(type?' '+type:'');
  t.classList.add('show');
  clearTimeout(t._t);
  t._t=setTimeout(()=>t.classList.remove('show'),2800);
}

function _parseDeadline(s){
  if(!s) return null;
  const p=String(s).replace('T',' ').split(' ');
  const [y,mo,d]=p[0].split('-').map(Number);
  const [h,mi]=(p[1]||'0:0').split(':').map(Number);
  return new Date(y,mo-1,d,h,mi);
}
function isExpired(deadline){ if(!deadline) return false; const d=_parseDeadline(deadline); return !!(d&&new Date()>d); }

function fmtTimestamp(ts){
  if(!ts) return '';
  const d=new Date(ts);
  if(!isNaN(d.getTime())){
    return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }
  return ts;
}

function deleteOrder(idx){
  showModal('確認刪除','確定要刪除這筆訂單嗎？此動作無法復原。',()=>{
    callAPI({action:'deleteOrder',orderIndex:idx})
      .then(()=>{ toast('訂單已刪除','success'); loadOrders(); })
      .catch(()=>toast('刪除失敗','error'));
  });
}

function shareOrder(idx){
  const o=_allOrders[idx];
  if(!o){ toast('找不到訂單','error'); return; }
  const itemMap={};
  (o.items||[]).forEach(i=>{
    const key=`${i.eventName}||${i.prodName}`;
    // priceTWD 為 0（舊格式）時，從 events 匯率重算
    let priceTWD=i.priceTWD||0;
    if(!priceTWD&&i.priceOrig){
      const ev=events.find(e=>e.name===i.eventName);
      priceTWD=ev&&ev.rate?Math.round(i.priceOrig*ev.rate):i.priceOrig;
    }
    if(!itemMap[key]) itemMap[key]={eventName:i.eventName,prodName:i.prodName,currency:i.currency||'TWD',priceOrig:i.priceOrig||0,priceTWD,entries:[],totalQty:0};
    itemMap[key].entries.push({member:i.member,qty:i.qty});
    itemMap[key].totalQty+=i.qty;
    if(i.priceTWD) itemMap[key].priceTWD=i.priceTWD;
    if(i.priceOrig) itemMap[key].priceOrig=i.priceOrig;
  });
  const byEvent={};
  Object.values(itemMap).forEach(g=>{
    if(!byEvent[g.eventName]) byEvent[g.eventName]=[];
    byEvent[g.eventName].push(g);
  });
  let lines=[`🛍️ ${o.user} 的代購清單`,'─────────────────'];
  Object.entries(byEvent).forEach(([evName,gs])=>{
    lines.push(`📦 ${evName}`);
    gs.forEach(g=>{
      const price=g.currency&&g.currency!=='TWD'
        ?`${g.currency} ${fmt(g.priceOrig*g.totalQty)} ≈ NT$${fmt(g.priceTWD*g.totalQty)}`
        :`NT$${fmt(g.priceTWD*g.totalQty)}`;
      lines.push(`  • ${g.prodName} × ${g.totalQty}　${price}`);
      const hasMembers=g.entries.some(e=>e.member);
      if(hasMembers) lines.push(`    ${g.entries.map(e=>e.member+'×'+e.qty).join(' ')}`);
    });
  });
  lines.push('─────────────────');
  lines.push(`💰 合計 NT$${fmt(o.subtotal||0)}`);
  if(o.cards&&o.cards.length) lines.push(`🎁 ${o.cards.join('、')}`);
  if(o.remark) lines.push(`📝 ${o.remark}`);
  const NL='\n';const text=lines.join(NL);
  navigator.clipboard.writeText(text)
    .then(()=>toast('已複製！','success'))
    .catch(()=>{ const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast('已複製！','success'); });
}
function fmtDeadline(deadline){
  if(!deadline) return '';
  const d=_parseDeadline(deadline);
  if(!d) return String(deadline);
  return (d.getMonth()+1)+'/'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmt(n){ return Number(n||0).toLocaleString(); }
