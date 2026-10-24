'use strict';

const STORAGE_KEY = 'calc-buy-goods.events.v1';

// ---- データ ----

function loadEvents() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

let events = loadEvents();

function saveEvents() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
  } catch (e) {
    alert('保存できませんでした。ブラウザの設定を確認してください。');
  }
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function findEvent(id) {
  return events.find((ev) => ev.id === id);
}

function touch(ev) {
  ev.updatedAt = new Date().toISOString();
  saveEvents();
}

// 全角数字やカンマ入りの入力も受け付けて、0以上の整数にする
function toInt(value) {
  const half = String(value ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[^0-9]/g, '');
  return half ? parseInt(half, 10) : 0;
}

function yen(n) {
  return n.toLocaleString('ja-JP') + '円';
}

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function calc(ev) {
  const goods = ev.items
    .filter((it) => it.checked)
    .reduce((sum, it) => sum + it.price * it.qty, 0);
  const total = goods + ev.shipping + ev.fee;
  return { goods, total, remain: ev.budget - total };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// ---- 画面の切り替え ----

const app = document.getElementById('app');

function route() {
  const hash = location.hash;
  const m = hash.match(/^#\/event\/(.+)$/);
  const ev = m && findEvent(decodeURIComponent(m[1]));
  const h = hash.match(/^#\/history(?:\/(event|month|year))?(?:\/([0-9-]+))?$/);
  let tab = 'events';
  if (ev) {
    renderEvent(ev);
  } else if (h) {
    renderHistory(h[1] || 'event', h[2]);
    tab = 'history';
  } else if (hash === '#/settings') {
    renderSettings();
    tab = 'settings';
  } else {
    renderList();
  }
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.tab === tab);
  });
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);

// ---- イベント一覧 ----

function renderList() {
  document.title = 'グッズ計算';
  const sorted = [...events].sort((a, b) =>
    b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));

  const cards = sorted.map((ev) => {
    const { total, remain } = calc(ev);
    const done = ev.status === 'purchased';
    return `
      <a class="card event-card" href="#/event/${encodeURIComponent(ev.id)}">
        <div class="row">
          <span class="name">${esc(ev.name)}</span>
          <span class="badge ${done ? 'done' : ''}">${done ? '購入済み' : '買い物中'}</span>
        </div>
        <div class="meta">
          ${esc(ev.date)} ・ ${yen(total)} / 予算 ${yen(ev.budget)}
          ${remain < 0 ? `<span style="color:var(--over)">（${yen(-remain)}オーバー）</span>` : ''}
        </div>
      </a>`;
  }).join('');

  app.innerHTML = `
    <header class="topbar">
      <h1>グッズ計算</h1>
      <button class="primary" id="new-event">＋ 新しいイベント</button>
    </header>
    ${events.length
      ? `<div class="event-list">${cards}</div>`
      : `<p class="empty">まだイベントがありません。<br>「＋ 新しいイベント」から予算を決めて始めましょう。</p>`}
  `;

  document.getElementById('new-event').onclick = () => openEventDialog(null);
}

// ---- 買い物画面 ----

