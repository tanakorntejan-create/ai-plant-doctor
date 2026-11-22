// ตัวช่วยภาษาไทย: อ่านจำนวนเงินเป็นตัวอักษร, วันที่ พ.ศ.
const D = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function readChunk(s) {
  // s = สตริงตัวเลขความยาว ≤ 6
  let out = '';
  const len = s.length;
  for (let i = 0; i < len; i++) {
    const d = +s[i];
    const pos = len - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด';
    else if (pos === 1 && d === 2) out += 'ยี่';
    else if (pos === 1 && d === 1) out += '';
    else out += D[d];
    out += P[pos];
  }
  return out;
}

function readInt(str) {
  str = str.replace(/^0+(?=\d)/, '');
  if (str === '0') return D[0];
  const chunks = [];
  while (str.length > 0) {
    chunks.unshift(str.slice(-6));
    str = str.slice(0, -6);
  }
  return chunks.map((c) => (/^0+$/.test(c) ? '' : readChunk(c.replace(/^0+(?=\d)/, '')))).join('ล้าน');
}

export function bahtText(n) {
  n = Math.round((Number(n) || 0) * 100) / 100;
  if (n < 0) return 'ลบ' + bahtText(-n);
  const [b, s = '00'] = n.toFixed(2).split('.');
  const baht = b === '0' && s !== '00' ? '' : readInt(b) + 'บาท';
  const satang = s === '00' ? 'ถ้วน' : readInt(String(+s)) + 'สตางค์';
  return baht + satang;
}

const MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

export function thaiDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return '';
  return `${+m[3]} ${MONTHS[+m[2] - 1]} ${+m[1] + 543}`;
}

export function thaiDateTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}${MONTHS[d.getMonth()].length > 4 ? '.' : ''} ${(d.getFullYear() + 543) % 100} · ${hh}:${mm} น.`;
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ปี พ.ศ. 2 หลัก + เดือน เช่น 6911
export function beYYMM(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(iso || todayISO());
  return String((+m[1] + 543) % 100).padStart(2, '0') + m[2];
}

export function money(n) {
  return (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
