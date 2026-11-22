// หน้าสแกนฉลากยา/ผลิตภัณฑ์: อ่านชื่อสามัญ ชื่อการค้า ทะเบียน และเทียบกับโรคที่วินิจฉัย
import { icon } from './icons.js';
import { esc, toast } from './ui.js';
import { pickImages, fileToDataUrl, makeThumb } from './camera.js';
import * as api from './api.js';
import { state, session, addHistory, addDraftItem } from './store.js';

const L = { images: [], phase: 'input', result: null, demo: false, fromHistory: false };
let root;

const VERDICT = {
  good: ['เหมาะกับปัญหานี้', 'ok', 'check'],
  partial: ['ใช้ได้บางส่วน', 'warn', 'alert'],
  no: ['ไม่เหมาะกับปัญหานี้', 'bad', 'x'],
  unknown: ['ยังสรุปไม่ได้', 'info', 'info']
};

export function mount(el, params = {}) {
  root = el;
  if (params.id) {
    const it = state.history.find((h) => h.id === params.id && h.type === 'label');
    if (it) Object.assign(L, { phase: 'result', result: it.data, demo: !!it.demo, images: it.thumb ? [it.thumb] : [], fromHistory: true });
  } else if (L.fromHistory) {
    resetState();
  }
  render();
}

function resetState() {
  Object.assign(L, { images: [], phase: 'input', result: null, demo: false, fromHistory: false });
}

function render() {
  if (L.phase === 'loading') return renderLoading();
  if (L.phase === 'result') return renderResult();
  renderInput();
}

function renderInput() {
  const has = L.images.length > 0;
  const last = session.lastDiagnosis;
  root.innerHTML = `
  <section class="page">
    <div class="page-head"><div><h2>สแกนฉลากยา</h2><p>ถ่ายฉลากให้ AI อ่านชื่อสามัญ ชื่อการค้า และตรวจว่าเหมาะกับโรคหรือไม่</p></div></div>

    ${session.labelContext ? `
    <div class="banner ok" style="margin-top:12px">${icon('leaf', 18)}<div style="flex:1"><b>เทียบกับผลวินิจฉัย:</b> ${esc(session.labelContext.replace(/ \| /g, ' · '))}</div><button class="icon-btn" style="width:30px;height:30px" data-act="clearCtx" aria-label="ล้าง">${icon('x', 14)}</button></div>`
    : last ? `
    <div class="banner info" style="margin-top:12px">${icon('leaf', 18)}<div style="flex:1">ผลวินิจฉัยล่าสุด: <b>${esc(last.title)}</b><br><button class="btn btn-soft btn-sm" style="margin-top:8px" data-act="useLast">ใช้เทียบกับฉลากนี้</button></div></div>` : ''}

    <div class="card" style="text-align:center">
      ${has ? `
      <div class="thumbs">
        ${L.images.map((src, i) => `<div class="thumb"><img src="${src}" alt="ฉลากที่ ${i + 1}"><button class="thumb-x" data-rm="${i}" aria-label="ลบ">${icon('x', 14)}</button><span class="thumb-n">${['หน้า', 'หลัง', 'ข้าง'][i] || i + 1}</span></div>`).join('')}
        ${L.images.length < 3 ? `<button class="thumb-add" data-act="gallery">${icon('plus', 24)}เพิ่มรูป</button>` : ''}
      </div>` : `
      <div class="empty" style="padding:18px 6px 8px"><div class="ic-big">${icon('bottle', 30)}</div><b>ถ่ายฉลากด้านที่มีชื่อสาร</b><span class="small">ถ่ายให้เห็นตัวอักษรชัด ไม่สะท้อนแสง · ถ่ายได้สูงสุด 3 ด้าน</span></div>`}
      <div class="hero-actions" style="justify-content:center;margin-top:${has ? '16px' : '8px'}">
        <button class="btn btn-primary" data-act="camera">${icon('camera', 20)} ถ่ายฉลาก</button>
        <button class="btn btn-soft" data-act="gallery">${icon('image', 20)} เลือกรูป</button>
      </div>
    </div>
    ${has ? `<div class="sticky-cta"><button class="btn btn-primary btn-lg btn-block" data-act="read">${icon('scan', 22)} อ่านฉลากด้วย AI</button></div>` : ''}
  </section>`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-act],[data-rm]');
    if (!b) return;
    if (b.dataset.rm !== undefined) { L.images.splice(+b.dataset.rm, 1); renderInput(); return; }
    const a = b.dataset.act;
    if (a === 'camera') pickImages({ capture: true }, onFiles);
    if (a === 'gallery') pickImages({ multiple: true }, onFiles);
    if (a === 'read') read();
    if (a === 'clearCtx') { session.labelContext = ''; renderInput(); }
    if (a === 'useLast') {
      const r = last.data || {}, p = r.primary || {};
      session.labelContext = `พืช: ${r.plant?.name_th || '-'} | ปัญหา: ${p.name_th || '-'}${p.name_en ? ` (${p.name_en})` : ''}`;
      renderInput();
    }
  };
}