function renderEvent(ev) {
  document.title = ev.name + ' | グッズ計算';
  const done = ev.status === 'purchased';

  app.innerHTML = `
    <header class="topbar">
      <a class="back" href="#/">‹ 一覧</a>
      <h1>${esc(ev.name)}</h1>
      <button class="link" id="edit-event">編集</button>
    </header>
    ${ev.memo ? `<p class="memo">${esc(ev.memo)}</p>` : ''}

    <section class="summary" id="summary"></section>

    <h3 class="section-title">グッズ</h3>
    <div class="items" id="items"></div>
    <form class="add-form" id="add-form" autocomplete="off">
      <input name="name" placeholder="グッズ名" required>
      <input name="price" placeholder="単価" inputmode="numeric" required>
      <button class="primary" type="submit">追加</button>
    </form>
    <button class="bulk-open" id="bulk-open">📋 まとめて入力（テキスト・画像）</button>

    <h3 class="section-title">送料・手数料</h3>
    <div class="costs card">
      <label>送料（円）
        <input id="shipping" inputmode="numeric" value="${ev.shipping || ''}" placeholder="0">
      </label>
      <label>手数料（円）
        <input id="fee" inputmode="numeric" value="${ev.fee || ''}" placeholder="0">
      </label>
    </div>

    <div class="footer-actions">
      <button class="${done ? '' : 'primary'}" id="toggle-status">
        ${done ? '買い物中に戻す' : '購入確定'}
      </button>
    </div>
  `;

  const itemsEl = document.getElementById('items');
  ev.items.forEach((it) => itemsEl.appendChild(itemRow(ev, it)));
  updateSummary(ev);

  document.getElementById('edit-event').onclick = () => openEventDialog(ev);
  document.getElementById('bulk-open').onclick = () => openBulkDialog(ev);

  document.getElementById('add-form').onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    const price = toInt(form.price.value);
    if (!name) return;
    const it = { id: newId(), name, price, qty: 1, checked: true };
    ev.items.push(it);
    touch(ev);
    itemsEl.appendChild(itemRow(ev, it));
    updateSummary(ev);
    form.reset();
    form.name.focus();
  };

  for (const key of ['shipping', 'fee']) {
    document.getElementById(key).oninput = (e) => {
      ev[key] = toInt(e.target.value);
      touch(ev);
      updateSummary(ev);
    };
  }

  document.getElementById('toggle-status').onclick = () => {
    if (done) {
      ev.status = 'shopping';
    } else {
      const { total } = calc(ev);
      if (!confirm(`合計 ${yen(total)} で購入確定しますか？`)) return;
      ev.status = 'purchased';
    }
    touch(ev);
    renderEvent(ev);
  };
}

function itemRow(ev, it) {
  const row = document.createElement('div');
  row.className = 'item card' + (it.checked ? '' : ' off');
  row.innerHTML = `
    <input type="checkbox" class="check" ${it.checked ? 'checked' : ''} aria-label="買う">
    <input class="item-name" value="${esc(it.name)}" aria-label="グッズ名">
    <button class="link remove" aria-label="削除">✕</button>
    <div class="line2">
      <input class="price" inputmode="numeric" value="${it.price}" aria-label="単価">
      <span class="times">×</span>
      <div class="qty">
        <button type="button" data-d="-1" aria-label="減らす">−</button>
        <span>${it.qty}</span>
        <button type="button" data-d="1" aria-label="増やす">＋</button>
      </div>
      <span class="subtotal"></span>
    </div>
  `;

  const subtotal = row.querySelector('.subtotal');
  const qtyLabel = row.querySelector('.qty span');
  const refresh = () => {
    subtotal.textContent = yen(it.price * it.qty);
    qtyLabel.textContent = it.qty;
    row.classList.toggle('off', !it.checked);
    touch(ev);
    updateSummary(ev);
  };
  subtotal.textContent = yen(it.price * it.qty);

  row.querySelector('.check').onchange = (e) => { it.checked = e.target.checked; refresh(); };
  row.querySelector('.item-name').oninput = (e) => { it.name = e.target.value; touch(ev); };
  row.querySelector('.price').oninput = (e) => { it.price = toInt(e.target.value); refresh(); };
  row.querySelectorAll('.qty button').forEach((b) => {
    b.onclick = () => {
      it.qty = Math.max(1, it.qty + Number(b.dataset.d));
      refresh();
    };
  });
  row.querySelector('.remove').onclick = () => {
    if (!confirm(`「${it.name}」を削除しますか？`)) return;
    ev.items = ev.items.filter((x) => x !== it);
    row.remove();
    touch(ev);
    updateSummary(ev);
  };
  return row;
}

