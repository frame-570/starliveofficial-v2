// ตัวช่วยสั่งซื้อแบบไม่สมัครสมาชิก (แขก)
// ประวัติของแขกเก็บใน localStorage ของเครื่องนี้เท่านั้น: [{ id, token, order_number, title, amount, at }]
// token = guest_token ที่ระบบสุ่มให้ตอนสั่ง ใช้พิสูจน์ความเป็นเจ้าของออเดอร์กับฟังก์ชัน guest-order
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

const KEY = "slo_guest_orders";
const NAME_KEY = "slo_guest_contact";

export const GUEST_NOTICE = "ข้อมูลประวัติการสั่งซื้อของคุณจะถูกบันทึกไว้แค่ในเครื่องที่ทำการสั่งซื้อเท่านั้น";

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function getGuestOrders() {
  return read();
}

export function hasGuestOrders() {
  return read().length > 0;
}

export function getGuestToken(orderId) {
  return read().find((o) => String(o.id) === String(orderId))?.token || null;
}

export function saveGuestOrder(entry) {
  try {
    const list = read().filter((o) => String(o.id) !== String(entry.id));
    list.unshift({ ...entry, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    // เก็บไม่ได้ (โหมดส่วนตัว/พื้นที่เต็ม) — ลูกค้ายังชำระต่อได้ในหน้านี้ แต่ควรเก็บรหัสไว้เอง
  }
}

// จำชื่อ/LINE ID ที่เคยกรอก จะได้ไม่ต้องพิมพ์ซ้ำ
export function getGuestContact() {
  try {
    return JSON.parse(localStorage.getItem(NAME_KEY)) || {};
  } catch {
    return {};
  }
}
export function saveGuestContact(name, line) {
  try {
    localStorage.setItem(NAME_KEY, JSON.stringify({ name, line }));
  } catch {}
}

// เรียก Edge Function "guest-order" (get / list / slip-upload)
export async function guestCall(payload) {
  const res = await fetch(`${FUNCTIONS_URL}/guest-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.error || body.message || `HTTP ${res.status}`;
    throw new Error(body.detail ? `${msg} (${body.detail})` : msg);
  }
  return body;
}

// กล่องข้อความเตือนแขก (ใช้ซ้ำหลายหน้า) extra = ข้อความต่อท้าย (ไม่บังคับ)
export function guestNoticeHtml(extra = "") {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  return `<div style="background:rgba(242,183,5,0.1); border:1px solid rgba(242,183,5,0.45); border-radius:12px; padding:10px 12px; font-size:12.5px; line-height:1.7; text-align:left; color:var(--text,#f5f2ea);"><strong style="color:var(--amber,#f2b705);">สั่งซื้อโดยไม่สมัครสมาชิก</strong><br>${esc(GUEST_NOTICE)}${extra ? `<br>${esc(extra)}` : ""}</div>`;
}
