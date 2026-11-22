// AI Plant Doctor — เซิร์ฟเวอร์เล็ก ๆ (ไม่มี dependency)
// - เสิร์ฟไฟล์หน้าเว็บในโฟลเดอร์ public/
// - เป็นตัวกลางเรียก Anthropic Messages API (ซ่อน API key ไว้หลังบ้าน)
// - ถ้าไม่มี ANTHROPIC_API_KEY จะส่งข้อมูล "โหมดสาธิต" กลับไปแทน

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- โหลด .env แบบง่าย ๆ ----------
function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.MODEL || 'claude-sonnet-5-5';
const API_KEY = (process.env.ANTHROPIC_API_KEY || '').trim();
const HAS_KEY = API_KEY.length > 10 && !API_KEY.includes('xxxxxxxx');
const MAX_BODY = 30 * 1024 * 1024;

// ---------- Prompt และ Schema ----------
const DIAG_SYSTEM = `คุณคือ "หมอพืช AI" นักโรคพืชและนักวิชาการเกษตรผู้เชี่ยวชาญสภาพการเกษตรในประเทศไทย
งานของคุณ: ดูรูปถ่ายพืชแล้ววินิจฉัยโรค/แมลงศัตรูพืช/อาการขาดธาตุอาหาร/ความเสียหายจากสภาพแวดล้อม แล้วแนะนำ "สารออกฤทธิ์ (ชื่อสามัญ)" ที่ใช้จัดการได้ พร้อมวิธีใช้

หลักการสำคัญ:
- ตอบเป็นภาษาไทยที่เกษตรกรอ่านเข้าใจง่าย ชื่อสามัญของสารเขียนทั้งไทยและอังกฤษ
- ประเมินความมั่นใจ (0-100) ตามหลักฐานในรูปจริง ๆ อย่าเกินจริง หากรูปไม่ชัด/ไม่ใช่พืช/ดูไม่ออก ให้ตั้ง need_better_photo และบอกวิธีถ่ายใหม่ (เช่น ถ่ายใบด้านหน้า-หลัง ถ่ายใกล้ ๆ แสงธรรมชาติ)
- ถ้าพืชดูสุขภาพดี ให้ health_status = healthy และไม่ต้องแนะนำสารเคมี
- แนะนำสารที่เหมาะกับสาเหตุจริง: เชื้อรา→สารป้องกันกำจัดโรคพืช, แบคทีเรีย→คอปเปอร์/สารปฏิชีวนะที่อนุญาตเท่านั้น, ไวรัส→ไม่มียารักษาโดยตรง เน้นกำจัดแมลงพาหะและทำลายต้นที่เป็นโรค, แมลง/ไร→สารฆ่าแมลง/ไร, ขาดธาตุ→ปุ๋ย/ธาตุอาหารเสริม
- เรียงลำดับการแนะนำให้มีทางเลือกที่ปลอดภัยกว่า/ชีวภาพ/วิธีเขตกรรมด้วย และแนะนำหมุนเวียนสารต่างกลุ่มกลไก (FRAC/IRAC) เพื่อลดการดื้อยา
- ห้ามแนะนำสารที่ถูกห้ามใช้ในประเทศไทย (เช่น พาราควอต คลอร์ไพริฟอส คาร์โบฟูราน) และห้ามแนะนำสารสำหรับ "ยาปฏิชีวนะในพืชอาหาร" เกินกว่าที่กฎหมายไทยอนุญาต
- ห้ามแต่งเลขทะเบียน ห้ามเดาชื่อการค้า: field example_products ให้ใส่เฉพาะชื่อการค้าที่คุณมั่นใจจริง ๆ ว่ามีขายในไทย ถ้าไม่มั่นใจให้เว้นว่าง
- อัตราใช้/ระยะเก็บเกี่ยว (PHI) ให้เป็นค่าโดยทั่วไป และต้องย้ำว่า "ยึดตามฉลากผลิตภัณฑ์ที่ขึ้นทะเบียนเป็นหลัก"
- อย่าให้คำแนะนำที่อันตราย (เช่น ผสมสารเอง เกินอัตรา ใช้ภาชนะอาหารผสมยา)
เรียกใช้เครื่องมือ report_diagnosis เพื่อส่งผลลัพธ์เท่านั้น`;

