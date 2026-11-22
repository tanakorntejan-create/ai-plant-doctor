// หน้าสแกนพืช: ถ่ายรูป → AI วินิจฉัย → แสดงผลและสารที่แนะนำ
import { icon } from './icons.js';
import { esc, toast } from './ui.js';
import { pickImages, fileToDataUrl, makeThumb } from './camera.js';
import * as api from './api.js';
import { state, session, addHistory, addDraftItem } from './store.js';

const S = { images: [], crop: '', notes: '', phase: 'input', result: null, demo: false, fromHistory: false };
let root;
let msgTimer;

const STATUS = {
  healthy: ['พืชดูสุขภาพดี', 'chip'],
  disease: ['โรคพืช', 'chip red'],
  pest: ['แมลง/ไร ศัตรูพืช', 'chip amber'],
  nutrient: ['ขาดธาตุอาหาร', 'chip amber'],
  environment: ['สภาพแวดล้อม', 'chip blue'],
  unknown: ['ยังสรุปไม่ได้', 'chip gray']
};
const KIND = {
  chemical: ['สารเคมี', 'chip', 'flask'],
  biological: ['ชีวภาพ', 'chip blue', 'leaf'],
  nutrient: ['ธาตุอาหาร', 'chip amber', 'drop'],
  cultural: ['เขตกรรม', 'chip gray', 'clipboard']
};
const SEV = { low: 'เบา', medium: 'ปานกลาง', high: 'รุนแรง' };

export function mount(el, params = {}) {
  root = el;
  if (params.id) {
    const it = state.history.find((h) => h.id === params.id && h.type === 'diagnosis');
    if (it) {
      Object.assign(S, { phase: 'result', result: it.data, demo: !!it.demo, images: it.thumb ? [it.thumb] : [], fromHistory: true });
    }
  } else if (S.fromHistory) {
    resetState(); // ออกจากหน้าดูประวัติแล้วกลับมาแท็บสแกน
  }
  render();
}

function resetState() {
  Object.assign(S, { images: [], crop: '', notes: '', phase: 'input', result: null, demo: false, fromHistory: false });
}

function reset() {
  resetState();
  render();
}

function render() {
  clearInterval(msgTimer);
  if (S.phase === 'result') return renderResult();
  if (S.phase === 'loading') return renderLoading();
  renderInput();
}