function updateSummary(ev) {
  const { goods, total, remain } = calc(ev);
  const ratio = ev.budget > 0 ? total / ev.budget : (total > 0 ? 2 : 0);
  const barClass = ratio > 1 ? 'over' : ratio >= 0.9 ? 'warn' : '';
  document.getElementById('summary').innerHTML = `
    <div class="total-label">合計${ev.status === 'purchased' ? '（購入済み）' : ''}</div>
    <div class="total">${yen(total)}</div>
    <div class="figures">
      <span>予算 <b>${yen(ev.budget)}</b></span>
      <span class="remain ${remain < 0 ? 'over' : 'ok'}">
        ${remain < 0 ? `<b>${yen(-remain)}オーバー</b>` : `残り <b>${yen(remain)}</b>`}
      </span>
    </div>
    <div class="bar ${barClass}"><span style="width:${Math.min(ratio, 1) * 100}%"></span></div>
    <div class="breakdown">グッズ ${yen(goods)} ＋ 送料 ${yen(ev.shipping)} ＋ 手数料 ${yen(ev.fee)}</div>
  `;
}

// ---- まとめて入力（テキスト・画像から） ----

// 価格の数字。OCR がカンマをピリオドに読むことがあるので両方受け付ける
const NUM = '([0-9]{1,3}(?:[,.][0-9]{3})+|[0-9]+)';
const PRICE_RES = [
  new RegExp('[¥\\\\]\\s*' + NUM, 'g'),
  new RegExp(NUM + '\\s*円', 'g'),
];
// 円も¥もない行は、行末の数字（2桁以上）を単価とみなす
const BARE_PRICE_RE = new RegExp('(?:^|[\\s:：\\t])' + NUM + '\\s*$');
// 合計などはグッズではないので、読み取ってもチェックを外しておく
const NOT_GOODS_RE = /合計|小計|総額|送料|手数料|ポイント|割引|クーポン|お支払/;
const CJK = '\u3000-\u30ff\u3400-\u9fff\uff01-\uff60';

function normalizeLine(line) {
  return line
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[￥]/g, '¥')
    .replace(/[，]/g, ',')
    .replace(/[\u3000\t]/g, ' ')
    // OCR は日本語の文字の間に空白を入れがちなので詰める
    .replace(new RegExp(`([${CJK}]) +(?=[${CJK}])`, 'g'), '$1')
    .replace(/ +/g, ' ')
    .trim();
}

function cleanName(s) {
  return s
    .replace(/[(（][^()（）]*税[^()（）]*[)）]/g, '')
    .replace(/税込み?|税抜き?|価格|単価|定価/g, '')
    .replace(/[(（]\s*[)）]/g, '')
    .replace(/^[\s・:：\-/／|｜→⇒_＿]+|[\s・:：\-/／|｜→⇒_＿]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPrice(line) {
  for (const re of PRICE_RES) {
    const hits = [...line.matchAll(re)];
    if (hits.length) {
      // 「定価1,800円 → 1,500円」のように複数あるときは最後を使う
      const last = hits[hits.length - 1];
      return { price: toInt(last[1]), name: cleanName(line.replace(re, ' ')) };
    }
  }
  const m = line.match(BARE_PRICE_RE);
  if (m && m[1].replace(/[,.]/g, '').length >= 2) {
    return { price: toInt(m[1]), name: cleanName(line.slice(0, m.index)) };
  }
  return null;
}

// 1行に「名前 価格」、または名前の行のすぐ後に価格だけの行、の両方に対応する
function parseGoods(text) {
  const found = [];
  let pendingName = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = normalizeLine(raw);
    if (!line) continue;
    const p = findPrice(line);
    if (!p) {
      pendingName = cleanName(line);
      continue;
    }
    const name = p.name || pendingName;
    pendingName = '';
    if (!name || !p.price) continue;
    found.push({ name, price: p.price, checked: !NOT_GOODS_RE.test(name) });
  }
  return found;
}

const bulkDialog = document.getElementById('bulk-dialog');
const bulkText = document.getElementById('bulk-text');
const bulkPreview = document.getElementById('bulk-preview');
const bulkAdd = document.getElementById('bulk-add');
const bulkStatus = document.getElementById('bulk-status');
let bulkEvent = null;
let bulkFound = [];

function setBulkStatus(msg) {
  bulkStatus.hidden = !msg;
  bulkStatus.textContent = msg || '';
}

function renderBulkPreview() {
  bulkFound = parseGoods(bulkText.value);
  if (!bulkText.value.trim()) {
    bulkPreview.innerHTML = '';
  } else if (!bulkFound.length) {
    bulkPreview.innerHTML = '<p class="bulk-empty">グッズ名と金額が見つかりませんでした。</p>';
  } else {
    bulkPreview.innerHTML = '<div class="bulk-list"></div>';
    const list = bulkPreview.firstChild;
    bulkFound.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'bulk-row' + (it.checked ? '' : ' off');
      row.innerHTML = `
        <input type="checkbox" class="check" ${it.checked ? 'checked' : ''} aria-label="追加する">
        <input class="name" value="${esc(it.name)}" aria-label="グッズ名">
        <input class="price" inputmode="numeric" value="${it.price}" aria-label="単価">
      `;
      row.querySelector('.check').onchange = (e) => {
        it.checked = e.target.checked;
        row.classList.toggle('off', !it.checked);
        updateBulkButton();
      };
      row.querySelector('.name').oninput = (e) => { it.name = e.target.value; };
      row.querySelector('.price').oninput = (e) => { it.price = toInt(e.target.value); };
      list.appendChild(row);
    });
  }
  updateBulkButton();
}