const DIAG_TOOL = {
  name: 'report_diagnosis',
  description: 'ส่งผลการวินิจฉัยพืชจากรูปถ่าย',
  input_schema: {
    type: 'object',
    properties: {
      is_plant: { type: 'boolean', description: 'รูปนี้มีพืชให้วินิจฉัยได้หรือไม่' },
      need_better_photo: { type: 'string', description: 'ถ้ารูปไม่พอ บอกวิธีถ่ายใหม่ (ว่างถ้ารูปพอ)' },
      plant: {
        type: 'object',
        properties: {
          name_th: { type: 'string' },
          scientific_name: { type: 'string' },
          growth_stage: { type: 'string', description: 'ระยะการเจริญเติบโตที่เห็น เช่น ออกดอก ติดผล' },
          confidence: { type: 'number' }
        },
        required: ['name_th']
      },
      health_status: { type: 'string', enum: ['healthy', 'disease', 'pest', 'nutrient', 'environment', 'unknown'] },
      primary: {
        type: 'object',
        description: 'ปัญหาหลักที่น่าจะเป็นที่สุด',
        properties: {
          name_th: { type: 'string' },
          name_en: { type: 'string' },
          pathogen: { type: 'string', description: 'เชื้อสาเหตุ/ศัตรูพืช เช่น Colletotrichum spp.' },
          category: { type: 'string', enum: ['fungal', 'bacterial', 'viral', 'insect', 'mite', 'nematode', 'nutrient', 'environment', 'other'] },
          confidence: { type: 'number', description: '0-100' },
          severity: { type: 'string', enum: ['low', 'medium', 'high'] },
          symptoms_seen: { type: 'array', items: { type: 'string' }, description: 'อาการที่เห็นจริงในรูป' },
          cause_and_spread: { type: 'string', description: 'สาเหตุ สภาพที่ทำให้เกิด และการแพร่ระบาด' }
        },
        required: ['name_th', 'confidence', 'severity']
      },
      differentials: {
        type: 'array',
        description: 'ปัญหาอื่นที่เป็นไปได้',
        items: {
          type: 'object',
          properties: {
            name_th: { type: 'string' },
            confidence: { type: 'number' },
            how_to_tell: { type: 'string', description: 'จุดสังเกตที่ช่วยแยกจากปัญหาหลัก' }
          },
          required: ['name_th']
        }
      },
      treatments: {
        type: 'array',
        description: 'สารออกฤทธิ์/วิธีที่แนะนำ เรียงจากเหมาะสุด',
        items: {
          type: 'object',
          properties: {
            active_th: { type: 'string', description: 'ชื่อสามัญภาษาไทย เช่น อะซอกซีสโตรบิน' },
            active_en: { type: 'string', description: 'ชื่อสามัญภาษาอังกฤษ เช่น azoxystrobin' },
            kind: { type: 'string', enum: ['chemical', 'biological', 'nutrient', 'cultural'] },
            moa_group: { type: 'string', description: 'กลุ่มกลไก FRAC/IRAC เช่น FRAC 11' },
            formulation_hint: { type: 'string', description: 'สูตรที่พบทั่วไป เช่น 25% SC' },
            rate: { type: 'string', description: 'อัตราใช้โดยทั่วไป เช่น 20-30 มล./น้ำ 20 ลิตร' },
            how_to_use: { type: 'string' },
            interval_days: { type: 'string', description: 'ช่วงห่างการพ่น เช่น 7-10 วัน' },
            phi_days: { type: 'string', description: 'ระยะเก็บเกี่ยวหลังพ่น (PHI)' },
            precautions: { type: 'string' },
            example_products: { type: 'array', items: { type: 'string' }, description: 'ชื่อการค้าที่มั่นใจเท่านั้น' }
          },
          required: ['active_th', 'kind']
        }
      },
      field_actions: { type: 'array', items: { type: 'string' }, description: 'วิธีจัดการในแปลงทันที' },
      prevention: { type: 'array', items: { type: 'string' } },
      safety_note: { type: 'string' },
      when_to_escalate: { type: 'string', description: 'กรณีใดควรปรึกษาเจ้าหน้าที่เกษตร/ส่งตรวจ' }
    },
    required: ['is_plant', 'health_status']
  }
};

