// ถ่ายรูป/เลือกรูป และย่อรูปก่อนส่ง AI
export function pickImages({ capture = false, multiple = true } = {}, cb) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = multiple && !capture;
  if (capture) input.setAttribute('capture', 'environment');
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const files = [...input.files];
    input.remove();
    if (files.length) cb(files);
  });
  document.body.appendChild(input);
  input.click();
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* ลองวิธีสำรอง */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้ (ลองรูป JPG หรือ PNG)')); };
    img.src = url;
  });
}

export async function fileToDataUrl(file, max = 1568, quality = 0.82) {
  const bmp = await decode(file);
  const w0 = bmp.width || bmp.naturalWidth;
  const h0 = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w0 * scale));
  c.height = Math.max(1, Math.round(h0 * scale));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

export function makeThumb(dataUrl, max = 360, quality = 0.62) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s);
      c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve('');
    img.src = dataUrl;
  });
}