function updateBulkButton() {
  const n = bulkFound.filter((it) => it.checked).length;
  bulkAdd.disabled = n === 0;
  bulkAdd.textContent = n ? `${n}件追加` : '追加';
}

function openBulkDialog(ev) {
  bulkEvent = ev;
  bulkText.value = '';
  setBulkStatus('');
  renderBulkPreview();
  bulkDialog.showModal();
}

bulkText.oninput = renderBulkPreview;
document.getElementById('bulk-cancel').onclick = () => bulkDialog.close();

document.getElementById('bulk-form').onsubmit = (e) => {
  e.preventDefault();
  const ev = bulkEvent;
  const picked = bulkFound.filter((it) => it.checked && it.name.trim());
  if (!ev || !picked.length) return;
  for (const it of picked) {
    ev.items.push({ id: newId(), name: it.name.trim(), price: it.price, qty: 1, checked: true });
  }
  touch(ev);
  bulkDialog.close();
  renderEvent(ev);
};

// 画像の文字読み取りは Tesseract.js（無料のOCR）をブラウザ内で動かす。
// 初回だけライブラリと日本語データ（数MB）をダウンロードする。
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
let ocrWorkerPromise = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('読み込みに失敗しました'));
    document.head.appendChild(s);
  });
}

function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = (async () => {
      if (!window.Tesseract) await loadScript(TESSERACT_URL);
      return Tesseract.createWorker('jpn', 1, {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setBulkStatus(`読み取り中… ${Math.round(m.progress * 100)}%`);
          }
        },
      });
    })();
    ocrWorkerPromise.catch(() => { ocrWorkerPromise = null; });
  }
  return ocrWorkerPromise;
}

document.getElementById('bulk-image').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  setBulkStatus('準備中…（初回は少し時間がかかります）');
  bulkAdd.disabled = true;
  try {
    const worker = await getOcrWorker();
    setBulkStatus('読み取り中…');
    const { data } = await worker.recognize(file);
    const text = data.text.split('\n').map(normalizeLine).filter(Boolean).join('\n');
    bulkText.value = bulkText.value.trim() ? bulkText.value.trim() + '\n' + text : text;
    renderBulkPreview();
    setBulkStatus(bulkFound.length
      ? '読み取りました。名前や金額がずれていたら直してから追加してください。'
      : '金額を読み取れませんでした。下の文字を直すと候補が出ます。');
  } catch (err) {
    setBulkStatus('読み取れませんでした（通信できる場所でもう一度試してください）');
    updateBulkButton();
  }
};

// ---- イベントの作成・編集 ----

const dialog = document.getElementById('event-dialog');
const eventForm = document.getElementById('event-form');
let editing = null;