// ---------------- หน้าเลือกรูป ----------------
function renderInput() {
  const has = S.images.length > 0;
  root.innerHTML = `
  <section class="page">
    <div class="hero">
      <svg class="hero-leaf" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9f99d"/><stop offset="1" stop-color="#4ade80"/></linearGradient></defs>
        <path d="M30 170C22 95 70 36 168 30c0 100-52 148-120 142" fill="url(#lg)" opacity=".95"/>
        <path d="M30 170c30-56 62-88 108-120" stroke="#0c3624" stroke-width="5" stroke-linecap="round"/>
        <path d="M70 128l22 4M92 104l26 2M112 80l20 0" stroke="#0c3624" stroke-width="3.5" stroke-linecap="round" opacity=".55"/>
      </svg>
      <span class="eyebrow">${icon('sparkle', 14)} AI PLANT DOCTOR</span>
      <h1>ถ่ายรูปพืช<br>รู้โรค <em>รู้ยา</em> ในไม่กี่วินาที</h1>
      <p>ให้ AI ช่วยวินิจฉัยโรค แนะนำสารออกฤทธิ์ที่เหมาะสม แล้วออกบิลให้เกษตรกรต่อได้เลย</p>
      <div class="hero-actions">
        <button class="btn btn-lime btn-lg" data-act="camera">${icon('camera', 22)} ถ่ายรูปพืช</button>
        <button class="btn btn-ghost-light btn-lg" data-act="gallery">${icon('image', 20)} เลือกรูป</button>
      </div>
    </div>

    <div class="pill-row">
      <span class="pill">${icon('leaf', 16)} วินิจฉัยโรค</span>
      <span class="pill">${icon('flask', 16)} แนะนำสารออกฤทธิ์</span>
      <span class="pill">${icon('bottle', 16)} สแกนฉลากยา</span>
      <span class="pill">${icon('receipt', 16)} ออกบิล / ใบกำกับภาษี</span>
    </div>

    ${has ? `
    <div class="card">
      <div class="card-title">${icon('image', 20)} รูปที่เลือก <span class="count">${S.images.length}/4</span></div>
      <div class="thumbs">
        ${S.images.map((src, i) => `<div class="thumb"><img src="${src}" alt="รูปที่ ${i + 1}"><button class="thumb-x" data-rm="${i}" aria-label="ลบรูป">${icon('x', 14)}</button><span class="thumb-n">${['ภาพรวม', 'ใบ/อาการ', 'ผล/ลำต้น', 'อื่น ๆ'][i] || i + 1}</span></div>`).join('')}
        ${S.images.length < 4 ? `<button class="thumb-add" data-act="gallery">${icon('plus', 24)}เพิ่มรูป</button>` : ''}
      </div>
      <details class="more" style="margin-top:16px" ${S.crop || S.notes ? 'open' : ''}>
        <summary>${icon('chevronDown', 18)} ใส่รายละเอียดเพิ่ม (ช่วยให้แม่นขึ้น)</summary>
        <div class="stack">
          <div class="field"><label for="crop">ชนิดพืช (ถ้ารู้)</label><input id="crop" type="text" placeholder="เช่น พริก, ทุเรียน, ข้าว" value="${esc(S.crop)}"></div>
          <div class="field"><label for="notes">อาการที่สังเกต</label><textarea id="notes" placeholder="เช่น เป็นมา 3 วัน ฝนตกติดกัน ใบเหลืองจากขอบใบ">${esc(S.notes)}</textarea></div>
        </div>
      </details>
    </div>
    <div class="sticky-cta"><button class="btn btn-primary btn-lg btn-block" data-act="analyze">${icon('scan', 22)} วิเคราะห์ด้วย AI</button></div>
    ` : `
    <div class="card">
      <div class="card-title">${icon('camera', 20)} ถ่ายอย่างไรให้แม่น</div>
      <div class="tips">
        <div class="tip"><div class="tip-ic">${icon('sun', 20)}</div><div><b>ถ่ายในที่แสงสว่าง</b><span>แสงธรรมชาติดีที่สุด หลีกเลี่ยงแฟลชและเงามืด</span></div></div>
        <div class="tip"><div class="tip-ic">${icon('scan', 20)}</div><div><b>ถ่ายใกล้ ๆ ให้เห็นแผลชัด</b><span>เล็งที่ใบ/ผลที่เป็น ถ่ายทั้งด้านหน้าและด้านหลังใบ</span></div></div>
        <div class="tip"><div class="tip-ic">${icon('image', 20)}</div><div><b>ถ่ายหลายมุม (สูงสุด 4 รูป)</b><span>ภาพรวมทั้งต้น + ใบ + ผล/ลำต้น ช่วยให้วินิจฉัยแม่นขึ้น</span></div></div>
      </div>
    </div>`}
  </section>`;
  bindInput();
}

function bindInput() {
  root.onclick = async (e) => {
    const b = e.target.closest('[data-act],[data-rm]');
    if (!b) return;
    if (b.dataset.rm !== undefined) { S.images.splice(+b.dataset.rm, 1); renderInput(); return; }
    const act = b.dataset.act;
    if (act === 'camera') pickImages({ capture: true }, onFiles);
    if (act === 'gallery') pickImages({ multiple: true }, onFiles);
    if (act === 'analyze') analyze();
  };
  const crop = root.querySelector('#crop');
  const notes = root.querySelector('#notes');
  if (crop) crop.oninput = () => (S.crop = crop.value);
  if (notes) notes.oninput = () => (S.notes = notes.value);
}