const LABEL_SYSTEM = `คุณคือผู้ช่วยอ่านฉลากผลิตภัณฑ์วัตถุอันตรายทางการเกษตร (ยาป้องกันกำจัดศัตรูพืช ปุ๋ย สารเสริม) ในประเทศไทย
อ่านข้อมูลจากรูปถ่ายฉลากให้ถูกต้องที่สุด

กฎเหล็ก:
- อ่านเฉพาะสิ่งที่เห็นในรูป ห้ามเดา/แต่งข้อมูล ถ้าอ่านไม่ออกให้ใส่ใน unreadable_fields และเว้นค่าว่าง
- ชื่อสามัญ (common name) ของสารออกฤทธิ์ให้ระบุทั้งไทย/อังกฤษและความเข้มข้นตามที่ฉลากเขียน
- ถ้าให้บริบทโรค/ศัตรูพืชที่วินิจฉัยมา ให้ประเมินใน suitability ว่าผลิตภัณฑ์นี้เหมาะหรือไม่ พร้อมเหตุผลสั้น ๆ (ถ้าฉลากไม่ระบุพืช/โรคนั้น ให้บอกตามตรง และไม่ฟันธงว่าใช้ได้)
- ย้ำเสมอให้ปฏิบัติตามฉลากและใช้กับพืชที่ฉลากอนุญาต
เรียกใช้เครื่องมือ report_label เพื่อส่งผลลัพธ์เท่านั้น`;

const LABEL_TOOL = {
  name: 'report_label',
  description: 'ส่งข้อมูลที่อ่านได้จากฉลากผลิตภัณฑ์',
  input_schema: {
    type: 'object',
    properties: {
      is_label: { type: 'boolean', description: 'รูปนี้เป็นฉลากผลิตภัณฑ์ที่อ่านได้หรือไม่' },
      need_better_photo: { type: 'string' },
      product_name: { type: 'string', description: 'ชื่อการค้า' },
      product_type: { type: 'string', description: 'ประเภท เช่น สารป้องกันกำจัดเชื้อรา/แมลง/วัชพืช/ปุ๋ยน้ำ' },
      ingredients: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            common_th: { type: 'string' },
            common_en: { type: 'string' },
            concentration: { type: 'string', description: 'เช่น 25% w/v' }
          },
          required: ['common_en']
        }
      },
      formulation: { type: 'string', description: 'เช่น SC, EC, WP, WG' },
      moa_group: { type: 'string', description: 'FRAC/IRAC/HRAC ถ้าระบุบนฉลากหรือแน่ใจ' },
      registration_no: { type: 'string', description: 'เลขทะเบียนวัตถุอันตราย' },
      manufacturer: { type: 'string' },
      net_content: { type: 'string', description: 'ปริมาณบรรจุ เช่น 500 มล.' },
      target_crops_pests: { type: 'array', items: { type: 'string' }, description: 'พืช/ศัตรูพืชที่ฉลากระบุ' },
      label_rate: { type: 'string', description: 'อัตราใช้ที่ฉลากระบุ' },
      phi: { type: 'string', description: 'ระยะเก็บเกี่ยว' },
      hazard_warnings: { type: 'array', items: { type: 'string' } },
      suitability: {
        type: 'object',
        description: 'ประเมินกับโรคที่วินิจฉัย (ถ้าส่งบริบทมา)',
        properties: {
          verdict: { type: 'string', enum: ['good', 'partial', 'no', 'unknown'] },
          reason: { type: 'string' }
        },
        required: ['verdict', 'reason']
      },
      unreadable_fields: { type: 'array', items: { type: 'string' } },
      confidence: { type: 'number' }
    },
    required: ['is_label']
  }
};

