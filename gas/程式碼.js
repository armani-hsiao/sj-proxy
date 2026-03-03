// ══════════════════════════════════════════════════════════
//  SJ 代購系統 — Google Apps Script 後端 v2
//  部署：擴充功能 > Apps Script > 部署 > 新部署
//        類型：網路應用程式 | 執行身分：我 | 存取權：所有人
// ══════════════════════════════════════════════════════════

const SHEET_ORDERS = '訂單記錄';
const DRIVE_FOLDER_ID = '1p7nkWO9dExTHHo4A7sdZL5u23lH7O1CI';
const SHEET_EVENTS = '活動場次';
const PASSWORDS = {
  user: '33',
  admin: '110633'
};
const TEST = 'test';

function verifyPassword(role, password) {
  if (role === 'admin') return password === PASSWORDS.admin;
  if (role === 'user') return password === PASSWORDS.user;
  return false;
}

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#162040')
      .setFontColor('#96aefd');
    sh.setFrozenRows(1);
  }
  return sh;
}

function doGet(e) {
  const action = e && e.parameter && e.parameter.action;
  let result;
  try {
    if (action === 'getEvents') result = getEvents();
    else if (action === 'getOrders') result = getOrders();
    else result = { ok: true, message: 'SJ 代購系統 API 運行中' };
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let data;
  try { data = JSON.parse(e.postData.contents); }
  catch(err) { return jsonResp({ ok: false, error: '無效的 JSON' }); }
  let result;
  try {
    switch(data.action) {
      case 'submitOrder': result = submitOrder(data); break;
      case 'saveEvent':   result = saveEvent(data.event); break;
      case 'deleteEvent': result = deleteEvent(data.eventId); break;
      case 'getOrders':   result = getOrders(); break;
      case 'getEvents':   result = getEvents(); break;
      case 'updateOrder': result = updateOrder(data.orderIndex, data.order || data); break;
      case 'deleteOrder': result = deleteOrder(data.orderIndex); break;
      case 'migrateOrdersEventIdOnce': result = migrateOrdersEventIdOnce(!!data.force); break;
      case 'uploadImage': result = uploadImage(data.filename, data.base64, data.mimeType); break;
      case 'deleteImage': result = deleteImage(data.fileId); break;
      case 'verifyPassword': result = { ok: true, valid: verifyPassword(data.role, data.password) }; break;
      default: result = { ok: false, error: '未知的 action' };
    }
  } catch(err) { result = { ok: false, error: err.message }; }
  return jsonResp(result);
}

function jsonResp(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── 儲存活動 ──────────────────────────────────────────────
function saveEvent(ev) {
  const sh = getOrCreateSheet(SHEET_EVENTS, [
    '活動ID','活動名稱','日期','幣別','匯率→TWD','滿額門檻(TWD)','下單期限','說明','商品清單(JSON)','建立時間'
  ]);
  sh.appendRow([
    ev.id, ev.name, ev.date||'',
    ev.currency||'TWD', ev.rate||1, ev.threshold||0,
    ev.deadline||'',
    ev.desc||'', JSON.stringify(ev.products),
    new Date().toLocaleString('zh-TW')
  ]);
  try { sh.autoResizeColumns(1, 10); } catch(e) {}
  syncOrdersByEvent(ev.id);
  return { ok: true };
}

// ── 刪除活動 ──────────────────────────────────────────────
function deleteEvent(eventId) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EVENTS);
  if (!sh) return { ok: true };
  const data = sh.getDataRange().getValues();
  for (let i = data.length - 1; i >= 1; i--) {
    if (data[i][0] === eventId) { sh.deleteRow(i + 1); break; }
  }
  return { ok: true };
}

