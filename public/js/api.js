async function post(url, body) {
  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบว่ารัน "npm start" อยู่และอินเทอร์เน็ตใช้งานได้');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `เกิดข้อผิดพลาด (${res.status})`);
  return data;
}

export async function getStatus() {
  try {
    const r = await fetch('/api/status', { cache: 'no-store' });
    return await r.json();
  } catch {
    return { ai: false, model: '', offline: true };
  }
}

export const diagnose = (payload) => post('/api/diagnose', payload);
export const readLabel = (payload) => post('/api/label', payload);
