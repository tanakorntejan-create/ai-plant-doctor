// ใบส่งของ / บิลเงินสด / ใบกำกับภาษี(+ใบเสร็จรับเงิน)
import { icon } from './icons.js';
import { esc, toast, confirmBox, uid } from './ui.js';
import { state, save, getDraft, resetDraft, takeNumber, peekNumber } from './store.js';
import { bahtText, thaiDate, money } from './thai.js';
import { openShopSettings } from './settings.js';

export const TYPES = {
  delivery: { th: 'ใบส่งของ', en: 'DELIVERY NOTE', ic: 'truck', sub: 'ส่งสินค้าให้ลูกค้า', tax: false },
  cash: { th: 'บิลเงินสด', en: 'CASH BILL', ic: 'banknote', sub: 'ขายเงินสด (ไม่แยก VAT)', tax: false },
  taxinv: { th: 'ใบกำกับภาษี / ใบเสร็จรับเงิน', en: 'TAX INVOICE / RECEIPT', ic: 'receipt', sub: 'แยก VAT ครบถ้วน', tax: true },
  abbr: { th: 'ใบกำกับภาษีอย่างย่อ', en: 'ABBREVIATED TAX INVOICE', ic: 'file', sub: 'ขายปลีก ไม่ต้องระบุผู้ซื้อ', tax: true }
};
const UNITS = ['ขวด', 'ถุง', 'กระสอบ', 'กล่อง', 'ซอง', 'แกลลอน', 'ลิตร', 'กก.', 'กรัม', 'ชุด', 'ชิ้น'];
const PAYMENTS = ['เงินสด', 'โอนเงิน/พร้อมเพย์', 'เช็ค', 'เครดิต (ค้างชำระ)'];

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

// ---------- คำนวณยอด (ฟังก์ชันล้วน) ----------
export function calc(d) {
  const taxDoc = !!TYPES[d.type]?.tax;
  const lines = d.items.map((it) => ({ ...it, amount: round2(num(it.qty) * num(it.price)) }));
  const gross = round2(lines.reduce((s, l) => s + l.amount, 0));
  const disc = round2(Math.min(Math.max(num(d.discount), 0), gross));
  const after = round2(gross - disc);
  if (!taxDoc) return { taxDoc, lines, gross, disc, after, exempt: 0, zero: 0, base: 0, vat: 0, total: after };

  const ratio = gross > 0 ? after / gross : 1;
  let vatPart = 0, exempt = 0, zero = 0;
  for (const l of lines) {
    const n = l.amount * ratio;
    if (l.vat === 'vat7') vatPart += n;
    else if (l.vat === 'zero') zero += n;
    else exempt += n;
  }
  exempt = round2(exempt);
  zero = round2(zero);
  let base, vat;
  if (d.vatIncluded) {
    const inc = round2(vatPart);
    base = round2(inc / 1.07);
    vat = round2(inc - base);
  } else {
    base = round2(vatPart);
    vat = round2(base * 0.07);
  }
  return { taxDoc, lines, gross, disc, after, exempt, zero, base, vat, total: round2(exempt + zero + base + vat) };
}

function checks(d, c) {
  const s = state.shop;
  const out = [];
  const T = TYPES[d.type];
  if (!s.name) out.push('ยังไม่ได้ตั้งชื่อร้าน — กด "ข้อมูลร้าน"');
  if (!s.address) out.push('ยังไม่ได้ใส่ที่อยู่ร้าน');
  if (T.tax) {
    if (!/^\d{13}$/.test(s.taxId)) out.push('เลขประจำตัวผู้เสียภาษีของร้านต้องมี 13 หลัก');
    if (d.type === 'taxinv') {
      if (!d.customer.name) out.push('ใบกำกับภาษีเต็มรูปต้องมีชื่อผู้ซื้อ');
      if (!d.customer.address) out.push('ใบกำกับภาษีเต็มรูปต้องมีที่อยู่ผู้ซื้อ');
    }
  }
  if (!d.items.length) out.push('ยังไม่มีรายการสินค้า');
  else if (d.items.some((i) => !(num(i.qty) > 0))) out.push('มีรายการที่จำนวนเป็น 0');
  else if (d.items.some((i) => !(num(i.price) > 0))) out.push('มีรายการที่ราคาเป็น 0 บาท');
  return out;
}

// ---------- state ของหน้า ----------
let root, d, tab = 'form';
let onResize;

