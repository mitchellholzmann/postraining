// ---------- Settings (adjust to match the real till) ----------
const OPERATOR = 'Opplæring';
const SIZES = [['Tall', 0], ['Grande', 5], ['Venti', 10]]; // name, surcharge
const EMPLOYEE_DISCOUNT = 30;            // % - placeholder
const DISCOUNTS = [10, 20, 50, 100];     // % options under "Rabatter"
const VAT = { takeaway: 15, eatin: 25 }; // Norwegian MVA on food & drink
const FIRST_ORDER_NO = 11849;
const STORE_KEY = 'training-pos-v1';

// ---------- State ----------
const newOrder = () => ({ lines: [], discount: null, takeaway: true });
const defaults = () => ({
  cat: 'coffee', orderNo: FIRST_ORDER_NO, qty: '', selected: null,
  order: newOrder(), sales: [], lastReceipt: null,
});

let state = defaults();
try {
  Object.assign(state, JSON.parse(localStorage.getItem(STORE_KEY)) || {});
} catch (e) { /* corrupted or unavailable storage: start fresh */ }

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
}

// ---------- Helpers ----------
const $ = (id) => document.getElementById(id);
const round2 = (n) => Math.round(n * 100) / 100;
const kr = (n) => round2(n).toFixed(2).replace('.', ',');

function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}