async function onFiles(files) {
  const room = 3 - L.images.length;
  if (room <= 0) { toast('เลือกได้สูงสุด 3 รูป', { kind: 'err' }); return; }
  try {
    for (const f of files.slice(0, room)) L.images.push(await fileToDataUrl(f, 1800, 0.86));
  } catch (e) {
    toast(e.message || 'อ่านรูปไม่สำเร็จ', { kind: 'err' });
  }
  renderInput();
}

function renderLoading() {
  root.innerHTML = `
  <section class="page" style="padding-top:14px">
    <div class="scan-stage"><img src="${L.images[0]}" alt=""><div class="scan-line"></div><i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i></div>
    <div class="scan-msg"><b class="dots">กำลังอ่านฉลาก</b><span>ตรวจชื่อสามัญ ความเข้มข้น และเลขทะเบียน</span></div>
  </section>`;
}

async function read() {
  if (!L.images.length) return;
  L.phase = 'loading';
  render();
  window.scrollTo({ top: 0 });
  try {
    const { result, demo } = await api.readLabel({ images: L.images, context: session.labelContext });
    L.result = result;
    L.demo = !!demo;
    L.fromHistory = false;
    if (result.is_label !== false && !result.need_better_photo) {
      const thumb = await makeThumb(L.images[0]);
      const ing = (result.ingredients || []).map((i) => i.common_th || i.common_en).filter(Boolean).join(', ');
      addHistory({ type: 'label', thumb, demo: !!demo, data: result, title: result.product_name || 'ฉลากผลิตภัณฑ์', subtitle: ing });
    }
    L.phase = 'result';
  } catch (e) {
    L.phase = 'input';
    toast(e.message || 'อ่านฉลากไม่สำเร็จ', { kind: 'err', ms: 5000 });
  }
  if (root.dataset.page !== 'label') {
    if (L.phase === 'result') toast('อ่านฉลากเสร็จแล้ว', { action: 'ดูผล', onAction: () => (location.hash = '#/label') });
    return;
  }
  render();
  window.scrollTo({ top: 0 });
}