// ── 取得所有活動 ──────────────────────────────────────────
function getEvents() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_EVENTS);
  if (!sh) return { ok: true, events: [] };
  const rows = sh.getDataRange().getValues();
  const evs = [];
  for (let i = 1; i < rows.length; i++) {
    const [id, name, date, currency, rate, threshold, deadline, desc, productsJson] = rows[i];
    let products = [];
    try { products = JSON.parse(productsJson); } catch(e) {}
    evs.push({ id, name, date, currency, rate: Number(rate), threshold: Number(threshold), deadline: deadline||'', desc, products });
  }
  return { ok: true, events: evs };
}

// ── 品項文字格式（含成員）────────────────────────────────
// 格式：活動名 — 品名 × 數量 [成員] (幣別 金額) = NT$金額
// 無成員：活動名 — 品名 × 數量 (幣別 金額) = NT$金額
function buildItemText(i) {
  // 格式：活動名 — 品名 × 數量 [成員] {幣別:單價/TWD:單價}
  // 範例：SJ WORLD TOUR — 棒棒糖 × 3 [特] {JPY:500/TWD:105}
  const priceTag = `{${i.currency||'TWD'}:${i.priceOrig||0}/TWD:${i.priceTWD||0}}`;
  return `${i.eventName} — ${i.prodName} × ${i.qty}` +
    (i.member ? ` [${i.member}]` : '') +
    ` ${priceTag}`;
}

// ── 送出訂單 ──────────────────────────────────────────────
function submitOrder(data) {
  const sh = getOrCreateSheet(SHEET_ORDERS, [
    '時間','用戶','品項明細','合計(TWD)','原幣明細','成員','滿額卡','備注','活動截止時間'
  ]);

  const itemsText = data.items.map(i => buildItemText(i)).join('\n');

  const origText = data.items.map(i =>
    i.currency !== 'TWD' ? `${i.currency} ${i.priceOrig} × ${i.qty}` : ''
  ).filter(Boolean).join('、') || '—';

  // 成員欄：蒐集所有唯一成員
  const allMembers = [...new Set(data.items.filter(i => i.member).map(i => i.member))].join('、') || '—';
  const cardsText = (data.cards || []).join(', ') || '無';

  sh.appendRow([
    data.timestamp || new Date().toLocaleString('zh-TW'),
    data.user, itemsText, data.subtotal,
    origText, allMembers, cardsText, data.remark || '',
    data.deadline || ''
  ]);
  try { sh.autoResizeColumns(1, 9); } catch(e) {}
  return { ok: true };
}

// ── 取得所有訂單 ──────────────────────────────────────────
function getOrders() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sh) return { ok: true, orders: [] };
  const rows = sh.getDataRange().getValues();
  const orders = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    const [timestamp, user, itemsText, subtotal, origText, membersText, cardsText, remark, deadline] = rows[i];
    const items = String(itemsText).split('\n').map(line => {
      const m = line.match(/^(.+) — (.+) × (\d+)/);
      if (!m) return null;
      const memMatch = line.match(/\[([^\]]+)\]/);
      // 新格式：{JPY:500/TWD:105}
      const priceNew = line.match(/\{([A-Z]{3}):([\.\d]+)\/TWD:([\.\d]+)\}/);
      // 舊格式相容：(JPY 1500) = NT$315
      const curOld = line.match(/\(([A-Z]{3})\s([\d.]+)\)/);
      const twdOld = line.match(/= NT\$([\.\d]+)/);
      let currency = 'TWD', priceOrig = 0, priceTWD = 0;
      if (priceNew) {
        currency = priceNew[1];
        priceOrig = parseFloat(priceNew[2]);
        priceTWD = parseFloat(priceNew[3]);
      } else if (curOld) {
        currency = curOld[1];
        const qty = parseInt(m[3]);
        priceOrig = qty > 0 ? parseFloat(curOld[2]) / qty : 0;
        priceTWD = twdOld && qty > 0 ? parseFloat(twdOld[1]) / qty : 0;
      } else if (twdOld) {
        const qty = parseInt(m[3]);
        priceTWD = qty > 0 ? parseFloat(twdOld[1]) / qty : 0;
        priceOrig = priceTWD;
      }
      return {
        eventName: m[1].trim(),
        prodName: m[2].trim(),
        qty: parseInt(m[3]),
        member: memMatch ? memMatch[1] : null,
        currency, priceOrig, priceTWD
      };
    }).filter(Boolean);

    orders.push({
      timestamp, user, items, subtotal: Number(subtotal),
      cards: cardsText && cardsText !== '無' ? String(cardsText).split(', ') : [],
      members: membersText && membersText !== '—' ? String(membersText).split('、') : [],
      remark,
      deadline: deadline || ''
    });
  }
  return { ok: true, orders };
}

