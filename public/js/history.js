// หน้าประวัติ: ผลวินิจฉัย ฉลากที่สแกน และบิลที่ออกแล้ว
import { icon } from './icons.js';
import { esc, toast, confirmBox } from './ui.js';
import { state, removeHistory, save } from './store.js';
import { money, thaiDateTime, thaiDate } from './thai.js';
import { TYPES, loadBill } from './billing.js';

let filter = 'all';

export function mount(root) {
  const diag = state.history.filter((h) => h.type === 'diagnosis');
  const labels = state.history.filter((h) => h.type === 'label');
  const sales = state.bills.filter((b) => b.type !== 'delivery').reduce((s, b) => s + (b.total || 0), 0);

  const rows = [
    ...state.history.map((h) => ({ kind: h.type, ts: h.ts, h })),
    ...state.bills.map((b) => ({ kind: 'bill', ts: b.ts, b }))
  ].filter((r) => filter === 'all' || r.kind === filter).sort((a, b) => b.ts - a.ts);

  root.innerHTML = `
  <section class="page">
    <div class="page-head"><div><h2>ประวัติ</h2><p>งานทั้งหมดที่ทำไว้ในเครื่องนี้</p></div></div>
    <div class="stats">
      <div class="stat"><b>${diag.length}</b><span>วินิจฉัยแล้ว</span></div>
      <div class="stat"><b>${state.bills.length}</b><span>เอกสารที่ออก</span></div>
      <div class="stat hl"><b>฿${money(sales).replace(/\.00$/, '')}</b><span>ยอดขาย (ไม่รวมใบส่งของ)</span></div>
    </div>
    <div class="seg" id="seg">
      ${[['all', 'ทั้งหมด'], ['diagnosis', 'โรคพืช'], ['label', 'ฉลากยา'], ['bill', 'บิล']].map(([k, t]) => `<button data-f="${k}" class="${filter === k ? 'on' : ''}">${t}</button>`).join('')}
    </div>
    <div class="hist-list">
      ${rows.length ? rows.map(rowHTML).join('') : `<div class="empty card"><div class="ic-big">${icon('history', 30)}</div><b>ยังไม่มีรายการ</b><span class="small">เริ่มจากถ่ายรูปพืชในแท็บ "สแกนพืช"</span></div>`}
    </div>
  </section>`;

  root.onclick = async (e) => {
    const f = e.target.closest('[data-f]');
    if (f) { filter = f.dataset.f; mount(root); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const [kind, id] = del.dataset.del.split(':');
      if (!(await confirmBox('ลบรายการนี้? ย้อนกลับไม่ได้', { okText: 'ลบ', danger: true }))) return;
      if (kind === 'bill') { state.bills = state.bills.filter((b) => b.id !== id); save(); } else removeHistory(id);
      toast('ลบแล้ว');
      mount(root);
      return;
    }
    const it = e.target.closest('[data-open]');
    if (!it) return;
    const [kind, id] = it.dataset.open.split(':');
    if (kind === 'diagnosis') location.hash = `#/scan?id=${id}`;
    else if (kind === 'label') location.hash = `#/label?id=${id}`;
    else if (kind === 'bill' && loadBill(id)) location.hash = '#/bill';
  };
}

function rowHTML(r) {
  if (r.kind === 'bill') {
    const b = r.b, T = TYPES[b.type];
    return `<div class="hist" data-open="bill:${b.id}">
      <div class="hist-th">${icon(T.ic, 26)}</div>
      <div class="hist-main"><b>${esc(T.th)}</b><span>${esc(b.number)} · ${esc(b.customer)}</span><span>${thaiDate(b.date)}</span></div>
      <div class="hist-side"><b>฿${money(b.total)}</b><button class="icon-btn" style="width:32px;height:32px;margin-top:4px" data-del="bill:${b.id}" aria-label="ลบ">${icon('trash', 16)}</button></div>
    </div>`;
  }
  const h = r.h;
  const isDiag = h.type === 'diagnosis';
  return `<div class="hist" data-open="${h.type}:${h.id}">
    <div class="hist-th">${h.thumb ? `<img src="${h.thumb}" alt="">` : icon(isDiag ? 'leaf' : 'bottle', 26)}</div>
    <div class="hist-main"><b>${esc(h.title)}</b><span>${isDiag ? 'วินิจฉัยพืช' : 'สแกนฉลาก'}${h.subtitle ? ` · ${esc(h.subtitle)}` : ''}${h.demo ? ' · สาธิต' : ''}</span><span>${thaiDateTime(h.ts)}</span></div>
    <div class="hist-side"><button class="icon-btn" style="width:32px;height:32px" data-del="${h.type}:${h.id}" aria-label="ลบ">${icon('trash', 16)}</button></div>
  </div>`;
}