async function onFiles(files) {
  const room = 4 - S.images.length;
  if (room <= 0) { toast('เลือกได้สูงสุด 4 รูป', { kind: 'err' }); return; }
  try {
    for (const f of files.slice(0, room)) S.images.push(await fileToDataUrl(f));
    if (files.length > room) toast('เลือกได้สูงสุด 4 รูป — ใช้ 4 รูปแรก');
  } catch (e) {
    toast(e.message || 'อ่านรูปไม่สำเร็จ', { kind: 'err' });
  }
  renderInput();
  if (S.images.length) root.querySelector('.card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- กำลังวิเคราะห์ ----------------
function renderLoading() {
  const msgs = ['กำลังตรวจดูใบและแผล', 'เทียบกับอาการของโรคพืชที่พบบ่อย', 'คัดเลือกสารออกฤทธิ์ที่เหมาะสม', 'สรุปคำแนะนำให้เข้าใจง่าย'];
  root.innerHTML = `
  <section class="page" style="padding-top:14px">
    <div class="scan-stage">
      <img src="${S.images[0]}" alt="">
      <div class="scan-line"></div>
      <i class="corner tl"></i><i class="corner tr"></i><i class="corner bl"></i><i class="corner br"></i>
    </div>
    <div class="scan-msg"><b id="scanMsg" class="dots">${msgs[0]}</b><span>อย่าเพิ่งปิดหน้านี้ · ใช้เวลาประมาณ 10–20 วินาที</span></div>
  </section>`;
  let i = 0;
  const el = root.querySelector('#scanMsg');
  msgTimer = setInterval(() => { i = (i + 1) % msgs.length; if (el) el.textContent = msgs[i]; }, 2600);
}

async function analyze() {
  if (!S.images.length) return;
  S.phase = 'loading';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try {
    const { result, demo } = await api.diagnose({ images: S.images, crop: S.crop.trim(), notes: S.notes.trim() });
    S.result = result;
    S.demo = !!demo;
    S.fromHistory = false;
    if (result.is_plant !== false && !result.need_better_photo) {
      const thumb = await makeThumb(S.images[0]);
      const p = result.primary || {};
      const rec = addHistory({
        type: 'diagnosis', thumb, demo: !!demo, data: result,
        title: result.health_status === 'healthy' ? `${result.plant?.name_th || 'พืช'} — สุขภาพดี` : (p.name_th || 'ผลวินิจฉัย'),
        subtitle: result.plant?.name_th || ''
      });
      session.lastDiagnosis = rec;
    }
    S.phase = 'result';
  } catch (e) {
    S.phase = 'input';
    toast(e.message || 'วิเคราะห์ไม่สำเร็จ', { kind: 'err', ms: 5000 });
  }
  if (root.dataset.page !== 'scan') {
    if (S.phase === 'result') toast('วิเคราะห์เสร็จแล้ว', { action: 'ดูผล', onAction: () => (location.hash = '#/scan') });
    return;
  }
  render();
  window.scrollTo({ top: 0 });
}

// ---------------- ผลลัพธ์ ----------------
function ring(pct) {
  const r = 40, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Math.round(pct || 0)));
  return `<div class="ring"><svg width="92" height="92" viewBox="0 0 92 92"><circle class="bg" cx="46" cy="46" r="${r}" fill="none" stroke-width="9"/><circle class="fg" cx="46" cy="46" r="${r}" fill="none" stroke-width="9" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}"/></svg><div class="num"><div><b>${p}%</b><span>ความมั่นใจ</span></div></div></div>`;
}