export function mount(el) {
  root = el;
  d = getDraft();
  tab = 'form';
  renderAll();
  onResize = () => { if (root.dataset.page === 'bill') fit(); };
  window.removeEventListener('resize', window.__billResize);
  window.__billResize = onResize;
  window.addEventListener('resize', onResize);
}

export function loadBill(id) {
  const b = state.bills.find((x) => x.id === id);
  if (!b) return false;
  state.draft = JSON.parse(JSON.stringify(b.doc));
  state.draft.id = b.id;
  save();
  return true;
}

// ---------- วาดหน้าทั้งหมด ----------
function renderAll() {
  const T = TYPES[d.type];
  const c = calc(d);
  const recent = [...new Set(state.bills.flatMap((b) => b.doc.items.map((i) => i.name)).filter(Boolean))].slice(0, 6);

  root.innerHTML = `
  <section class="page">
    <div class="page-head">
      <div><h2>ออกบิล</h2><p>${d.number ? `เลขที่ ${esc(d.number)}` : 'ใบส่งของ · บิลเงินสด · ใบกำกับภาษี'}</p></div>
      <div class="head-actions">
        <button class="btn btn-soft btn-sm" data-act="shop">${icon('store', 16)} ข้อมูลร้าน</button>
        <button class="btn btn-ghost btn-sm" data-act="new">${icon('plus', 16)} ใหม่</button>
      </div>
    </div>
    <div class="seg mobile-only" id="seg">
      <button data-tab="form" class="${tab === 'form' ? 'on' : ''}">${icon('clipboard', 16)} กรอกข้อมูล</button>
      <button data-tab="preview" class="${tab === 'preview' ? 'on' : ''}">${icon('file', 16)} ตัวอย่างเอกสาร</button>
    </div>

    <div class="bill-layout" id="layout" data-tab="${tab}">
      <div class="bill-form">
        <div class="card">
          <div class="card-title">${icon('file', 20)} ประเภทเอกสาร</div>
          <div class="doc-types">
            ${Object.entries(TYPES).map(([k, t]) => `<button class="doc-type ${d.type === k ? 'on' : ''} ${t.tax && !state.shop.vat ? 'off' : ''}" data-type="${k}">${icon(t.ic, 22)}<div><b>${t.th}</b><span>${t.sub}</span></div></button>`).join('')}
          </div>
          <div class="grid2" style="margin-top:14px">
            <div class="field"><label for="f_date">วันที่ออกเอกสาร</label><input id="f_date" type="date" data-f="date" value="${esc(d.date)}"></div>
            <div class="field"><label for="f_pay">การชำระเงิน</label><select id="f_pay" data-f="payment">${PAYMENTS.map((p) => `<option ${d.payment === p ? 'selected' : ''}>${p}</option>`).join('')}</select></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">${icon('user', 20)} ข้อมูลลูกค้า (เกษตรกร)</div>
          <div class="stack">
            <div class="field"><label for="c_name">ชื่อ-นามสกุล / ชื่อสวน${d.type === 'abbr' ? ' (ไม่บังคับ)' : ''}</label><input id="c_name" type="text" list="custList" data-f="customer.name" value="${esc(d.customer.name)}" placeholder="เช่น นายสมชาย ใจดี" autocomplete="off"></div>
            <div class="field"><label for="c_addr">ที่อยู่</label><textarea id="c_addr" data-f="customer.address" rows="2" placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด">${esc(d.customer.address)}</textarea></div>
            <details class="more" ${d.customer.taxId || d.customer.phone || d.customer.plot ? 'open' : ''}>
              <summary>${icon('chevronDown', 18)} ข้อมูลเพิ่มเติม (เลขผู้เสียภาษี เบอร์โทร แปลง)</summary>
              <div class="stack">
                <div class="grid2">
                  <div class="field"><label for="c_tax">เลขประจำตัวผู้เสียภาษี/บัตร ปชช.</label><input id="c_tax" type="text" inputmode="numeric" maxlength="13" data-f="customer.taxId" value="${esc(d.customer.taxId)}"></div>
                  <div class="field"><label for="c_phone">เบอร์โทร</label><input id="c_phone" type="tel" data-f="customer.phone" value="${esc(d.customer.phone)}"></div>
                </div>
                <div class="field"><label for="c_plot">แปลง/พืชที่ปลูก</label><input id="c_plot" type="text" data-f="customer.plot" value="${esc(d.customer.plot)}" placeholder="เช่น สวนพริก 3 ไร่"></div>
              </div>
            </details>
          </div>
          <datalist id="custList">${state.customers.map((x) => `<option value="${esc(x.name)}">`).join('')}</datalist>
        </div>

        <div class="card">
          <div class="card-title">${icon('flask', 20)} รายการสินค้า <span class="count" id="itemCount">${d.items.length} รายการ</span></div>
          <div id="items">${d.items.map((it) => itemHTML(it, c.taxDoc)).join('') || `<div class="empty" style="padding:14px"><span class="small">ยังไม่มีรายการ — เพิ่มด้วยปุ่มด้านล่าง หรือกด "เพิ่มลงบิล" จากหน้าผลวินิจฉัย/สแกนฉลาก</span></div>`}</div>
          <button class="btn btn-soft btn-block" style="margin-top:12px" data-act="addItem">${icon('plus', 18)} เพิ่มรายการ</button>
          ${recent.length ? `<div class="chips" style="margin-top:12px"><span class="small muted">ขายบ่อย:</span>${recent.map((n) => `<button class="chip gray" data-quick="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div>` : ''}
          <datalist id="unitList">${UNITS.map((u) => `<option value="${u}">`).join('')}</datalist>
        </div>

        <div class="card">
          <div class="card-title">${icon('banknote', 20)} ส่วนลดและหมายเหตุ</div>
          <div class="stack">
            <div class="grid2">
              <div class="field"><label for="f_disc">ส่วนลดรวม (บาท)</label><input id="f_disc" type="number" inputmode="decimal" min="0" step="any" data-f="discount" value="${esc(d.discount || '')}" placeholder="0.00"></div>
              ${c.taxDoc ? `<div class="field"><label>ราคาที่กรอก</label><label class="switch" style="padding-top:8px"><input type="checkbox" data-f="vatIncluded" ${d.vatIncluded ? 'checked' : ''}><span>รวม VAT แล้ว</span></label></div>` : '<div></div>'}
            </div>
            <div class="field"><label for="f_note">หมายเหตุ (แสดงในเอกสาร)</label><textarea id="f_note" data-f="note" rows="2" placeholder="เช่น วิธีใช้ตามฉลาก / กำหนดชำระ">${esc(d.note)}</textarea></div>
          </div>
          ${c.taxDoc ? `<div class="banner info" style="margin-top:12px">${icon('info', 18)}<div>สินค้าเกษตรบางประเภท (เช่น ปุ๋ย ยาป้องกันกำจัดศัตรูพืชที่ใช้ในการเกษตร) อาจได้รับ<b>ยกเว้น VAT</b> — เลือกโหมดภาษีรายการให้ตรงกับที่ร้านใช้จริง และตรวจสอบกับนักบัญชี/สรรพากร</div></div>` : ''}
        </div>

        <div id="totalsBox"></div>
        <div id="checks" class="check-list"></div>

        <div class="form-actions">
          <button class="btn btn-primary btn-lg full" data-act="issue">${icon('check', 20)} ${d.number ? 'บันทึกการแก้ไข' : 'ออกเอกสาร'}</button>
          <button class="btn btn-soft" data-act="print">${icon('printer', 18)} พิมพ์ / PDF</button>
          <button class="btn btn-soft" data-act="share">${icon('share', 18)} แชร์สรุป</button>
        </div>
      </div>

      <div class="bill-preview">
        <div class="preview-actions">
          <button class="btn btn-primary" data-act="print">${icon('printer', 18)} พิมพ์ / PDF</button>
          <button class="btn btn-soft" data-act="share">${icon('share', 18)} แชร์</button>
        </div>
        <div class="paper-wrap" id="paperWrap"><div class="paper-scale" id="paperScale"></div></div>
      </div>
    </div>
  </section>`;

  refresh();
  bind();
}

function itemHTML(it, taxDoc) {
  return `
  <div class="item-card" data-id="${it.id}">
    <div class="item-top">
      <div class="field"><label>ชื่อสินค้า</label><input type="text" data-item="${it.id}" data-k="name" value="${esc(it.name)}" placeholder="ชื่อสินค้า / ผลิตภัณฑ์"></div>
      <button class="item-del" data-del="${it.id}" aria-label="ลบรายการ">${icon('trash', 18)}</button>
    </div>
    ${it.sub ? `<div class="item-sub">สารสำคัญ: ${esc(it.sub)}</div>` : ''}
    <div class="grid-item">
      <div class="field"><label>จำนวน</label><input type="number" inputmode="decimal" min="0" step="any" data-item="${it.id}" data-k="qty" value="${esc(it.qty)}"></div>
      <div class="field"><label>หน่วย</label><input type="text" list="unitList" data-item="${it.id}" data-k="unit" value="${esc(it.unit)}"></div>
      <div class="field"><label>ราคา/หน่วย</label><input type="number" inputmode="decimal" min="0" step="any" data-item="${it.id}" data-k="price" value="${esc(it.price || '')}" placeholder="0.00"></div>
    </div>
    ${taxDoc ? `<div class="field" style="margin-top:10px"><label>ภาษีของรายการนี้</label><select data-item="${it.id}" data-k="vat">
      <option value="vat7" ${it.vat === 'vat7' ? 'selected' : ''}>VAT 7%</option>
      <option value="exempt" ${it.vat === 'exempt' ? 'selected' : ''}>ยกเว้น VAT</option>
      <option value="zero" ${it.vat === 'zero' ? 'selected' : ''}>VAT อัตรา 0%</option></select></div>` : ''}
    <div class="line-total"><span>รวมรายการ</span><b data-line="${it.id}">฿0.00</b></div>
  </div>`;
}

// ---------- อัปเดตส่วนที่เปลี่ยนบ่อย (ไม่ทำให้ช่องกรอกเสียโฟกัส) ----------
function refresh() {
  const c = calc(d);
  c.lines.forEach((l) => {
    const el = root.querySelector(`[data-line="${l.id}"]`);
    if (el) el.textContent = '฿' + money(l.amount);
  });
  const cnt = root.querySelector('#itemCount');
  if (cnt) cnt.textContent = d.items.length + ' รายการ';

  const box = root.querySelector('#totalsBox');
  if (box) {
    box.innerHTML = `
    <div class="totals">
      <div class="tr"><span>รวมเงิน</span><span>${money(c.gross)}</span></div>
      ${c.disc > 0 ? `<div class="tr"><span>ส่วนลด</span><span>- ${money(c.disc)}</span></div>` : ''}
      ${c.taxDoc ? `
        ${c.exempt > 0 ? `<div class="tr"><span>มูลค่าสินค้ายกเว้นภาษี</span><span>${money(c.exempt)}</span></div>` : ''}
        ${c.zero > 0 ? `<div class="tr"><span>มูลค่าสินค้าอัตรา 0%</span><span>${money(c.zero)}</span></div>` : ''}
        <div class="tr"><span>มูลค่าสินค้าที่เสียภาษี</span><span>${money(c.base)}</span></div>
        <div class="tr"><span>ภาษีมูลค่าเพิ่ม 7%</span><span>${money(c.vat)}</span></div>` : ''}
      <div class="tr big"><span>รวมทั้งสิ้น</span><span>฿${money(c.total)}</span></div>
      <div class="words">(${bahtText(c.total)})</div>
    </div>`;
  }
  const errs = checks(d, c);
  const ck = root.querySelector('#checks');
  if (ck) {
    ck.innerHTML = errs.length
      ? errs.map((e) => `<div class="check">${icon('alert', 16)}<span>${esc(e)}</span></div>`).join('')
      : `<div class="check ok">${icon('check', 16)}<span>ข้อมูลครบถ้วน พร้อมออกเอกสาร</span></div>`;
  }
  const sc = root.querySelector('#paperScale');
  if (sc) { sc.innerHTML = paperHTML(c); fit(); }
}

function fit() {
  const wrap = root.querySelector('#paperWrap');
  const sc = root.querySelector('#paperScale');
  if (!wrap || !sc || !wrap.clientWidth) return;
  const s = Math.min(1, wrap.clientWidth / 794);
  sc.style.transform = `scale(${s})`;
  wrap.style.height = Math.ceil(sc.offsetHeight * s) + 'px';
}

// ---------- ตัวเอกสาร A4 ----------
function paperHTML(c) {
  const T = TYPES[d.type];
  const s = state.shop;
  const num_ = d.number || peekNumber(d.type, d.date);
  const branchTxt = s.branch === '00000' ? 'สำนักงานใหญ่' : `สาขาที่ ${s.branch}`;
  const blanks = Math.max(0, 9 - d.items.length);
  const buyerName = d.customer.name || (d.type === 'abbr' ? 'ลูกค้าทั่วไป' : '');
  const ph = (t) => `<span class="ph">${t}</span>`;
  const isDelivery = d.type === 'delivery';

  const rows = c.lines.map((l, i) => `
    <tr><td class="c">${i + 1}</td>
    <td>${esc(l.name) || ph('(ยังไม่ระบุชื่อสินค้า)')}${l.sub ? `<small>${esc(l.sub)}</small>` : ''}${c.taxDoc && l.vat !== 'vat7' ? `<small>${l.vat === 'zero' ? 'อัตราภาษี 0%' : 'สินค้ายกเว้นภาษีมูลค่าเพิ่ม'}</small>` : ''}</td>
    <td class="c">${esc(l.qty)}</td><td class="c">${esc(l.unit)}</td>
    <td class="r">${money(num(l.price))}</td><td class="r">${money(l.amount)}</td></tr>`).join('')
    + Array.from({ length: blanks }, () => '<tr class="blank"><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('');

  const sumRows = c.taxDoc ? `
      <div class="r"><span>รวมเป็นเงิน</span><span>${money(c.gross)}</span></div>
      ${c.disc > 0 ? `<div class="r"><span>หักส่วนลด</span><span>${money(c.disc)}</span></div><div class="r"><span>ราคาสินค้าหลังหักส่วนลด</span><span>${money(c.after)}</span></div>` : ''}
      ${c.exempt > 0 ? `<div class="r"><span>มูลค่าสินค้ายกเว้นภาษี</span><span>${money(c.exempt)}</span></div>` : ''}
      ${c.zero > 0 ? `<div class="r"><span>มูลค่าสินค้าอัตราภาษี 0%</span><span>${money(c.zero)}</span></div>` : ''}
      <div class="r"><span>มูลค่าสินค้าที่เสียภาษี</span><span>${money(c.base)}</span></div>
      <div class="r"><span>ภาษีมูลค่าเพิ่ม 7%</span><span>${money(c.vat)}</span></div>`
    : `
      <div class="r"><span>รวมเป็นเงิน</span><span>${money(c.gross)}</span></div>
      ${c.disc > 0 ? `<div class="r"><span>หักส่วนลด</span><span>${money(c.disc)}</span></div>` : ''}`;

  const signs = isDelivery
    ? ['ผู้รับสินค้า', 'ผู้ส่งสินค้า', 'ผู้ตรวจสอบ']
    : ['ผู้ซื้อ / ผู้รับสินค้า', 'ผู้รับเงิน', 'ผู้มีอำนาจลงนาม'];

  return `
  <div class="paper" id="paper">
    <div class="p-head">
      <div class="p-shop">
        ${s.logo ? `<img class="p-logo" src="${s.logo}" alt="">` : `<div class="p-logo-ph">${icon('leaf', 34)}</div>`}
        <div>
          <h1>${esc(s.name) || ph('ชื่อร้านของคุณ')}</h1>
          <p>${esc(s.address) || ph('ที่อยู่ร้าน')}</p>
          <p>${s.taxId ? `เลขประจำตัวผู้เสียภาษี ${esc(s.taxId)} · ${branchTxt}` : ph('เลขประจำตัวผู้เสียภาษี')}${s.phone ? ` · โทร ${esc(s.phone)}` : ''}</p>
        </div>
      </div>
      <div class="p-title"><h2>${T.th}</h2><div class="en">${T.en}</div><span class="orig">ต้นฉบับ</span></div>
    </div>

    <div class="p-meta">
      <div class="p-box">
        <h5>ลูกค้า / Customer</h5>
        <div class="big">${esc(buyerName) || ph('ชื่อลูกค้า')}</div>
        <div>${esc(d.customer.address) || (d.type === 'abbr' ? '' : ph('ที่อยู่ลูกค้า'))}</div>
        <div style="color:#555;font-size:12.5px">${d.customer.taxId ? `เลขประจำตัวผู้เสียภาษี ${esc(d.customer.taxId)}` : ''}${d.customer.taxId && d.customer.phone ? ' · ' : ''}${d.customer.phone ? `โทร ${esc(d.customer.phone)}` : ''}${d.customer.plot ? `${d.customer.taxId || d.customer.phone ? ' · ' : ''}แปลง: ${esc(d.customer.plot)}` : ''}</div>
      </div>
      <div class="p-box">
        <div class="row"><span style="color:#6b7d72">เลขที่</span><b>${esc(num_)}</b></div>
        <div class="row"><span style="color:#6b7d72">วันที่</span><b>${thaiDate(d.date)}</b></div>
        <div class="row"><span style="color:#6b7d72">ชำระโดย</span><b>${esc(d.payment)}</b></div>
      </div>
    </div>

    <table class="p-table">
      <thead><tr><th style="width:44px">ลำดับ</th><th>รายการสินค้า</th><th style="width:62px">จำนวน</th><th style="width:62px">หน่วย</th><th style="width:96px">ราคา/หน่วย</th><th style="width:106px">จำนวนเงิน</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="p-bottom">
      <div class="p-notes">
        ${d.note ? `<p><b>หมายเหตุ:</b> ${esc(d.note).replace(/\n/g, '<br>')}</p>` : ''}
        ${s.payInfo ? `<p><b>ช่องทางชำระเงิน:</b> ${esc(s.payInfo)}</p>` : ''}
        <p style="margin-top:6px;color:#666">${isDelivery ? 'ได้รับสินค้าตามรายการข้างต้นในสภาพเรียบร้อยถูกต้องแล้ว' : d.payment.startsWith('เครดิต') ? 'สินค้าตามรายการข้างต้นเป็นยอดค้างชำระ' : 'ได้รับชำระเงินตามจำนวนข้างต้นเรียบร้อยแล้ว'}</p>
        <p style="color:#888;font-size:11.5px;margin-top:6px">โปรดอ่านฉลากและปฏิบัติตามคำแนะนำบนผลิตภัณฑ์ก่อนใช้ทุกครั้ง</p>
      </div>
      <div class="p-sum">
        ${sumRows}
        <div class="r total"><span>จำนวนเงินรวมทั้งสิ้น</span><span>${money(c.total)}</span></div>
      </div>
    </div>
    <div class="p-words">( ${bahtText(c.total)} )</div>

    <div class="p-sign">${signs.map((t) => `<div>${t}<small>วันที่ ____ / ____ / ____</small></div>`).join('')}</div>
    <div class="p-foot">${s.footer ? `<b>${esc(s.footer)}</b>` : ''}</div>
  </div>`;
}

// ---------- events ----------
function setPath(obj, path, val) {
  const ks = path.split('.');
  const last = ks.pop();
  let o = obj;
  for (const k of ks) o = o[k];
  o[last] = val;
}

function bind() {
  root.oninput = (e) => {
    const t = e.target;
    const v = t.type === 'checkbox' ? t.checked : t.value;
    if (t.dataset.f) setPath(d, t.dataset.f, v);
    else if (t.dataset.item) {
      const it = d.items.find((i) => i.id === t.dataset.item);
      if (!it) return;
      it[t.dataset.k] = v;
    } else return;
    save();
    refresh();
  };

  root.onchange = (e) => {
    const t = e.target;
    // เลือกลูกค้าเก่า → เติมข้อมูลอัตโนมัติ
    if (t.dataset.f === 'customer.name') {
      const m = state.customers.find((x) => x.name === t.value);
      if (m) {
        Object.assign(d.customer, m);
        save();
        renderAll();
      }
    }
    // เปลี่ยนโหมด VAT รวม/ไม่รวม ต้องวาดใหม่ (ไม่มีผลกับโฟกัส)
  };

  root.onclick = async (e) => {
    const b = e.target.closest('[data-act],[data-type],[data-del],[data-tab],[data-quick]');
    if (!b) return;
    if (b.dataset.tab) {
      tab = b.dataset.tab;
      root.querySelector('#layout').dataset.tab = tab;
      root.querySelectorAll('#seg button').forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
      fit();
      window.scrollTo({ top: 0 });
      return;
    }
    if (b.dataset.type) {
      const k = b.dataset.type;
      if (TYPES[k].tax && !state.shop.vat) {
        toast('ร้านยังไม่ได้ตั้งเป็นผู้จดทะเบียน VAT — เปิดได้ที่ "ข้อมูลร้าน"', { kind: 'err', action: 'ตั้งค่า', onAction: () => openShopSettings(renderAll) });
        return;
      }
      if (d.type !== k) {
        d.type = k;
        d.number = '';
        if (TYPES[k].tax) d.items.forEach((i) => { if (!i.vat) i.vat = 'vat7'; });
        save();
        renderAll();
      }
      return;
    }
    if (b.dataset.del) {
      d.items = d.items.filter((i) => i.id !== b.dataset.del);
      save();
      renderAll();
      return;
    }
    if (b.dataset.quick) { addItem(b.dataset.quick); return; }
    const act = b.dataset.act;
    if (act === 'addItem') addItem('');
    if (act === 'shop') openShopSettings(renderAll);
    if (act === 'new') {
      if (d.items.length && !(await confirmBox('เริ่มเอกสารใหม่? ข้อมูลที่ยังไม่ได้ออกเอกสารจะหายไป', { okText: 'เริ่มใหม่' }))) return;
      d = resetDraft();
      renderAll();
      window.scrollTo({ top: 0 });
    }
    if (act === 'issue') issue();
    if (act === 'print') { if (issue(true)) setTimeout(() => window.print(), 120); }
    if (act === 'share') share();
  };
}

function addItem(name) {
  const last = d.items[d.items.length - 1];
  d.items.push({ id: uid(), name, sub: '', qty: 1, unit: last?.unit || 'ขวด', price: '', vat: state.shop.vat ? 'vat7' : 'exempt' });
  save();
  renderAll();
  const inputs = root.querySelectorAll('.item-card [data-k="name"]');
  const el = inputs[inputs.length - 1];
  if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

function issue(silent) {
  const c = calc(d);
  if (!d.items.length) { toast('เพิ่มรายการสินค้าอย่างน้อย 1 รายการ', { kind: 'err' }); return false; }
  if (!state.shop.name) {
    toast('ตั้งชื่อร้านก่อนออกเอกสาร', { kind: 'err', action: 'ตั้งค่า', onAction: () => openShopSettings(renderAll) });
    return false;
  }
  const isNew = !d.number;
  if (isNew) d.number = takeNumber(d.type, d.date);
  const id = d.id || uid();
  d.id = id;
  const rec = {
    id, number: d.number, type: d.type, date: d.date, ts: Date.now(),
    customer: d.customer.name || (d.type === 'abbr' ? 'ลูกค้าทั่วไป' : '—'),
    total: c.total, doc: JSON.parse(JSON.stringify(d))
  };
  const i = state.bills.findIndex((b) => b.id === id);
  if (i >= 0) state.bills[i] = rec; else state.bills.unshift(rec);

  const cu = d.customer;
  if (cu.name) {
    const j = state.customers.findIndex((x) => x.name === cu.name);
    if (j >= 0) state.customers[j] = { ...cu }; else state.customers.unshift({ ...cu });
    state.customers = state.customers.slice(0, 200);
  }
  save();
  if (!silent) toast(`${isNew ? 'ออกเอกสาร' : 'บันทึก'} ${d.number} แล้ว`, { action: 'ดูประวัติ', onAction: () => (location.hash = '#/history') });
  // อัปเดตหัวเลขที่ + ปุ่ม
  const sub = root.querySelector('.page-head p');
  if (sub) sub.textContent = `เลขที่ ${d.number}`;
  const btn = root.querySelector('[data-act="issue"]');
  if (btn) btn.innerHTML = `${icon('check', 20)} บันทึกการแก้ไข`;
  refresh();
  return true;
}

async function share() {
  const c = calc(d);
  const T = TYPES[d.type];
  const lines = c.lines.map((l, i) => `${i + 1}. ${l.name} ${l.qty} ${l.unit} x ${money(num(l.price))} = ${money(l.amount)}`);
  const text = [
    `${T.th} ${d.number || ''}`.trim(), state.shop.name, `วันที่ ${thaiDate(d.date)}`,
    d.customer.name ? `ลูกค้า: ${d.customer.name}` : '', '', ...lines, '',
    c.taxDoc ? `VAT 7%: ${money(c.vat)}` : '', `รวมทั้งสิ้น ${money(c.total)} บาท`, `(${bahtText(c.total)})`
  ].filter((x, i, a) => x !== '' || a[i - 1] !== '').join('\n');
  try {
    if (navigator.share) { await navigator.share({ title: T.th, text }); return; }
    await navigator.clipboard.writeText(text);
    toast('คัดลอกสรุปแล้ว นำไปวางใน LINE ได้เลย');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast('แชร์ไม่สำเร็จ', { kind: 'err' });
  }
}