function renderResult() {
  const r = L.result || {};
  if (r.is_label === false || (r.need_better_photo && !r.product_name && !(r.ingredients || []).length)) {
    root.innerHTML = `
    <section class="page" style="padding-top:14px"><div class="card empty"><div class="ic-big">${icon('camera', 30)}</div>
      <b>อ่านฉลากไม่ได้</b><p>${esc(r.need_better_photo || 'ลองถ่ายใหม่ให้เห็นตัวอักษรชัด ๆ ไม่สะท้อนแสง')}</p>
      <button class="btn btn-primary" style="margin-top:16px" data-act="again">ถ่ายใหม่</button></div></section>`;
    root.onclick = (e) => { if (e.target.closest('[data-act="again"]')) { resetState(); render(); } };
    return;
  }
  const ing = r.ingredients || [];
  const sv = r.suitability && VERDICT[r.suitability.verdict];
  const cell = (k, v, full) => (v ? `<div class="${full ? 'full' : ''}"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>` : '');

  root.innerHTML = `
  <section class="page" style="padding-top:12px">
    <div class="page-head" style="margin-top:2px">
      <button class="btn btn-ghost btn-sm" data-act="back">${icon('arrowLeft', 16)} ${L.fromHistory ? 'กลับ' : 'สแกนใหม่'}</button>
      <span class="chip ${L.demo ? 'amber' : ''}">${L.demo ? 'โหมดสาธิต' : icon('sparkle', 13) + ' อ่านโดย AI'}</span>
    </div>
    ${L.demo ? `<div class="banner warn">${icon('info', 18)}<div><b>โหมดสาธิต</b> — ข้อมูลตัวอย่าง ไม่ได้มาจากฉลากของคุณ</div></div>` : ''}

    <div class="card" style="margin-top:12px">
      <div style="display:flex;gap:14px;align-items:center">
        ${L.images[0] ? `<div class="hist-th" style="width:76px;height:76px"><img src="${L.images[0]}" alt=""></div>` : ''}
        <div style="min-width:0;flex:1">
          <div class="chips">${r.product_type ? `<span class="chip">${esc(r.product_type)}</span>` : ''}${r.moa_group ? `<span class="chip dark">${esc(r.moa_group)}</span>` : ''}</div>
          <h2 style="font-size:21px;font-weight:800;line-height:1.25;margin-top:6px">${esc(r.product_name || 'ไม่พบชื่อการค้า')}</h2>
          ${r.manufacturer ? `<div class="small muted">${esc(r.manufacturer)}</div>` : ''}
        </div>
      </div>
    </div>

    ${sv ? `<div class="banner ${sv[1]}">${icon(sv[2], 18)}<div><b>${sv[0]}</b><br>${esc(r.suitability.reason)}</div></div>` : ''}

    <div class="card">
      <div class="card-title">${icon('flask', 20)} สารออกฤทธิ์ (ชื่อสามัญ)</div>
      ${ing.length ? ing.map((i) => `
        <div class="treat" style="margin-top:8px;padding:12px 14px 12px 18px">
          <div style="font-weight:800;font-size:16.5px">${esc(i.common_th || i.common_en)} ${i.concentration ? `<span class="chip">${esc(i.concentration)}</span>` : ''}</div>
          <div class="small muted">${esc(i.common_en || '')}</div>
        </div>`).join('') : '<p class="muted">ไม่พบข้อมูลสารออกฤทธิ์ในรูป</p>'}
      <div class="kv">
        ${cell('สูตรผลิตภัณฑ์', r.formulation)}
        ${cell('ปริมาณบรรจุ', r.net_content)}
        ${cell('เลขทะเบียนวัตถุอันตราย', r.registration_no, true)}
        ${cell('อัตราใช้ตามฉลาก', r.label_rate, true)}
        ${cell('ระยะเก็บเกี่ยว (PHI)', r.phi)}
      </div>
    </div>

    ${r.target_crops_pests?.length ? `<div class="card"><div class="card-title">${icon('leaf', 20)} พืช/ศัตรูพืชที่ฉลากระบุ</div><div class="chips">${r.target_crops_pests.map((t) => `<span class="chip gray">${esc(t)}</span>`).join('')}</div></div>` : ''}
    ${r.hazard_warnings?.length ? `<div class="card"><div class="card-title">${icon('alert', 20)} คำเตือนความปลอดภัย</div><ul class="list-dot">${r.hazard_warnings.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    ${r.unreadable_fields?.length ? `<div class="banner info">${icon('info', 18)}<div>ช่องที่อ่านไม่ชัดและไม่ได้เดา: ${r.unreadable_fields.map(esc).join(', ')} — ลองถ่ายด้านอื่นของฉลากเพิ่ม</div></div>` : ''}
    <div class="banner warn">${icon('shield', 18)}<div>ตรวจเลขทะเบียนและอัตราใช้กับฉลากจริงก่อนใช้งานเสมอ AI อาจอ่านผิดพลาดได้</div></div>

    <div class="form-actions" style="margin-top:18px">
      <button class="btn btn-soft" data-act="again">${icon('camera', 18)} สแกนอีกขวด</button>
      <button class="btn btn-primary" data-act="addBill">${icon('plus', 18)} เพิ่มลงบิล</button>
    </div>
  </section>`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const a = b.dataset.act;
    if (a === 'back') { if (L.fromHistory) { resetState(); location.hash = '#/history'; } else { resetState(); render(); } }
    if (a === 'again') { resetState(); render(); }
    if (a === 'addBill') {
      const name = [r.product_name, ing[0]?.concentration && !String(r.product_name).includes(ing[0].concentration) ? ing[0].concentration : ''].filter(Boolean).join(' ') || 'ผลิตภัณฑ์';
      addDraftItem({ name, sub: ing.map((i) => i.common_en || i.common_th).filter(Boolean).join(', '), unit: 'ขวด' });
      toast('เพิ่ม "' + name + '" ลงบิลแล้ว', { action: 'ไปที่บิล', onAction: () => (location.hash = '#/bill') });
    }
  };
}
