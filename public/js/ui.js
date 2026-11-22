import { icon } from './icons.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

// ---------- Toast ----------
let toastTimer;
export function toast(msg, { action, onAction, kind = 'ok', ms = 3200 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'err' ? 'alert' : 'check', 18)}<span>${esc(msg)}</span>${action ? `<button class="toast-act">${esc(action)}</button>` : ''}`;
  requestAnimationFrame(() => el.classList.add('show'));
  const btn = el.querySelector('.toast-act');
  if (btn) btn.onclick = () => { el.classList.remove('show'); onAction && onAction(); };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- Bottom sheet / modal ----------
export function openSheet({ title, body, footer = '', onMount, wide = false }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grab"></div>
      <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="ปิด">${icon('x', 20)}</button></div>
      <div class="sheet-body">${body}</div>
      ${footer ? `<div class="sheet-foot">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => {
    wrap.classList.remove('open');
    document.body.classList.remove('no-scroll');
    setTimeout(() => wrap.remove(), 220);
  };
  wrap.querySelector('.sheet-backdrop').onclick = close;
  wrap.querySelectorAll('[data-close]').forEach((b) => (b.onclick = close));
  onMount && onMount(wrap, close);
  return close;
}

export function confirmBox(message, { okText = 'ยืนยัน', danger = false } = {}) {
  return new Promise((resolve) => {
    const close = openSheet({
      title: 'ยืนยันการทำรายการ',
      body: `<p class="confirm-msg">${esc(message)}</p>`,
      footer: `<button class="btn btn-soft" data-no>ยกเลิก</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-yes>${esc(okText)}</button>`,
      onMount: (w, c) => {
        w.querySelector('[data-no]').onclick = () => { c(); resolve(false); };
        w.querySelector('[data-yes]').onclick = () => { c(); resolve(true); };
        w.querySelector('.sheet-backdrop').onclick = () => { c(); resolve(false); };
        w.querySelector('.icon-btn').onclick = () => { c(); resolve(false); };
      }
    });
    return close;
  });
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
};