// ── 更新訂單 ──────────────────────────────────────────────
function updateOrder(idx, updated) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sh) return { ok: false, error: '找不到訂單工作表' };

  const data = sh.getDataRange().getValues();
  // idx 是倒序索引，換算實際行號
  const rowNum = data.length - idx;
  if (rowNum < 2 || rowNum > data.length) return { ok: false, error: '找不到該筆訂單' };

  const itemsText = updated.items.map(i => buildItemText(i)).join('\n');

  const origText = updated.items.map(i =>
    i.currency !== 'TWD' ? `${i.currency} ${i.priceOrig} × ${i.qty}` : ''
  ).filter(Boolean).join('、') || '—';

  const allMem = [...new Set(updated.items.filter(i => i.member).map(i => i.member))].join('、') || '—';

  sh.getRange(rowNum, 3).setValue(itemsText);
  sh.getRange(rowNum, 4).setValue(updated.subtotal);
  sh.getRange(rowNum, 5).setValue(origText);
  sh.getRange(rowNum, 6).setValue(allMem);
  sh.getRange(rowNum, 8).setValue(updated.remark || '');

  return { ok: true };
}

// ── 刪除訂單 ──────────────────────────────────────────────
function deleteOrder(idx) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sh) return { ok: false, error: '找不到訂單工作表' };
  const data = sh.getDataRange().getValues();
  const rowNum = data.length - idx;
  if (rowNum < 2 || rowNum > data.length) return { ok: false, error: '找不到該筆訂單' };
  sh.deleteRow(rowNum);
  return { ok: true };
}

// ── 上傳圖片到 Google Drive ────────────────────────────────
// Override: order records keyed by eventId, and support syncing records when event changes.
function buildItemText(i) {
  const priceTag = `{${i.currency||'TWD'}:${i.priceOrig||0}/TWD:${i.priceTWD||0}}`;
  const eventId = i.eventId || '';
  const eventDate = i.eventDate || '';
  return `[EV:${eventId}][DT:${eventDate}] ${i.eventName||''} — ${i.prodName} × ${i.qty}` +
    (i.member ? ` [${i.member}]` : '') +
    ` ${priceTag}`;
}

function parseItemTextLine(line) {
  const s = String(line || '').trim();
  if (!s) return null;
  const m = s.match(/^(.+) — (.+) × (\d+)/);
  if (!m) return null;

  const eventIdMatch = s.match(/\[EV:([^\]]*)\]/);
  const eventDateMatch = s.match(/\[DT:([^\]]*)\]/);
  const eventNameRaw = m[1] || '';
  const eventName = eventNameRaw.replace(/\[EV:[^\]]*\]/,'').replace(/\[DT:[^\]]*\]/,'').trim();
  const prodName = (m[2] || '').trim();
  const qty = parseInt(m[3], 10) || 0;
  const memMatch = s.match(/\[([^\]]+)\](?!.*\[EV:)/);
  const priceNew = s.match(/\{([A-Z]{3}):([\.\d]+)\/TWD:([\.\d]+)\}/);
  const curOld = s.match(/\(([A-Z]{3})\s([\d.]+)\)/);
  const twdOld = s.match(/= NT\$([\.\d]+)/);

  let currency = 'TWD', priceOrig = 0, priceTWD = 0;
  if (priceNew) {
    currency = priceNew[1];
    priceOrig = parseFloat(priceNew[2]);
    priceTWD = parseFloat(priceNew[3]);
  } else if (curOld) {
    currency = curOld[1];
    priceOrig = qty > 0 ? parseFloat(curOld[2]) / qty : 0;
    priceTWD = twdOld && qty > 0 ? parseFloat(twdOld[1]) / qty : 0;
  } else if (twdOld) {
    priceTWD = qty > 0 ? parseFloat(twdOld[1]) / qty : 0;
    priceOrig = priceTWD;
  }

  return {
    eventId: eventIdMatch ? eventIdMatch[1] : '',
    eventDate: eventDateMatch ? eventDateMatch[1] : '',
    eventName,
    prodName,
    qty,
    member: memMatch ? memMatch[1] : null,
    currency, priceOrig, priceTWD
  };
}

