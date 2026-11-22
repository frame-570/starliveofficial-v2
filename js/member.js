// รหัสประจำตัวลูกค้า: "ST" + 6 ตัวที่ลูกค้าตั้งเอง ใช้ดูทุกงานที่ซื้อด้วยรหัสเดียว
// ฝั่งเว็บเก็บแค่โทเคนเซสชัน (สุ่มโดยเซิร์ฟเวอร์) + ชื่อ/รหัสไว้แสดงผล — ตรวจสิทธิ์จริงทำที่ Edge Function "member-code"
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";
import { saveGuestOrder } from "./guest.js";

export const MEMBER_PREFIX = "ST";
const KEY = "slo_member";

export const MEMBER_INFO_POINTS = [
  "รหัสที่ตั้งนี้ใช้รับชมได้ทุกงานที่คุณซื้อ เป็นรหัสประจำตัวของคุณเอง",
  "เปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ก็ยังเข้าดูประวัติและรับชมได้ แค่ใส่รหัสเดิม",
  "เก็บรหัสเป็นความลับ ห้ามแจกหรือส่งต่อ เพราะใครมีรหัสนี้ก็ดูงานที่คุณซื้อได้ทั้งหมด",
  "รับชมได้พร้อมกันสูงสุด 2 เครื่องต่อหนึ่งงาน ตามเงื่อนไขเดิม",
  "ลืมรหัสหรืออยากเปลี่ยนรหัส ต้องทักแอดมินให้เปลี่ยนให้เท่านั้น (ลูกค้าเปลี่ยนเองไม่ได้)",
];

// ---------- กติกาของรหัส (ฝั่งเซิร์ฟเวอร์ตรวจซ้ำอีกชั้น) ----------
const COMMON = new Set([
  "ABC123", "ABC111", "AB1234", "AA1234", "QWE123", "QWERTY", "PASS12", "ADMIN1", "STAR12", "STAR01",
  "LOVE12", "LOVE01", "ILOVE1", "HELLO1", "TEST12", "USER12", "ABCD12", "XYZ123", "AAA111", "BTS123",
]);

function seqRun(s, len, step) {
  let run = 1;
  for (let i = 1; i < s.length; i++) {
    const a = s.charCodeAt(i - 1);
    const b = s.charCodeAt(i);
    const sameClass = /[0-9]/.test(s[i]) === /[0-9]/.test(s[i - 1]);
    if (sameClass && b - a === step) {
      run++;
      if (run >= len) return true;
    } else run = 1;
  }
  return false;
}

// suffix = 6 ตัวหลัง ST — คืนข้อความผิดพลาด หรือ "" ถ้าใช้ได้
export function validateSuffix(suffix) {
  const s = String(suffix || "").toUpperCase();
  if (s.length !== 6) return "ต้องมี 6 ตัวอักษรพอดี";
  if (!/^[A-Z0-9]{6}$/.test(s)) return "ใช้ได้เฉพาะตัวอักษรภาษาอังกฤษและตัวเลข";
  const letters = (s.match(/[A-Z]/g) || []).length;
  const digits = (s.match(/[0-9]/g) || []).length;
  if (letters < 2) return "ต้องมีตัวอักษรภาษาอังกฤษอย่างน้อย 2 ตัว";
  if (digits < 1) return "ต้องมีตัวเลขอย่างน้อย 1 ตัว";
  if (/(.)\1{3,}/.test(s)) return "รหัสเดาง่ายเกินไป (ห้ามมีตัวเดียวกันซ้ำ 4 ตัวติดกัน)";
  if (seqRun(s, 4, 1) || seqRun(s, 4, -1)) return "รหัสเดาง่ายเกินไป (ห้ามเรียงลำดับ 4 ตัวขึ้นไป เช่น 1234, ABCD)";
  if (COMMON.has(s)) return "รหัสนี้พบบ่อยเกินไป กรุณาตั้งรหัสอื่น";
  return "";
}

export function suggestSuffix() {
  const L = "ABCDEFGHJKMNPQRSTUVWXYZ"; // ตัดตัวที่สับสน I, L, O
  const D = "23456789";
  const pick = (set) => {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return set[b[0] % set.length];
  };
  for (let i = 0; i < 50; i++) {
    const chars = [pick(L), pick(L), pick(L), pick(D), pick(D), pick(i % 2 ? L : D)];
    for (let j = chars.length - 1; j > 0; j--) {
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      const k = b[0] % (j + 1);
      [chars[j], chars[k]] = [chars[k], chars[j]];
    }
    const s = chars.join("");
    if (!validateSuffix(s)) return s;
  }
  return "K7MQ4X";
}

// ---------- เซสชันในเครื่องนี้ ----------
export function getMember() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && v.token ? v : null;
  } catch {
    return null;
  }
}
export function getMemberToken() {
  return getMember()?.token || null;
}
export function setMember(m) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
  } catch {}
}
export function clearMember() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}
export function maskCode(code) {
  const c = String(code || "");
  return c.length >= 8 ? `${c.slice(0, 2)}••••${c.slice(-2)}` : c;
}

// ---------- เรียก Edge Function ----------
export async function memberCall(payload) {
  const res = await fetch(`${FUNCTIONS_URL}/member-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(body.error || "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
    e.status = res.status;
    e.body = body;
    throw e;
  }
  return body;
}

// เก็บออเดอร์ของรหัสนี้ลงเครื่อง (ใช้ระบบประวัติ/ชำระเงินแบบแขกเดิมต่อได้ แม้เปลี่ยนเครื่อง)
export function adoptOrders(orders) {
  for (const o of orders || []) {
    if (!o.guest_token) continue;
    saveGuestOrder({
      id: o.id,
      token: o.guest_token,
      order_number: o.order_number,
      title: o.events?.title || "",
      amount: o.amount,
    });
  }
}

// หลังเข้าสู่ระบบ/ตั้งรหัสสำเร็จ: จำเซสชัน + ดึงออเดอร์มาไว้ในเครื่อง
export function startMemberSession(result) {
  setMember({ token: result.token, code: result.member.code, name: result.member.name, line: result.member.line || "" });
  adoptOrders(result.orders);
}