function openEventDialog(ev) {
  editing = ev;
  document.getElementById('event-dialog-title').textContent = ev ? 'イベントを編集' : '新しいイベント';
  eventForm.name.value = ev ? ev.name : '';
  eventForm.date.value = ev ? ev.date : today();
  eventForm.budget.value = ev ? ev.budget : '';
  eventForm.memo.value = ev ? ev.memo : '';
  document.getElementById('event-delete').hidden = !ev;
  dialog.showModal();
  if (!ev) eventForm.name.focus();
}

eventForm.onsubmit = (e) => {
  e.preventDefault();
  const values = {
    name: eventForm.name.value.trim(),
    date: eventForm.date.value || today(),
    budget: toInt(eventForm.budget.value),
    memo: eventForm.memo.value.trim(),
  };
  if (!values.name) return;

  if (editing) {
    Object.assign(editing, values);
    touch(editing);
    dialog.close();
    route();
  } else {
    const now = new Date().toISOString();
    const ev = {
      id: newId(), ...values, shipping: 0, fee: 0,
      status: 'shopping', items: [], createdAt: now, updatedAt: now,
    };
    events.push(ev);
    saveEvents();
    dialog.close();
    location.hash = '#/event/' + encodeURIComponent(ev.id);
  }
};

document.getElementById('event-cancel').onclick = () => dialog.close();

document.getElementById('event-delete').onclick = () => {
  if (!editing || !confirm(`「${editing.name}」を削除しますか？元に戻せません。`)) return;
  events = events.filter((x) => x !== editing);
  saveEvents();
  dialog.close();
  location.hash = '#/';
};

// ---- 履歴・集計 ----

