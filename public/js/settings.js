// ตั้งค่าข้อมูลร้าน (ผู้ขาย) — ใช้ออกเอกสารทุกใบ
import { icon } from './icons.js';
import { esc, openSheet, toast, confirmBox } from './ui.js';
import { state, save } from './store.js';
import { fileToDataUrl } from './camera.js';
import { pickImages } from './camera.js';

export function openShopSettings(onSaved) {
  const s = state.shop;
  openSheet({
    title: 'ข้อมูลร้าน (ผู้ขาย)',
    wide: true,
    body: `
    <div class="stack">
      <div class="logo-pick">
        <div id="logoBox">${logoHTML(s.logo)}</div>
        <div style="display:grid;gap:6px">
          <button class="btn btn-soft btn-sm" id="pickLogo">${icon('image', 16)} เลือกโลโก้ร้าน</button>
          <button class="btn btn-ghost btn-sm" id="rmLogo" ${s.logo ? '' : 'hidden'}>ลบโลโก้</button>
        </div>
      </div>
      <div class="field"><label for="s_name">ชื่อร้าน / บริษัท</label><input id="s_name" type="text" value="${esc(s.name)}" placeholder="เช่น ร้านเกษตรสุขใจ"></div>
      <div class="field"><label for="s_addr">ที่อยู่</label><textarea id="s_addr" placeholder="เลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์">${esc(s.address)}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="s_tax">เลขประจำตัวผู้เสียภาษี (13 หลัก)</label><input id="s_tax" type="text" inputmode="numeric" maxlength="13" value="${esc(s.taxId)}" placeholder="0000000000000"></div>
        <div class="field"><label for="s_branch">สาขา (รหัส 5 หลัก)</label><input id="s_branch" type="text" inputmode="numeric" maxlength="5" value="${esc(s.branch)}" placeholder="00000 = สำนักงานใหญ่"></div>
      </div>
      <div class="field"><label for="s_phone">เบอร์โทร</label><input id="s_phone" type="tel" value="${esc(s.phone)}" placeholder="08x-xxx-xxxx"></div>
      <label class="switch"><input id="s_vat" type="checkbox" ${s.vat ? 'checked' : ''}><span>ร้านจดทะเบียนภาษีมูลค่าเพิ่ม (VAT) — ออกใบกำกับภาษีได้</span></label>
      <div class="field"><label for="s_pay">ช่องทางรับชำระ (แสดงท้ายเอกสาร)</label><input id="s_pay" type="text" value="${esc(s.payInfo)}" placeholder="เช่น พร้อมเพย์ 08x-xxx-xxxx / ธ.กสิกรไทย xxx-x-xxxxx-x"></div>
      <div class="field"><label for="s_foot">ข้อความท้ายเอกสาร</label><input id="s_foot" type="text" value="${esc(s.footer)}"></div>
      <div class="banner info" style="margin-top:0">${icon('info', 18)}<div>ข้อมูลทั้งหมดเก็บไว้ในเครื่องนี้เท่านั้น ไม่ถูกส่งขึ้นเซิร์ฟเวอร์</div></div>
      <button class="btn btn-ghost btn-sm" id="wipe" style="color:var(--red)">${icon('trash', 16)} ล้างข้อมูลทั้งหมดในเครื่อง</button>
    </div>`,
    footer: `<button class="btn btn-soft" data-close>ยกเลิก</button><button class="btn btn-primary" id="saveShop">${icon('check', 18)} บันทึก</button>`,
    onMount: (w, close) => {
      let logo = s.logo;
      const $ = (id) => w.querySelector(id);
      $('#pickLogo').onclick = () => pickImages({ multiple: false }, async (files) => {
        try { logo = await fileToDataUrl(files[0], 260, 0.9); $('#logoBox').innerHTML = logoHTML(logo); $('#rmLogo').hidden = false; }
        catch (e) { toast(e.message, { kind: 'err' }); }
      });
      $('#rmLogo').onclick = () => { logo = ''; $('#logoBox').innerHTML = logoHTML(''); $('#rmLogo').hidden = true; };
      $('#wipe').onclick = async () => {
        if (await confirmBox('ล้างข้อมูลร้าน ลูกค้า บิล และประวัติทั้งหมดในเครื่องนี้? ย้อนกลับไม่ได้', { okText: 'ล้างข้อมูล', danger: true })) {
          localStorage.removeItem('aiPlantDoctor.v1');
          location.hash = '#/scan';
          location.reload();
        }
      };
      $('#saveShop').onclick = () => {
        const tax = $('#s_tax').value.replace(/\D/g, '');
        Object.assign(state.shop, {
          name: $('#s_name').value.trim(), address: $('#s_addr').value.trim(), taxId: tax,
          branch: ($('#s_branch').value.replace(/\D/g, '') || '00000').padStart(5, '0'),
          phone: $('#s_phone').value.trim(), vat: $('#s_vat').checked, logo,
          payInfo: $('#s_pay').value.trim(), footer: $('#s_foot').value.trim()
        });
        if (!save()) toast('พื้นที่เก็บข้อมูลเต็ม ลองใช้โลโก้ที่เล็กลง', { kind: 'err' });
        else toast('บันทึกข้อมูลร้านแล้ว');
        close();
        onSaved && onSaved();
      };
    }
  });
}

function logoHTML(src) {
  return src ? `<img class="p-logo" src="${src}" alt="โลโก้">` : `<div class="p-logo-ph">${icon('store', 28)}</div>`;
}