function getEventsMap() {
  const evRes = getEvents();
  const map = {};
  (evRes.events || []).forEach(ev => { map[ev.id] = ev; });
  return map;
}

function eventTotalForCards(items, ev) {
  if (!ev || !ev.products) return 0;
  return items.reduce((sum, it) => {
    if (it.eventId !== ev.id) return sum;
    const p = ev.products.find(x => x.name === it.prodName);
    if (p && p.excludeThreshold) return sum;
    return sum + (Number(it.priceOrig) || 0) * (Number(it.qty) || 0);
  }, 0);
}

function cardsFromItems(items, eventsMap) {
  const byEvent = {};
  items.forEach(it => {
    if (!it.eventId) return;
    if (!byEvent[it.eventId]) byEvent[it.eventId] = [];
    byEvent[it.eventId].push(it);
  });
  const out = [];
  Object.keys(byEvent).forEach(eid => {
    const ev = eventsMap[eid];
    if (!ev) return;
    const thr = Number(ev.threshold || 0);
    if (thr <= 0) return;
    const total = eventTotalForCards(byEvent[eid], ev);
    if (total >= thr) {
      const n = Math.floor(total / thr);
      out.push(n > 1 ? `${ev.name} 滿額卡 ×${n}` : `${ev.name} 滿額卡`);
    }
  });
  return out;
}

function syncOrdersByEvent(eventId) {
  if (!eventId) return;
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sh) return;
  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) return;

  const eventsMap = getEventsMap();
  const target = eventsMap[eventId];
  if (!target) return;

  for (let i = 1; i < rows.length; i++) {
    const itemsText = rows[i][2];
    const orderItems = String(itemsText || '').split('\n').map(parseItemTextLine).filter(Boolean);
    if (!orderItems.length) continue;

    let touched = false;
    orderItems.forEach(it => {
      if (it.eventId === eventId || (!it.eventId && it.eventName === target.name)) {
        it.eventId = target.id;
        it.eventDate = target.date || '';
        it.eventName = target.name;
        touched = true;
      }
    });
    if (!touched) continue;

    const newItemsText = orderItems.map(buildItemText).join('\n');
    const newCards = cardsFromItems(orderItems, eventsMap).join(', ') || '無';
    const orderEventIds = [...new Set(orderItems.map(it => it.eventId).filter(Boolean))];
    const deadlines = orderEventIds.map(eid => (eventsMap[eid] && eventsMap[eid].deadline) || '').filter(Boolean);
    const newDeadline = deadlines.length ? deadlines.sort()[0] : rows[i][8];

    sh.getRange(i + 1, 3).setValue(newItemsText);
    sh.getRange(i + 1, 7).setValue(newCards);
    sh.getRange(i + 1, 9).setValue(newDeadline || '');
  }
}