function purchasedEvents() {
  return events
    .filter((ev) => ev.status === 'purchased')
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function sumTotals(list) {
  return list.reduce((sum, ev) => sum + calc(ev).total, 0);
}

function groupBy(list, keyOf) {
  const groups = new Map();
  for (const ev of list) {
    const key = keyOf(ev);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(ev);
  }
  return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}

function monthLabel(ym) {
  const [y, m] = ym.split('-');
  return `${y}年${Number(m)}月`;
}

function historyEventRows(list) {
  return list.map((ev) => {
    const { total, remain } = calc(ev);
    return `
      <a class="card hist-row" href="#/event/${encodeURIComponent(ev.id)}">
        <div class="hist-main">
          <span class="name">${esc(ev.name)}</span>
          <span class="amount">${yen(total)}</span>
        </div>
        <div class="meta">
          <span>${esc(ev.date)}</span>
          <span class="${remain < 0 ? 'over' : 'ok'}">
            ${remain < 0 ? `予算より${yen(-remain)}オーバー` : `予算より${yen(remain)}少なめ`}
          </span>
        </div>
      </a>`;
  }).join('');
}

function historyGroupRows(groups, labelOf, hrefOf) {
  const max = Math.max(...groups.map(([, list]) => sumTotals(list)), 1);
  return groups.map(([key, list]) => {
    const total = sumTotals(list);
    return `
      <a class="card hist-row" href="${hrefOf(key)}">
        <div class="hist-main">
          <span class="name">${labelOf(key)}</span>
          <span class="amount">${yen(total)}</span>
        </div>
        <div class="meta"><span>${list.length}件</span></div>
        <div class="bar thin"><span style="width:${(total / max) * 100}%"></span></div>
      </a>`;
  }).join('');
}

function periodSummary(label, list) {
  const total = sumTotals(list);
  const budget = list.reduce((sum, ev) => sum + ev.budget, 0);
  return `
    <div class="card period">
      <div class="total-label">${label}</div>
      <div class="period-total">${yen(total)}</div>
      <div class="meta">${list.length}件 ・ 予算の合計 ${yen(budget)}</div>
    </div>`;
}

function renderHistory(view, key) {
  document.title = '履歴 | グッズ計算';
  const all = purchasedEvents();
  let body;

  if (!all.length) {
    body = `<p class="empty">まだ購入済みのイベントがありません。<br>買い物画面で「購入確定」すると、ここに表示されます。</p>`;
  } else if (view === 'month' && key) {
    const list = all.filter((ev) => ev.date.startsWith(key));
    body = `
      <a class="back" href="#/history/month">‹ 月ごと</a>
      ${periodSummary(monthLabel(key) + 'の合計', list)}
      <div class="hist-list">${historyEventRows(list)}</div>`;
  } else if (view === 'year' && key) {
    const list = all.filter((ev) => ev.date.startsWith(key + '-'));
    const months = groupBy(list, (ev) => ev.date.slice(0, 7));
    body = `
      <a class="back" href="#/history/year">‹ 年ごと</a>
      ${periodSummary(key + '年の合計', list)}
      <div class="hist-list">
        ${historyGroupRows(months, monthLabel, (k) => '#/history/month/' + k)}
      </div>`;
  } else if (view === 'month') {
    const months = groupBy(all, (ev) => ev.date.slice(0, 7));
    body = `<div class="hist-list">
      ${historyGroupRows(months, monthLabel, (k) => '#/history/month/' + k)}
    </div>`;
  } else if (view === 'year') {
    const years = groupBy(all, (ev) => ev.date.slice(0, 4));
    body = `<div class="hist-list">
      ${historyGroupRows(years, (k) => k + '年', (k) => '#/history/year/' + k)}
    </div>`;
  } else {
    body = `
      ${periodSummary('これまでの合計', all)}
      <div class="hist-list">${historyEventRows(all)}</div>`;
  }

  const seg = (v, label) =>
    `<a href="#/history/${v}" class="${view === v ? 'active' : ''}">${label}</a>`;

  app.innerHTML = `
    <header class="topbar"><h1>履歴</h1></header>
    <nav class="segment">${seg('event', 'イベント')}${seg('month', '月')}${seg('year', '年')}</nav>
    ${body}
  `;
}

// ---- 設定（バックアップ） ----

function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.name || !Array.isArray(raw.items)) {
    throw new Error('形式が正しくありません');
  }
  const now = new Date().toISOString();
  return {
    id: String(raw.id),
    name: String(raw.name),
    date: /^\d{4}-\d{2}-\d{2}$/.test(raw.date) ? raw.date : today(),
    budget: toInt(raw.budget),
    shipping: toInt(raw.shipping),
    fee: toInt(raw.fee),
    memo: String(raw.memo ?? ''),
    status: raw.status === 'purchased' ? 'purchased' : 'shopping',
    items: raw.items.map((it) => ({
      id: String(it.id ?? newId()),
      name: String(it.name ?? ''),
      price: toInt(it.price),
      qty: Math.max(1, toInt(it.qty)),
      checked: it.checked !== false,
    })),
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
  };
}

function renderSettings() {
  document.title = '設定 | グッズ計算';
  app.innerHTML = `
    <header class="topbar"><h1>設定</h1></header>
    <section class="card settings">
      <h2>バックアップ</h2>
      <p class="note">
        データはこのスマホのブラウザの中だけに保存されています。
        ブラウザのデータを消すと消えてしまうので、ときどきファイルに書き出しておくと安心です。
      </p>
      <button class="primary" id="export">ファイルに書き出す（${events.length}件）</button>
      <label class="file-button">
        ファイルから読み込む
        <input type="file" id="import" accept="application/json,.json" hidden>
      </label>
      <p class="note">読み込むと、今のデータはファイルの内容に置き換わります。</p>
    </section>
  `;

  document.getElementById('export').onclick = () => {
    const data = { app: 'calc-buy-goods', version: 1, exportedAt: new Date().toISOString(), events };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `goods-backup-${today()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  document.getElementById('import').onchange = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let imported;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.events;
      if (!Array.isArray(list)) throw new Error('形式が正しくありません');
      imported = list.map(normalizeEvent);
    } catch (err) {
      alert('読み込めませんでした：' + err.message);
      return;
    }
    if (!confirm(`${imported.length}件のイベントを読み込みます。今の${events.length}件は置き換わります。よろしいですか？`)) return;
    events = imported;
    saveEvents();
    alert('読み込みました。');
    renderSettings();
  };
}

// ---- 起動 ----

route();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