// ---------- ข้อมูลโหมดสาธิต ----------
const DEMO_DIAG = {
  is_plant: true,
  need_better_photo: '',
  plant: { name_th: 'พริก', scientific_name: 'Capsicum annuum', growth_stage: 'ติดผล', confidence: 86 },
  health_status: 'disease',
  primary: {
    name_th: 'โรคแอนแทรคโนส (โรคกุ้งแห้ง)',
    name_en: 'Anthracnose',
    pathogen: 'Colletotrichum spp.',
    category: 'fungal',
    confidence: 88,
    severity: 'medium',
    symptoms_seen: ['แผลวงกลมสีน้ำตาลเข้มยุบตัวบนผล', 'ขอบแผลชัด มีจุดสีส้ม-ดำเรียงเป็นวงซ้อน', 'ผลบางส่วนแห้งเป็นสีฟางข้าว'],
    cause_and_spread: 'เชื้อราที่สปอร์แพร่ไปกับละอองน้ำฝน/น้ำพ่น ระบาดหนักช่วงอากาศชื้นและฝนชุก เชื้ออยู่ในเศษซากพืชและเมล็ด'
  },
  differentials: [
    { name_th: 'โรคผลเน่าจากแบคทีเรีย', confidence: 7, how_to_tell: 'แผลฉ่ำน้ำ มีกลิ่นเหม็น ไม่มีจุดสปอร์เป็นวง' },
    { name_th: 'ผลไหม้จากแดด', confidence: 5, how_to_tell: 'เกิดด้านที่โดนแดดจัด แผลเรียบสีขาวซีด ไม่มีจุดสปอร์' }
  ],
  treatments: [
    {
      active_th: 'อะซอกซีสโตรบิน', active_en: 'azoxystrobin', kind: 'chemical', moa_group: 'FRAC 11',
      formulation_hint: '25% SC', rate: '20–30 มล. / น้ำ 20 ลิตร',
      how_to_use: 'พ่นให้ทั่วผลและใบ เริ่มเมื่อพบอาการแรก เน้นช่วงออกดอก-ติดผล',
      interval_days: '7–10 วัน (ไม่เกิน 2 ครั้งติดต่อกัน แล้วสลับกลุ่ม)', phi_days: 'ประมาณ 3–7 วัน (ดูฉลาก)',
      precautions: 'สลับกลุ่มกลไกเพื่อลดการดื้อยา พ่นช่วงเช้า/เย็น สวมถุงมือและหน้ากาก',
      example_products: []
    },
    {
      active_th: 'ไดฟีโนโคนาโซล', active_en: 'difenoconazole', kind: 'chemical', moa_group: 'FRAC 3',
      formulation_hint: '25% EC', rate: '10–15 มล. / น้ำ 20 ลิตร',
      how_to_use: 'สลับกับกลุ่มสโตรบิลูริน พ่นคลุมทั้งต้นให้ทั่ว',
      interval_days: '7–14 วัน', phi_days: 'ประมาณ 7 วัน (ดูฉลาก)',
      precautions: 'ระวังเป็นพิษต่อสัตว์น้ำ ห้ามล้างอุปกรณ์ลงแหล่งน้ำ', example_products: []
    },
    {
      active_th: 'แมนโคเซบ', active_en: 'mancozeb', kind: 'chemical', moa_group: 'FRAC M03',
      formulation_hint: '80% WP', rate: '40–60 กรัม / น้ำ 20 ลิตร',
      how_to_use: 'ใช้เป็นสารสัมผัสป้องกัน พ่นก่อนฝนหรือเมื่อเริ่มระบาด',
      interval_days: '5–7 วัน', phi_days: 'ประมาณ 7 วัน (ดูฉลาก)',
      precautions: 'ไม่ควรผสมกับสารที่เป็นด่างจัด', example_products: []
    },
    {
      active_th: 'เชื้อแบคทีเรียบาซิลลัส ซับทิลิส', active_en: 'Bacillus subtilis', kind: 'biological', moa_group: 'FRAC BM02',
      formulation_hint: 'ผลิตภัณฑ์ชีวภาพ', rate: 'ตามฉลาก',
      how_to_use: 'พ่นเสริมเพื่อลดแรงกดดันของเชื้อ เหมาะช่วงใกล้เก็บเกี่ยว',
      interval_days: '5–7 วัน', phi_days: 'ไม่มีหรือน้อยมาก', precautions: 'พ่นตอนเย็นเพื่อให้เชื้อมีชีวิตรอด', example_products: []
    }
  ],
  field_actions: ['เก็บผลที่เป็นโรคออกจากแปลงแล้วฝังหรือเผาทำลาย', 'ตัดแต่งกิ่งให้โปร่ง ลดความชื้นในทรงพุ่ม', 'หลีกเลี่ยงการให้น้ำแบบสาดใส่ใบและผล'],
  prevention: ['ใช้เมล็ดพันธุ์ปลอดโรคและแช่ด้วยสารป้องกันเชื้อรา', 'ปลูกพืชหมุนเวียนต่างตระกูลอย่างน้อย 1 ฤดู', 'พ่นสารป้องกันก่อนช่วงฝนชุก'],
  safety_note: 'ผลลัพธ์นี้เป็นข้อมูลประกอบการตัดสินใจ โปรดอ่านฉลากและใช้เฉพาะผลิตภัณฑ์ที่ขึ้นทะเบียนกับพืชชนิดนั้น สวมอุปกรณ์ป้องกันทุกครั้ง',
  when_to_escalate: 'หากโรคลามเกิน 30% ของแปลงภายใน 1 สัปดาห์หรือใช้สารแล้วไม่ดีขึ้น ควรปรึกษาเจ้าหน้าที่เกษตรอำเภอ'
};

