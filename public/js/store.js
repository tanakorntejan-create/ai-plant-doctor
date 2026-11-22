// ที่เก็บข้อมูลในเครื่อง (localStorage): ข้อมูลร้าน ลูกค้า บิล ประวัติ ร่างบิล
import { uid } from './ui.js';
import { todayISO, beYYMM } from './thai.js';

const KEY = 'aiPlantDoctor.v1';

const defaults = () => ({
  shop: {
    name: '', address: '', taxId: '', branch: '00000', phone: '',
    vat: true, logo: '', payInfo: '', footer: 'ขอบคุณที่ใช้บริการ'
  },
  customers: [],
  bills: [],
  history: [],
  counters: {},
  draft: null
});

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return defaults();
    const d = defaults();
    return { ...d, ...s, shop: { ...d.shop, ...(s.shop || {}) } };
  } catch {
    return defaults();
  }
}

export const state = load();
export const session = { labelContext: '', ai: false, model: '' }; // ไม่บันทึกลงเครื่อง

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    // พื้นที่เต็ม: ตัดรูปย่อของประวัติเก่าออกแล้วลองใหม่
    state.history.forEach((h, i) => { if (i >= 8) h.thumb = ''; });
    state.history = state.history.slice(0, 60);
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; } catch { return false; }
  }
}

// ---------- ประวัติวินิจฉัย/สแกนฉลาก ----------
export function addHistory(item) {
  const rec = { id: uid(), ts: Date.now(), ...item };
  state.history.unshift(rec);
  state.history = state.history.slice(0, 60);
  save();
  return rec;
}

export function removeHistory(id) {
  state.history = state.history.filter((h) => h.id !== id);
  save();
}

// ---------- ร่างบิล ----------
export function newDraft(type = 'taxinv') {
  return {
    id: null, number: '', type, date: todayISO(),
    customer: { name: '', address: '', taxId: '', branch: '', phone: '', plot: '' },
    items: [], discount: 0, vatIncluded: false, payment: 'เงินสด', note: ''
  };
}

export function getDraft() {
  if (!state.draft) {
    state.draft = newDraft(state.shop.vat ? 'taxinv' : 'cash');
    save();
  }
  return state.draft;
}

export function addDraftItem({ name, sub = '', unit = 'ขวด', price = 0, qty = 1 }) {
  const d = getDraft();
  d.items.push({ id: uid(), name, sub, qty, unit, price, vat: state.shop.vat ? 'vat7' : 'exempt' });
  save();
  return d;
}

export function resetDraft() {
  state.draft = newDraft(state.shop.vat ? 'taxinv' : 'cash');
  save();
  return state.draft;
}

export const DOC_PREFIX = { delivery: 'DN', cash: 'CB', taxinv: 'TI', abbr: 'AB' };

export function peekNumber(type, date) {
  const ym = beYYMM(date);
  const k = `${type}-${ym}`;
  const n = (state.counters[k] || 0) + 1;
  return `${DOC_PREFIX[type]}${ym}-${String(n).padStart(4, '0')}`;
}

export function takeNumber(type, date) {
  const ym = beYYMM(date);
  const k = `${type}-${ym}`;
  state.counters[k] = (state.counters[k] || 0) + 1;
  return `${DOC_PREFIX[type]}${ym}-${String(state.counters[k]).padStart(4, '0')}`;
}