function renderResult() {
  const r = S.result || {};
  const p = r.primary || {};
  const photo = S.images[0] || '';

  // รูปไม่พอ / ไม่ใช่พืช
  if (r.is_plant === false || (r.need_better_photo && !p.name_th)) {
    root.innerHTML = `
    <section class="page" style="padding-top:14px">
      <div class="empty card"><div class="ic-big">${icon('camera', 30)}</div>
        <b>${r.is_plant === false ? 'ไม่พบพืชในรูปนี้' : 'รูปยังไม่ชัดพอสำหรับวินิจฉัย'}</b>
        <p>${esc(r.need_better_photo || 'ลองถ่ายใหม่ให้เห็นใบหรือผลที่มีอาการชัดเจน ในที่แสงสว่าง')}</p>
        <button class="btn btn-primary" style="margin-top:16px" data-act="again">${icon('camera', 18)} ถ่ายรูปใหม่</button>
      </div>
    </section>`;
    root.onclick = (e) => { if (e.target.closest('[data-act="again"]')) reset(); };
    return;
  }

  const [stLabel, stCls] = STATUS[r.health_status] || STATUS.unknown;
  const healthy = r.health_status === 'healthy';
  const plant = r.plant || {};
  const title = healthy ? 'พืชดูสุขภาพดี' : (p.name_th || 'ผลวินิจฉัย');
  const treatments = r.treatments || [];

  root.innerHTML = `
  <section class="page" style="padding-top:12px">
    <div class="page-head" style="margin-top:2px">
      <button class="btn btn-ghost btn-sm" data-act="back">${icon('arrowLeft', 16)} ${S.fromHistory ? 'กลับ' : 'สแกนใหม่'}</button>
      <span class="chip ${S.demo ? 'amber' : ''}">${S.demo ? 'โหมดสาธิต' : icon('sparkle', 13) + ' วิเคราะห์โดย AI'}</span>
    </div>

    ${S.demo ? `<div class="banner warn">${icon('info', 18)}<div><b>โหมดสาธิต</b> — นี่คือข้อมูลตัวอย่าง ไม่ได้มาจากรูปของคุณ ใส่ <code>ANTHROPIC_API_KEY</code> ในไฟล์ <code>.env</code> เพื่อให้ AI วิเคราะห์รูปจริง</div></div>` : ''}

    <div class="res-photo" style="margin-top:12px">
      ${photo ? `<img src="${photo}" alt="รูปพืช">` : '<div style="height:180px"></div>'}
      <div class="res-badges"><span class="${stCls}">${stLabel}</span>${plant.growth_stage ? `<span class="chip gray" style="background:rgba(255,255,255,.85)">${esc(plant.growth_stage)}</span>` : ''}</div>
      <div class="res-photo-cap">
        <div class="plant">${icon('leaf', 14)} ${esc(plant.name_th || 'ไม่ทราบชนิดพืช')}${plant.scientific_name ? ` · <i>${esc(plant.scientific_name)}</i>` : ''}</div>
        <h2>${esc(title)}</h2>
        ${p.name_en && !healthy ? `<div class="en">${esc(p.name_en)}${p.pathogen ? ` · ${esc(p.pathogen)}` : ''}</div>` : ''}
      </div>
    </div>

    ${r.need_better_photo ? `<div class="banner info">${icon('camera', 18)}<div><b>ถ่ายเพิ่มจะแม่นขึ้น:</b> ${esc(r.need_better_photo)}</div></div>` : ''}

    ${!healthy ? `
    <div class="card">
      <div class="gauge-row">
        ${ring(p.confidence)}
        <div>
          <div class="sev-label">ความรุนแรง: ${SEV[p.severity] || '—'}</div>
          <div class="meter ${p.severity || ''}"><i></i><i></i><i></i></div>
          <div class="small muted" style="margin-top:8px">${p.category ? `ประเภท: ${({ fungal: 'เชื้อรา', bacterial: 'แบคทีเรีย', viral: 'ไวรัส', insect: 'แมลง', mite: 'ไร', nematode: 'ไส้เดือนฝอย', nutrient: 'ธาตุอาหาร', environment: 'สภาพแวดล้อม', other: 'อื่น ๆ' })[p.category] || esc(p.category)}` : ''}</div>
        </div>
      </div>
      ${p.symptoms_seen?.length ? `<div class="sec-label" style="margin-top:18px">อาการที่พบในรูป</div><ul class="list-dot" style="margin-top:10px">${p.symptoms_seen.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
      ${p.cause_and_spread ? `<div class="sec-label">สาเหตุและการแพร่ระบาด</div><p style="margin-top:8px;font-size:14.5px">${esc(p.cause_and_spread)}</p>` : ''}
    </div>` : `<div class="banner ok">${icon('shield', 18)}<div>ไม่พบอาการผิดปกติที่ชัดเจนในรูปนี้ แนะนำให้สังเกตต่อเนื่อง และถ่ายซ้ำหากเริ่มมีอาการ</div></div>`}

    ${r.differentials?.length ? `
    <div class="card">
      <div class="card-title">${icon('scan', 20)} อาจเป็นอย่างอื่นได้</div>
      ${r.differentials.map((d) => `<details class="acc"><summary>${esc(d.name_th)} ${d.confidence != null ? `<span class="chip gray">${Math.round(d.confidence)}%</span>` : ''}${icon('chevronDown', 18, 'chev')}</summary><div class="acc-body">${esc(d.how_to_tell || '')}</div></details>`).join('')}
    </div>` : ''}

    ${treatments.length ? `
    <div class="sec-label" style="margin-top:26px">${icon('flask', 15)} สารที่แนะนำ (${treatments.length})</div>
    ${treatments.map((t, i) => treatHTML(t, i)).join('')}
    <div class="banner warn">${icon('alert', 18)}<div>อัตราใช้และระยะเก็บเกี่ยวเป็นค่าทั่วไปเพื่อประกอบการตัดสินใจ <b>ให้ยึดตามฉลากของผลิตภัณฑ์ที่ขึ้นทะเบียนเป็นหลัก</b> และใช้เฉพาะกับพืชที่ฉลากอนุญาต</div></div>` : ''}

    ${r.field_actions?.length ? `<div class="card"><div class="card-title">${icon('clipboard', 20)} จัดการในแปลงทันที</div><ul class="list-dot list-check">${r.field_actions.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}
    ${r.prevention?.length ? `<div class="card"><div class="card-title">${icon('shield', 20)} ป้องกันไม่ให้กลับมา</div><ul class="list-dot list-check">${r.prevention.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>` : ''}

    ${r.safety_note ? `<div class="banner info">${icon('shield', 18)}<div>${esc(r.safety_note)}</div></div>` : ''}
    ${r.when_to_escalate ? `<div class="banner bad">${icon('phone', 18)}<div><b>ควรปรึกษาผู้เชี่ยวชาญเมื่อ:</b> ${esc(r.when_to_escalate)}</div></div>` : ''}

    <div class="form-actions" style="margin-top:18px">
      <button class="btn btn-soft" data-act="toLabel">${icon('bottle', 18)} สแกนฉลากยา</button>
      <button class="btn btn-primary" data-act="toBill">${icon('receipt', 18)} ไปออกบิล</button>
    </div>
  </section>`;

  root.onclick = (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') {
      if (S.fromHistory) { resetState(); location.hash = '#/history'; } else reset();
    }
    if (act === 'toLabel') { setLabelContext(null); location.hash = '#/label'; }
    if (act === 'toBill') location.hash = '#/bill';
    if (act === 'checkLabel') { setLabelContext(+b.dataset.i); location.hash = '#/label'; }
    if (act === 'addBill') {
      const t = (S.result.treatments || [])[+b.dataset.i];
      if (!t) return;
      const name = [t.active_th || t.active_en, t.formulation_hint].filter(Boolean).join(' ');
      addDraftItem({ name, sub: t.active_en || '', unit: t.kind === 'chemical' ? 'ขวด' : 'ชุด' });
      toast('เพิ่ม "' + name + '" ลงบิลแล้ว', { action: 'ไปที่บิล', onAction: () => (location.hash = '#/bill') });
    }
  };
}

function treatHTML(t, i) {
  const [kLabel, kCls, kIc] = KIND[t.kind] || KIND.chemical;
  const cell = (k, v, full) => (v ? `<div class="${full ? 'full' : ''}"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>` : '');
  return `
  <article class="treat ${esc(t.kind || '')}">
    <div class="treat-head">
      <div class="treat-num">${i + 1}</div>
      <div style="flex:1;min-width:0">
        <h4>${esc(t.active_th || t.active_en)}</h4>
        <div class="en">${esc(t.active_en || '')}${t.formulation_hint ? ` · ${esc(t.formulation_hint)}` : ''}</div>
        <div class="chips" style="margin-top:8px"><span class="${kCls}">${icon(kIc, 13)} ${kLabel}</span>${t.moa_group ? `<span class="chip dark">${esc(t.moa_group)}</span>` : ''}</div>
      </div>
    </div>
    <div class="kv">
      ${cell('อัตราใช้โดยทั่วไป', t.rate)}
      ${cell('ช่วงห่างการพ่น', t.interval_days)}
      ${cell('ระยะเก็บเกี่ยว (PHI)', t.phi_days)}
      ${cell('วิธีใช้', t.how_to_use, true)}
      ${cell('ข้อควรระวัง', t.precautions, true)}
    </div>
    ${t.example_products?.length ? `<div class="chips" style="margin-top:12px"><span class="small muted">ตัวอย่างชื่อการค้า (ตรวจสอบทะเบียนก่อนใช้):</span>${t.example_products.map((n) => `<span class="chip gray">${esc(n)}</span>`).join('')}</div>` : ''}
    <div class="treat-actions">
      ${t.kind === 'chemical' || t.kind === 'biological' ? `<button class="btn btn-soft btn-sm" data-act="checkLabel" data-i="${i}">${icon('bottle', 16)} สแกนฉลากเทียบ</button>` : ''}
      <button class="btn btn-primary btn-sm" data-act="addBill" data-i="${i}">${icon('plus', 16)} เพิ่มลงบิล</button>
    </div>
  </article>`;
}

function setLabelContext(i) {
  const r = S.result || {};
  const p = r.primary || {};
  const t = i != null ? (r.treatments || [])[i] : null;
  const parts = [`พืช: ${r.plant?.name_th || '-'}`, `ปัญหา: ${p.name_th || '-'}${p.name_en ? ` (${p.name_en})` : ''}`];
  if (t) parts.push(`กำลังตรวจสอบผลิตภัณฑ์ที่ควรมีสาร: ${t.active_en || t.active_th}`);
  session.labelContext = parts.join(' | ');
}