const DEMO_LABEL = {
  is_label: true,
  need_better_photo: '',
  product_name: 'ตัวอย่างผลิตภัณฑ์ (โหมดสาธิต)',
  product_type: 'สารป้องกันกำจัดเชื้อรา',
  ingredients: [{ common_th: 'อะซอกซีสโตรบิน', common_en: 'azoxystrobin', concentration: '25% w/v' }],
  formulation: 'SC',
  moa_group: 'FRAC 11',
  registration_no: '— (ตัวอย่าง ไม่ใช่เลขจริง)',
  manufacturer: '— (ตัวอย่าง)',
  net_content: '500 มล.',
  target_crops_pests: ['พริก: โรคแอนแทรคโนส', 'ข้าว: โรคใบจุด', 'มะม่วง: โรคแอนแทรคโนส'],
  label_rate: '20–30 มล. / น้ำ 20 ลิตร',
  phi: '7 วัน',
  hazard_warnings: ['เป็นอันตรายต่อสัตว์น้ำ', 'สวมถุงมือ หน้ากาก และชุดป้องกันขณะผสมและพ่น', 'เก็บให้พ้นมือเด็ก'],
  suitability: { verdict: 'good', reason: 'สารออกฤทธิ์ azoxystrobin ใช้จัดการโรคแอนแทรคโนสในพริกได้ — นี่คือข้อมูลตัวอย่างในโหมดสาธิต' },
  unreadable_fields: [],
  confidence: 90
};

// ---------- เรียก Claude ----------
function parseDataUrl(u) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(String(u || ''));
  if (!m) throw httpError(400, 'รูปภาพไม่ถูกต้อง');
  return { media_type: m[1], data: m[2] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

async function callClaude({ system, content, tool }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      system,
      tools: [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content }]
    })
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { throw httpError(502, 'AI ตอบกลับผิดรูปแบบ'); }
  if (!res.ok) {
    const msg = data?.error?.message || `AI error ${res.status}`;
    if (res.status === 401) throw httpError(401, 'API key ไม่ถูกต้อง — ตรวจสอบไฟล์ .env');
    if (res.status === 429) throw httpError(429, 'เรียกใช้ AI ถี่เกินไป ลองใหม่อีกครั้งในอีกสักครู่');
    throw httpError(502, msg);
  }
  const block = (data.content || []).find((b) => b.type === 'tool_use');
  if (!block) throw httpError(502, 'AI ไม่ได้ส่งผลลัพธ์กลับมา ลองถ่ายรูปใหม่อีกครั้ง');
  return block.input;
}

