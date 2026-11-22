// นับการเข้าใช้งานเว็บไซต์ (สถิติการใช้งานในหน้าแอดมิน)
// - นับ 1 ครั้งต่อ 1 หน้าต่อ 1 เซสชัน (รีเฟรชไม่นับซ้ำภายใน 30 นาที)
// - แยก "แอดมิน" กับ "ลูกค้า" จากการที่เบราว์เซอร์นี้ล็อกอินแอดมินอยู่หรือไม่
// - ไม่เก็บข้อมูลส่วนตัว มีแค่ path + รหัสสุ่มประจำเบราว์เซอร์ (ไว้นับจำนวนคน)
// ถูก import จาก supabaseClient.js จึงทำงานทุกหน้าที่ใช้ Supabase โดยไม่ต้องแก้ไฟล์อื่น
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const KNOWN = {
  "": "/",
  index: "/",
  "event-detail": "/event-detail",
  promotion: "/promotion",
  review: "/review",
  login: "/login",
  orders: "/orders",
  payment: "/payment",
  watch: "/watch",
  cardshop: "/cardshop",
  admin: "/admin",
  "cardshop-admin": "/cardshop-admin",
};

function resolve() {
  let seg = "";
  try {
    seg = decodeURIComponent(window.location.pathname.replace(/^\/+|\/+$/g, ""));
  } catch {
    return null;
  }
  seg = seg.replace(/\.html$/i, "");
  const params = new URLSearchParams(window.location.search);
  if (Object.prototype.hasOwnProperty.call(KNOWN, seg)) {
    const path = KNOWN[seg];
    if (path === "/event-detail") return { path, detail: params.get("slug") || params.get("id") || null };
    return { path, detail: null };
  }
  // ลิงก์สั้นของงาน เช่น /dewteefancon
  if (seg && !seg.includes("/") && !seg.includes(".")) return { path: "/event-detail", detail: seg.toLowerCase() };
  return null;
}

function isAdminBrowser() {
  try {
    const s = JSON.parse(localStorage.getItem("starlive_admin_auth") || "null");
    return !!(s && s.user && (s.refresh_token || s.access_token));
  } catch {
    return false;
  }
}

function visitorId() {
  try {
    let v = localStorage.getItem("slo_vid");
    if (!v) {
      const b = new Uint8Array(10);
      crypto.getRandomValues(b);
      v = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
      localStorage.setItem("slo_vid", v);
    }
    return v;
  } catch {
    return null;
  }
}

function track() {
  try {
    if (navigator.webdriver) return; // บอท/เครื่องมือทดสอบ
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    const r = resolve();
    if (!r) return;

    const key = `slo_pv_${r.path}_${r.detail || ""}`;
    try {
      const last = Number(sessionStorage.getItem(key) || 0);
      if (last && Date.now() - last < 30 * 60 * 1000) return;
      sessionStorage.setItem(key, String(Date.now()));
    } catch {}

    fetch(`${SUPABASE_URL}/rest/v1/rpc/track_view`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ p_path: r.path, p_detail: r.detail, p_admin: isAdminBrowser(), p_visitor: visitorId() }),
    }).catch(() => {});
  } catch {}
}

track();