function migrateOrdersEventIdOnce(force) {
  const key = 'orders_event_id_migration_v1_done';
  const props = PropertiesService.getScriptProperties();
  const done = props.getProperty(key) === 'done';
  if (done && !force) {
    return { ok: true, skipped: true, message: 'migration already done' };
  }

  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sh) {
    props.setProperty(key, 'done');
    return { ok: true, skipped: true, message: 'orders sheet not found' };
  }

  const rows = sh.getDataRange().getValues();
  if (rows.length <= 1) {
    props.setProperty(key, 'done');
    return { ok: true, skipped: true, message: 'no orders to migrate' };
  }

  const eventsMap = getEventsMap();
  const eventsByName = {};
  Object.keys(eventsMap).forEach(eid => {
    const ev = eventsMap[eid];
    const n = String(ev.name || '');
    if (!eventsByName[n]) eventsByName[n] = [];
    eventsByName[n].push(ev);
  });

  let updatedOrders = 0;
  let migratedItems = 0;
  let unresolvedItems = 0;

  for (let i = 1; i < rows.length; i++) {
    const itemsText = rows[i][2];
    const orderItems = String(itemsText || '').split('\n').map(parseItemTextLine).filter(Boolean);
    if (!orderItems.length) continue;

    let changed = false;
    orderItems.forEach(it => {
      if (it.eventId && eventsMap[it.eventId]) {
        const ev = eventsMap[it.eventId];
        if (it.eventName !== ev.name || (it.eventDate || '') !== (ev.date || '')) {
          it.eventName = ev.name;
          it.eventDate = ev.date || '';
          changed = true;
        }
        return;
      }

      if (!it.eventId) {
        const cands = eventsByName[String(it.eventName || '')] || [];
        if (cands.length === 1) {
          const ev = cands[0];
          it.eventId = ev.id;
          it.eventName = ev.name;
          it.eventDate = ev.date || '';
          migratedItems++;
          changed = true;
        } else {
          unresolvedItems++;
        }
      }
    });

    if (!changed) continue;

    const newItemsText = orderItems.map(buildItemText).join('\n');
    const newCards = cardsFromItems(orderItems, eventsMap).join(', ') || '無';
    const orderEventIds = [...new Set(orderItems.map(it => it.eventId).filter(Boolean))];
    const deadlines = orderEventIds.map(eid => (eventsMap[eid] && eventsMap[eid].deadline) || '').filter(Boolean);
    const newDeadline = deadlines.length ? deadlines.sort()[0] : rows[i][8];

    sh.getRange(i + 1, 3).setValue(newItemsText);
    sh.getRange(i + 1, 7).setValue(newCards);
    sh.getRange(i + 1, 9).setValue(newDeadline || '');
    updatedOrders++;
  }

  props.setProperty(key, 'done');
  return { ok: true, updatedOrders, migratedItems, unresolvedItems, forced: !!force };
}

function getOrders() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_ORDERS);
  if (!sh) return { ok: true, orders: [] };
  const rows = sh.getDataRange().getValues();
  const orders = [];
  for (let i = rows.length - 1; i >= 1; i--) {
    const [timestamp, user, itemsText, subtotal, origText, membersText, cardsText, remark, deadline] = rows[i];
    const items = String(itemsText).split('\n').map(parseItemTextLine).filter(Boolean);

    orders.push({
      timestamp, user, items, subtotal: Number(subtotal),
      cards: cardsText && cardsText !== '無' ? String(cardsText).split(', ') : [],
      members: membersText && membersText !== '無' ? String(membersText).split('、') : [],
      remark,
      deadline: deadline || ''
    });
  }
  return { ok: true, orders };
}

function uploadImage(filename, base64, mimeType) {
  try {
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64), mimeType || 'image/jpeg', filename);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileId = file.getId();
    // 回傳可直接嵌入 <img> 的縮圖 URL
    const url = `https://drive.google.com/thumbnail?id=${fileId}&sz=w400`;
    return { ok: true, url, fileId };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}

// ── 刪除 Drive 圖片 ────────────────────────────────────────
function deleteImage(fileId) {
  try {
    const file = DriveApp.getFileById(fileId);
    file.setTrashed(true);
    return { ok: true };
  } catch(err) {
    return { ok: false, error: err.message };
  }
}
