// ตัวแอปหลัก: header, แท็บล่าง, router แบบ hash
import { icon } from './icons.js';
import { session } from './store.js';
import { getStatus } from './api.js';
import { openShopSettings } from './settings.js';
import * as scan from './diagnose.js';
import * as label from './label.js';
import * as bill from './billing.js';
import * as history from './history.js';

const view = document.getElementById('view');
const topbar = document.getElementById('topbar');
const tabbar = document.getElementById('tabbar');

const TABS = [
  { id: 'scan', label: 'สแกนพืช', ic: 'leaf', mod: scan },
  { id: 'label', label: 'ฉลากยา', ic: 'bottle', mod: label },
  { id: 'bill', label: 'ออกบิล', ic: 'receipt', mod: bill, wide: true },
  { id: 'history', label: 'ประวัติ', ic: 'history', mod: history }
];

function renderChrome() {
  topbar.innerHTML = `
    <a class="brand" href="#/scan" aria-label="หมอพืช AI">
      <img class="brand-logo" src="icon.svg" alt="">
      <div><div class="brand-name">หมอพืช AI</div><div class="brand-sub">ถ่ายรูป · รู้โรค · ออกบิล</div></div>
    </a>
    <div class="top-right">
      <span class="status-pill ${session.ai ? '' : 'demo'}" id="statusPill">${session.ai ? 'AI พร้อมใช้' : 'โหมดสาธิต'}</span>
      <button class="icon-btn" id="btnShop" aria-label="ข้อมูลร้าน">${icon('settings', 20)}</button>
    </div>`;
  topbar.querySelector('#btnShop').onclick = () => openShopSettings(() => { if (view.dataset.page === 'bill') route(); });
  tabbar.innerHTML = TABS.map((t) => `<a class="tab" data-tab="${t.id}" href="#/${t.id}">${icon(t.ic, 22)}<span>${t.label}</span></a>`).join('');
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '') || 'scan';
  const [path, qs = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(qs));
  return { path, params };
}

function route() {
  const { path, params } = parseHash();
  const tab = TABS.find((t) => t.id === path) || TABS[0];
  view.onclick = view.oninput = view.onchange = null;
  view.dataset.page = tab.id;
  view.classList.toggle('wide', !!tab.wide);
  tabbar.querySelectorAll('.tab').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab.id));
  tab.mod.mount(view, params);
  window.scrollTo({ top: 0 });
}

async function init() {
  renderChrome();
  route();
  window.addEventListener('hashchange', route);
  const st = await getStatus();
  session.ai = !!st.ai;
  session.model = st.model || '';
  const pill = document.getElementById('statusPill');
  if (pill) {
    pill.textContent = st.offline ? 'ออฟไลน์' : session.ai ? 'AI พร้อมใช้' : 'โหมดสาธิต';
    pill.classList.toggle('demo', !session.ai);
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

init();