function imageBlocks(images, max) {
  if (!Array.isArray(images) || images.length === 0) throw httpError(400, 'ยังไม่มีรูปภาพ');
  return images.slice(0, max).map((u) => ({ type: 'image', source: { type: 'base64', ...parseDataUrl(u) } }));
}

async function handleDiagnose(body) {
  const blocks = imageBlocks(body.images, 4);
  if (!HAS_KEY) { await sleep(2600); return { demo: true, result: DEMO_DIAG }; }
  const hint = [];
  if (body.crop) hint.push(`ชนิดพืชที่ผู้ใช้ระบุ: ${String(body.crop).slice(0, 80)}`);
  if (body.notes) hint.push(`อาการ/รายละเอียดที่ผู้ใช้บอก: ${String(body.notes).slice(0, 600)}`);
  const content = [
    ...blocks,
    { type: 'text', text: `ช่วยวินิจฉัยพืชจากรูปทั้ง ${blocks.length} ใบนี้ (เป็นรูปของพืชต้นเดียวกัน)\n${hint.join('\n')}` }
  ];
  const result = await callClaude({ system: DIAG_SYSTEM, content, tool: DIAG_TOOL });
  return { demo: false, result };
}

async function handleLabel(body) {
  const blocks = imageBlocks(body.images, 3);
  if (!HAS_KEY) {
    await sleep(2000);
    const result = body.context
      ? DEMO_LABEL
      : { ...DEMO_LABEL, suitability: { verdict: 'unknown', reason: 'ยังไม่มีผลวินิจฉัยให้เทียบ — สแกนพืชก่อนเพื่อให้ AI ประเมินความเหมาะสม (ข้อมูลตัวอย่างในโหมดสาธิต)' } };
    return { demo: true, result };
  }
  const ctx = body.context ? `\nบริบทที่วินิจฉัยมา: ${String(body.context).slice(0, 500)}` : '\n(ไม่มีบริบทโรค — ให้ verdict เป็น unknown)';
  const content = [...blocks, { type: 'text', text: `อ่านฉลากผลิตภัณฑ์นี้${ctx}` }];
  const result = await callClaude({ system: LABEL_SYSTEM, content, tool: LABEL_TOOL });
  return { demo: false, result };
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(httpError(413, 'ไฟล์รูปใหญ่เกินไป')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(httpError(400, 'ข้อมูลที่ส่งมาไม่ถูกต้อง')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end('Forbidden'); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('ไม่พบหน้านี้'); return; }
    res.writeHead(200, {
      'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, 'http://x');
    if (pathname === '/api/status' && req.method === 'GET') return sendJson(res, 200, { ai: HAS_KEY, model: MODEL });
    if (pathname === '/api/diagnose' && req.method === 'POST') return sendJson(res, 200, await handleDiagnose(await readBody(req)));
    if (pathname === '/api/label' && req.method === 'POST') return sendJson(res, 200, await handleLabel(await readBody(req)));
    if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'ไม่พบ API นี้' });
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    serveStatic(req, res);
  } catch (e) {
    console.error('[error]', e.message);
    sendJson(res, e.status || 500, { error: e.message || 'เกิดข้อผิดพลาด' });
  }
});

server.listen(PORT, () => {
  console.log(`\n🌿 AI Plant Doctor พร้อมใช้งานที่ http://localhost:${PORT}`);
  console.log(HAS_KEY ? `   AI: เปิดใช้งาน (${MODEL})` : '   AI: โหมดสาธิต (ยังไม่ได้ตั้ง ANTHROPIC_API_KEY ในไฟล์ .env)');
});
