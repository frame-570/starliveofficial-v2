// แท็บ "ข้อความ" ในแอดมิน: เลือกงาน → ได้ข้อความแนะนำงาน/ราคา พร้อมปุ่มคัดลอก
import { svgIcon } from "./icons.js";

const LS_TIME = "slo_msg_start_time";
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

let inited = false;
let events = [];
let sb = null;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function loadTime() {
  try {
    return localStorage.getItem(LS_TIME) || "18:00 น.";
  } catch {
    return "18:00 น.";
  }
}
function saveTime(v) {
  try {
    localStorage.setItem(LS_TIME, v);
  } catch {}
}

// วันแสดงจากฐานข้อมูล เช่น "5–6 ธันวาคม 2569" (ปีเป็น พ.ศ.)
function formatDates(days) {
  const p = (days || [])
    .map((d) => String(d.event_date || "").split("-").map(Number))
    .filter((x) => x.length === 3 && x.every((n) => !isNaN(n)))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  if (!p.length) return "";
  const be = (y) => (y < 2400 ? y + 543 : y);
  const first = p[0];
  const last = p[p.length - 1];
  if (p.length === 1) return `${first[2]} ${MONTHS[first[1] - 1]} ${be(first[0])}`;
  if (first[0] === last[0] && first[1] === last[1]) {
    const nums = p.map((x) => x[2]);
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    const dayPart = contiguous ? `${nums[0]}–${nums[nums.length - 1]}` : nums.join(", ");
    return `${dayPart} ${MONTHS[first[1] - 1]} ${be(first[0])}`;
  }
  const full = (x) => `${x[2]} ${MONTHS[x[1] - 1]} ${be(x[0])}`;
  return `${full(first)} – ${full(last)}`;
}

function buildMessage(ev, timeText) {
  const pk = [...(ev.ticket_packages || [])].sort((a, b) => a.num_days - b.num_days);
  const months = ev.rerun_duration_months || 6;
  const lines = [
    `✨ รายละเอียดหารไลฟ์สด ${ev.title} ✨`,
    "ขอบคุณที่สนใจหารไลฟ์สดกับ STARLIVE OFFICIAL ครับ 💖",
    "",
  ];
  const dates = formatDates(ev.event_days);
  if (dates) lines.push(`📅 วันแสดง: ${dates}`);
  if (timeText.trim()) lines.push(`🕒 เวลาเริ่ม: ${timeText.trim()}`);
  lines.push("", "📌 แพ็กเกจรับชม");
  if (pk.length) pk.forEach((p) => lines.push(`${p.num_days} วัน — ${Number(p.price).toLocaleString("th-TH")}฿`));
  else lines.push("(ยังไม่ได้ตั้งราคาในระบบ)");
  lines.push(
    "",
    "🎥 Full HD 1080p",
    `⏪ ชมสด + รีรันย้อนหลัง ${months} เดือน`,
    "💬 สอบถามแอดมินได้ครับ",
    "",
    "🛒 สนใจสั่งซื้อ:",
    // ใช้โดเมนที่เปิดอยู่ (ไม่ต้องแก้เมื่อเปลี่ยนโดเมนใหม่) ถ้างานมีชื่อลิงก์ จะพาไปหน้างานนั้นตรงๆ
    ev.slug ? `${window.location.origin}/${ev.slug}` : window.location.origin,
    "",
    "💬 ไม่สะดวกสั่งผ่านเว็บไซต์ พิมพ์ “สนใจ” ได้เลยครับ แอดมินจะส่งข้อมูลชำระเงินให้ครับ 💖"
  );
  return lines.join("\n");
}

function regenerate() {
  const ev = events.find((e) => e.id === $("msgEvent").value);
  $("msgText").value = ev ? buildMessage(ev, $("msgTime").value) : "";
}

export async function initMessageMaker(supabase) {
  const root = $("messagesTab");
  if (!root) return;
  sb = supabase || sb;
  if (!inited) {
    inited = true;
    root.innerHTML = `
      <div class="admin-card" style="padding:18px; max-width:720px;">
        <h2 class="display" style="margin:0 0 4px;">ข้อความแนะนำงาน</h2>
        <p class="muted" style="font-size:13px; margin:0 0 14px; line-height:1.6;">เลือกงาน ระบบดึงชื่องาน วันแสดง ราคา และระยะรีรันจากฐานข้อมูลให้ กรอกเวลาเริ่มเอง แล้วกดคัดลอกไปส่งในไลน์ได้เลย (แก้ข้อความในช่องได้ก่อนคัดลอก)</p>
        <label class="field-label" for="msgEvent">งาน</label>
        <select id="msgEvent" class="field-input" style="margin-bottom:12px;"><option>กำลังโหลด...</option></select>
        <label class="field-label" for="msgTime">เวลาเริ่ม <span class="muted" style="font-size:11px;">(จำค่าล่าสุดไว้ให้ ลบให้ว่างถ้าไม่ต้องการแสดง)</span></label>
        <input id="msgTime" class="field-input" maxlength="30" placeholder="เช่น 18:00 น." style="margin-bottom:12px;" />
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <label class="field-label" for="msgText" style="margin:0;">ข้อความ</label>
          <button type="button" id="msgCopy" class="icon-btn" style="display:inline-flex; align-items:center; gap:6px;">${svgIcon("copy", 16)}<span>คัดลอก</span></button>
        </div>
        <textarea id="msgText" class="field-input" rows="22" style="resize:vertical; line-height:1.6; font-family:'Sarabun',sans-serif;"></textarea>
      </div>`;
    $("msgTime").value = loadTime();
    $("msgEvent").addEventListener("change", regenerate);
    $("msgTime").addEventListener("input", () => {
      saveTime($("msgTime").value);
      regenerate();
    });
    $("msgCopy").addEventListener("click", async () => {
      const ta = $("msgText");
      try {
        await navigator.clipboard.writeText(ta.value);
      } catch {
        ta.select();
        document.execCommand("copy");
      }
      const label = $("msgCopy").querySelector("span");
      label.textContent = "คัดลอกแล้ว!";
      setTimeout(() => (label.textContent = "คัดลอก"), 1500);
    });
  }

  const { data, error } = await sb
    .from("events")
    .select("*, event_days(event_date), ticket_packages(num_days, price)")
    .order("created_at", { ascending: false });
  if (error) {
    $("msgEvent").innerHTML = `<option>โหลดงานไม่สำเร็จ: ${esc(error.message)}</option>`;
    return;
  }
  events = data || [];
  const prev = $("msgEvent").value;
  $("msgEvent").innerHTML = events.map((e) => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join("") || "<option value=''>ยังไม่มีงาน</option>";
  if (events.some((e) => e.id === prev)) $("msgEvent").value = prev;
  regenerate();
}