const svg = (body) =>
  `<svg viewBox="0 0 24 24" class="icon mx-auto mb-1" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const ICONS = {
  cup: svg('<path d="M7 7h10l-1.2 14H8.2z"/><path d="M6.5 4.5h11V7h-11z"/><path d="M8.5 2.5h7v2h-7z"/><circle cx="12" cy="13" r="2.2"/>'),
  muffin: svg('<path d="M6.5 13h11l-1.3 8H7.8z"/><path d="M10 13v8M14 13v8"/><path d="M6 13c-1.5-3 1-5 3-4.5C9.5 5.5 14 5 15 8c2.5-.5 4.5 2.5 3 5"/><circle cx="14" cy="4" r="1.2"/>'),
  croissant: svg('<path d="M3 17.500C3 10 7.500 6 12 6s9 4 9 11.500c-2-2.800-4.500-4-9-4s-7 1.200-9 4z"/><path d="M8.300 7l1.300 6.600M15.700 7l-1.300 6.600M5 10.500l1.800 4.200M19 10.500l-1.800 4.200"/>'),
  bottle: svg('<path d="M10 2.500h4V6l2 4v11.500H8V10l2-4z"/><path d="M10 6h4"/><circle cx="12" cy="15" r="2.200"/>'),
  plus: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7.500v9M7.500 12h9"/>'),
  scale: svg('<path d="M4 4h16l-3 4H7z"/><path d="M12 8v2"/><circle cx="12" cy="15" r="4.500"/><path d="M12 15l2-2"/><path d="M7 21.500h10"/>'),
  clipboard: svg('<rect x="6" y="4" width="13" height="17" rx="1.500"/><path d="M10 2.500h5V6h-5z"/><path d="M13 11h4M13 14h4M13 17h4"/><circle cx="8" cy="13" r="3.200" fill="#4a505c"/><path d="M8 11.500v3M6.500 13h3"/>'),
  dots: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12h.01M12 12h.01M16 12h.01" stroke-width="2.500"/>'),
  x: svg('<circle cx="12" cy="12" r="9"/><path d="M8.500 8.500l7 7M15.500 8.500l-7 7" stroke-width="2.200"/>'),
};

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ---------- Calculation ----------
function totals(order = state.order) {
  const subtotal = order.lines.reduce((s, l) => s + l.price * l.qty, 0);
  const pct = order.discount ? order.discount.pct : 0;
  const discount = round2(subtotal * pct / 100);
  const total = round2(subtotal - discount);
  const rate = order.takeaway ? VAT.takeaway : VAT.eatin;
  const vat = round2(total * rate / (100 + rate));
  const count = order.lines.reduce((s, l) => s + l.qty, 0);
  return { subtotal, discount, total, rate, vat, count };
}

// ---------- Order actions ----------
function tapItem(item) {
  const [name, price, , sized] = item;
  if (!sized) return addLine(name, price);
  openModal('Velg størrelse', [
    h('div', { class: 'text-gray-300 mb-3' }, name),
    h('div', { class: 'grid grid-cols-3 gap-2' }, SIZES.map(([size, extra]) =>
      h('button', {
        class: 'tile bg-[#b3a05a] py-6 text-lg font-semibold',
        onclick: () => { closeModal(); addLine(name, price + extra, size); },
      }, size, h('div', { class: 'text-base font-normal' }, String(price + extra))))),
  ]);
}

function addLine(name, price, size = '') {
  const qty = parseInt(state.qty, 10) || 1;
  const lines = state.order.lines;
  let line = lines.find((l) => l.name === name && l.size === size && l.price === price);
  if (line) line.qty += qty;
  else {
    line = { id: Date.now() + Math.random(), name, size, price, qty };
    lines.push(line);
  }
  state.qty = '';
  state.selected = line.id;
  render();
}

function changeQty(delta) {
  const lines = state.order.lines;
  const i = lines.findIndex((l) => l.id === state.selected);
  if (i < 0) return;
  lines[i].qty += delta;
  if (lines[i].qty <= 0) { lines.splice(i, 1); state.selected = null; }
  render();
}

function removeOrCancel() {
  const lines = state.order.lines;
  if (!lines.length) return;
  const i = lines.findIndex((l) => l.id === state.selected);
  if (i >= 0) {
    lines.splice(i, 1);
    state.selected = null;
    return render();
  }
  openModal('Avbryt hele salget?', [
    h('div', { class: 'grid grid-cols-2 gap-2' },
      h('button', { class: 'bg-[#b4533a] py-4', onclick: () => { state.order = newOrder(); closeModal(); render(); } }, 'Ja, avbryt salget'),
      h('button', { class: 'bg-[#4a505c] py-4', onclick: closeModal }, 'Nei')),
  ]);
}

function setDiscount(label, pct) {
  const d = state.order.discount;
  state.order.discount = !pct || (d && d.label === label) ? null : { label, pct };
  closeModal();
  render();
}

// ---------- Payment ----------
function pay(method) {
  const t = totals();
  if (!state.order.lines.length) return toast('Ingen artikler i salget');
  if (method !== 'Kontant') return finishSale(method, t.total);

  let entered = '';
  const draw = () => {
    const tendered = parseFloat(entered) || 0;
    const change = round2(tendered - t.total);
    const key = (label, fn, cls = 'bg-[#4a505c]') =>
      h('button', { class: cls + ' py-4 text-lg', onclick: () => { fn(); draw(); } }, label);
    openModal('Kontant', [
      h('div', { class: 'grid grid-cols-2 gap-x-4 text-lg mb-3' },
        h('div', {}, 'Å betale'), h('div', { class: 'text-right' }, kr(t.total)),
        h('div', {}, 'Mottatt'), h('div', { class: 'text-right font-semibold' }, kr(tendered)),
        h('div', {}, change >= 0 ? 'Veksel' : 'Gjenstår'),
        h('div', { class: 'text-right ' + (change >= 0 ? 'text-green-400' : 'text-red-400') }, kr(Math.abs(change)))),
      h('div', { class: 'grid grid-cols-4 gap-1 mb-1' },
        [50, 100, 200, 500].map((n) => key(String(n), () => { entered = String(n); }, 'bg-[#5f94bb]'))),
      h('div', { class: 'grid grid-cols-3 gap-1' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => key(d, () => { entered += d; })),
        key('C', () => { entered = ''; }, 'bg-[#b4533a]'),
        key('0', () => { entered += '0'; }),
        key('Eksakt', () => { entered = String(t.total); }, 'bg-[#5f94bb]')),
      h('button', {
        class: 'w-full mt-2 py-4 text-lg font-semibold ' + (change >= 0 ? 'bg-green-700' : 'bg-gray-600 opacity-50'),
        onclick: () => { if (change >= 0) finishSale('Kontant', tendered); },
      }, 'Fullfør'),
    ]);
  };
  draw();
}

function finishSale(method, tendered) {
  const t = totals();
  const sale = {
    no: state.orderNo, time: Date.now(), method, tendered,
    change: round2(tendered - t.total), order: state.order, ...t,
  };
  state.sales.push({ no: sale.no, time: sale.time, method, total: t.total, count: t.count });
  state.lastReceipt = sale;
  state.orderNo += 1;
  state.order = newOrder();
  state.selected = null;
  state.qty = '';
  render();
  showReceipt(sale, 'Betalt – ' + method);
}

function showReceipt(sale, title = 'Kvittering') {
  if (!sale) return toast('Ingen kvittering ennå');
  const row = (a, b, cls = '') => h('div', { class: 'flex justify-between ' + cls }, h('span', {}, a), h('span', {}, b));
  openModal(title, [
    h('div', { class: 'bg-white text-black p-4 font-mono text-sm max-h-[60vh] overflow-auto' },
      h('div', { class: 'text-center mb-2' }, 'TRENINGSKVITTERING', h('br'),
        '#' + sale.no + '  ' + new Date(sale.time).toLocaleString('no-NO')),
      sale.order.lines.map((l) => row(`${l.qty} x ${l.name}${l.size ? ' (' + l.size + ')' : ''}`, kr(l.price * l.qty))),
      h('hr', { class: 'my-2 border-black' }),
      sale.discount ? row(`${sale.order.discount.label} -${sale.order.discount.pct}%`, '-' + kr(sale.discount)) : null,
      row('TOTALT', kr(sale.total), 'font-bold text-base'),
      row(`Herav MVA ${sale.rate}% (${sale.order.takeaway ? 'takeaway' : 'spise her'})`, kr(sale.vat)),
      row(sale.method, kr(sale.tendered)),
      sale.method === 'Kontant' ? row('Veksel', kr(sale.change), 'font-bold') : null),
  ]);
}

// ---------- Other screens ----------
function showHourly() {
  const today = new Date().toDateString();
  const byHour = {};
  let sum = 0, n = 0;
  for (const s of state.sales) {
    const d = new Date(s.time);
    if (d.toDateString() !== today) continue;
    const hr = d.getHours();
    byHour[hr] = byHour[hr] || { n: 0, sum: 0 };
    byHour[hr].n += 1; byHour[hr].sum += s.total;
    n += 1; sum += s.total;
  }
  const hours = Object.keys(byHour).sort((a, b) => a - b);
  const cell = (t, cls = '') => h('div', { class: cls }, t);
  openModal('Timesalg i dag', [
    hours.length ? h('div', { class: 'grid grid-cols-3 gap-y-1' },
      cell('Time', 'text-gray-400'), cell('Salg', 'text-gray-400 text-right'), cell('Sum', 'text-gray-400 text-right'),
      hours.map((hr) => [
        cell(`${String(hr).padStart(2, '0')}:00`), cell(String(byHour[hr].n), 'text-right'), cell(kr(byHour[hr].sum), 'text-right')]),
      cell('Totalt', 'font-bold border-t pt-1'), cell(String(n), 'font-bold border-t pt-1 text-right'), cell(kr(sum), 'font-bold border-t pt-1 text-right'))
      : h('div', { class: 'text-gray-300' }, 'Ingen salg registrert i dag.'),
  ]);
}

function showSearch() {
  const all = CATEGORIES.flatMap((c) => MENU[c.id] || []);
  const list = h('div', { class: 'max-h-[50vh] overflow-auto mt-2 flex flex-col gap-0.5' });
  const fill = (q) => {
    const hits = all.filter((it) => it[0].toLowerCase().includes(q.toLowerCase())).slice(0, 40);
    list.replaceChildren(...hits.map((it) =>
      h('button', { class: 'flex justify-between px-3 py-2 bg-[#4a505c] text-left', onclick: () => { closeModal(); tapItem(it); } },
        h('span', {}, it[0]), h('span', {}, it[3] ? 'fra ' + it[1] : String(it[1])))));
  };
  const input = h('input', {
    class: 'w-full px-3 py-2 text-black', placeholder: 'Søk artikkel…',
    oninput: (e) => fill(e.target.value),
  });
  openModal('Søk artikkel', [input, list]);
  fill('');
  input.focus();
}

function showAdmin() {
  openModal('Admin', [
    h('div', { class: 'text-gray-300 mb-3' }, `Salg lagret: ${state.sales.length}. Neste ordrenr: ${state.orderNo}.`),
    h('button', {
      class: 'w-full bg-[#b4533a] py-4',
      onclick: () => { state = defaults(); closeModal(); render(); toast('Treningsdata nullstilt'); },
    }, 'Nullstill treningsdata'),
  ]);
}

function showDiscounts() {
  openModal('Rabatter', [
    h('div', { class: 'grid grid-cols-2 gap-2' },
      DISCOUNTS.map((p) => h('button', { class: 'bg-[#5f94bb] py-5 text-lg', onclick: () => setDiscount('Rabatt', p) }, p + ' %')),
      h('button', { class: 'col-span-2 bg-[#4a505c] py-4', onclick: () => setDiscount('', 0) }, 'Fjern rabatt')),
  ]);
}

// ---------- Modal ----------
function openModal(title, content) {
  const m = $('modal');
  m.replaceChildren(h('div', { class: 'bg-[#2a2e38] p-4 w-[440px] max-w-[92vw] shadow-2xl', onclick: (e) => e.stopPropagation() },
    h('div', { class: 'flex justify-between items-center mb-3' },
      h('div', { class: 'text-lg font-semibold' }, title),
      h('button', { class: 'px-3 py-1 bg-[#4a505c]', onclick: closeModal }, '✕')),
    content));
  m.classList.remove('hidden');
  m.classList.add('flex');
}
function closeModal() {
  $('modal').classList.add('hidden');
  $('modal').classList.remove('flex');
}
$('modal').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ---------- Rendering ----------
const clockText = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())} ${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
};

function renderTop() {
  const cell = (content, cls = 'bg-[#3a3f4b]', onclick) =>
    h('button', { class: `flex-1 flex items-center justify-center text-center leading-tight ${cls}`, ...(onclick ? { onclick } : {}) }, content);
  const o = state.order;
  $('topbar').replaceChildren(
    h('div', { class: 'w-14 bg-[#6b7280] flex items-center justify-center', html: '<svg viewBox="0 0 24 24" class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.500"><circle cx="11" cy="8" r="3.500"/><path d="M4 20c0-4 3-6 7-6M14 18h7m-2.500-2.500L21 18l-2.500 2.500"/></svg>' }),
    cell(OPERATOR),
    cell(''),
    cell(h('span', { id: 'clock' }, clockText())),
    cell(h('div', {}, String(state.orderNo), h('br'), String(totals().count))),
    cell('Timesalg', 'bg-[#3a3f4b]', showHourly),
    cell(o.takeaway ? 'Takeaway' : 'Spise her', o.takeaway ? 'bg-[#5d9aa8]' : 'bg-[#8a6d3b]', () => { o.takeaway = !o.takeaway; render(); }),
    cell('Søk artikkel', 'bg-[#4a7699]', showSearch),
    cell('Funksjoner', 'bg-[#8f7a52]', () => showReceipt(state.lastReceipt, 'Siste kvittering')),
    cell('Admin', 'bg-[#8f7a52]', showAdmin));
}

function renderCats() {
  $('cats').replaceChildren(...CATEGORIES.map((c) =>
    h('button', {
      class: 'tile flex flex-col items-center justify-center px-1 font-semibold leading-tight ' +
        (c.id === state.cat ? 'bg-[#2b1f24] outline outline-2 -outline-offset-2 outline-gray-200' : 'bg-[#4a505c]'),
      onclick: () => { state.cat = c.id; render(); },
    }, c.icon ? h('div', { html: ICONS[c.icon] }) : null, c.name)));
}

function renderItems() {
  const items = MENU[state.cat] || [];
  if (!items.length) {
    return $('items').replaceChildren(h('div', { class: 'col-span-6 row-span-2 flex items-center justify-center text-gray-500' },
      'Ingen artikler lagt inn for denne kategorien ennå (se menu.js).'));
  }
  $('items').replaceChildren(...items.map((it) =>
    h('button', {
      class: 'tile relative flex flex-col items-center justify-center px-1 font-semibold leading-tight text-center overflow-hidden',
      style: `background:${it[2]}`,
      onclick: () => tapItem(it),
    }, h('span', {}, it[0]), h('span', {}, it[3] ? '0' : it[1] + (it[4] ? '*' : '')),
    it[3] ? h('span', { class: 'absolute bottom-0.5 right-1 text-xs opacity-80' }, '≡') : null)));
}

function renderQty() {
  const digit = (d) => h('button', {
    class: 'flex-1 border-b border-gray-600 hover:text-white',
    onclick: () => { state.qty = (state.qty + d).replace(/^0+/, '').slice(0, 2); render(); },
  }, d + '.0');
  $('qty').replaceChildren(
    h('div', { class: 'py-2 text-center italic underline text-sm ' + (state.qty ? 'text-yellow-300 font-bold' : 'text-gray-200') }, 'x' + (state.qty || 1)),
    ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => digit(d)),
    h('button', { class: 'py-2 text-base hover:text-white', onclick: () => { state.qty = ''; render(); } }, '✕'));
}

function renderReceipt() {
  const o = state.order;
  const t = totals();
  const row = (a, b, cls = '') => h('div', { class: 'flex justify-between ' + cls }, h('span', {}, a), h('span', {}, b));
  const btn = (label, cls, onclick) => h('button', { class: `w-12 h-11 text-xl ${cls}`, onclick }, label);
  const list = h('div', { class: 'flex-1 overflow-auto text-sm' }, o.lines.map((l) =>
    h('button', {
      class: 'w-full flex gap-2 px-3 py-1.5 text-left border-b border-white/10 ' + (l.id === state.selected ? 'bg-[#5f94bb]/60' : ''),
      onclick: () => { state.selected = state.selected === l.id ? null : l.id; render(); },
    },
    h('span', { class: 'w-6 shrink-0' }, String(l.qty)),
    h('span', { class: 'flex-1' }, l.name, l.size ? h('div', { class: 'text-xs text-gray-300' }, `${l.size} · à ${kr(l.price)}`) : (l.qty > 1 ? h('div', { class: 'text-xs text-gray-300' }, 'à ' + kr(l.price)) : null)),
    h('span', {}, kr(l.price * l.qty)))));

  $('receipt').replaceChildren(
    h('div', { class: 'scallop' }),
    h('div', { class: 'px-3 py-2 text-sm tracking-wide' }, '🛍 ARTIKKEL'),
    list,
    h('div', { class: 'px-3 py-2 text-sm border-t border-white/20' },
      o.discount ? row('Sum', kr(t.subtotal), 'text-gray-300') : null,
      o.discount ? row(`${o.discount.label} -${o.discount.pct}%`, '-' + kr(t.discount), 'text-yellow-300') : null,
      row(`Herav MVA ${t.rate}%`, kr(t.vat), 'text-gray-300'),
      row('TOTALT', kr(t.total), 'text-2xl font-bold mt-1')),
    h('div', { class: 'flex gap-1 p-2 bg-[#2a2e38]' },
      btn('✕', 'bg-[#b98a94]', removeOrCancel),
      btn('−', 'bg-[#4a505c]', () => changeQty(-1)),
      btn('+', 'bg-[#4a505c]', () => changeQty(1)),
      h('div', { class: 'flex-1' }),
      btn('🖶', 'bg-[#4a505c]', () => showReceipt(state.lastReceipt, 'Siste kvittering'))));
  const sel = list.querySelector('.bg-\\[\\#5f94bb\\]\\/60');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function renderBottom() {
  const d = state.order.discount;
  const staff = d && d.label === 'Ansattrabatt';
  const cell = (label, cls, onclick) => h('button', { class: `flex-1 ${cls}`, onclick }, label);
  $('bottombar').replaceChildren(
    cell('Starbucks card', 'bg-[#5d9aa8]', () => toast('Starbucks card: ikke med i treningsversjonen')),
    cell('Ansattrabatt' + (staff ? ' ✓' : ''), staff ? 'bg-[#2f6f9c] font-bold' : 'bg-[#5f94bb]', () => setDiscount('Ansattrabatt', EMPLOYEE_DISCOUNT)),
    cell('Rabatter' + (d && !staff ? ' ✓' : ''), 'bg-[#3a3f4b]', showDiscounts),
    cell('Pay Starbucks card', 'bg-[#8b909b]', () => pay('Starbucks card')),
    cell('Kontant', 'bg-[#4f7a4f]', () => pay('Kontant')),
    cell('Kort', 'bg-[#3f6b8a]', () => pay('Kort')));
}

function render() {
  renderTop(); renderCats(); renderItems(); renderQty(); renderReceipt(); renderBottom();
  save();
}

render();
setInterval(() => { const c = $('clock'); if (c) c.textContent = clockText(); }, 10000);
