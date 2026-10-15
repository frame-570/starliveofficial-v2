import { supabase } from "./supabaseClient.js";
import { svgIcon } from "./icons.js";

const grid = document.getElementById("promoGrid");
const emptyEl = document.getElementById("promoEmpty");
const loadingEl = document.getElementById("promoLoading");
const toastEl = document.getElementById("promoToast");

loadPromotions();

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric" });
}

function discountLabel(p) {
  const v = Number(p.discount_value);
  return p.discount_type === "percent" ? `${v}%` : `${v.toLocaleString("th-TH")}฿`;
}

async function loadPromotions() {
  // ดึงผ่านฟังก์ชันฝั่งฐานข้อมูล: ได้เฉพาะโค้ดที่ควรโชว์ และไม่มีจำนวนสิทธิ์คงเหลือ
  const { data, error } = await supabase.rpc("get_public_promotions");
  loadingEl.style.display = "none";

  if (error) {
    emptyEl.textContent = "โหลดโค้ดส่วนลดไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    emptyEl.style.display = "block";
    return;
  }
  if (!data || data.length === 0) {
    emptyEl.style.display = "block";
    return;
  }
  grid.innerHTML = "";
  data.forEach((p) => grid.appendChild(renderCard(p)));
}

// โค้ดยาวให้ลดขนาดตัวอักษรลง เพื่อให้เห็นโค้ดครบทุกตัว (ไม่ตัดด้วย ...)
function codeSize(code) {
  const n = String(code).length;
  if (n <= 6) return 15;
  if (n <= 8) return 13;
  return 11.5;
}

function renderCard(p) {
  const notStarted = !!p.starts_at && new Date(p.starts_at) > new Date();
  const card = document.createElement("article");
  card.className = "promo-card" + (notStarted ? " promo-card-soon" : "");

  const eventLabel = p.event_title || "ทุกงาน";
  const startLabel = p.starts_at ? fmtDate(p.starts_at) : "ใช้ได้ทันที";
  const endLabel = p.expires_at ? fmtDate(p.expires_at) : "ไม่มีวันหมดอายุ";

  card.innerHTML = `
    <div class="promo-card-top">
      <div class="promo-amount">${escapeHtml(discountLabel(p))}</div>
      ${notStarted ? `<span class="promo-chip">เร็ว ๆ นี้</span>` : ""}
    </div>
    <div class="promo-code-row">
      <span class="promo-code" style="--code-size:${codeSize(p.code)}px">${escapeHtml(p.code)}</span>
      <button type="button" class="promo-copy" aria-label="คัดลอกโค้ด ${escapeHtml(p.code)}" title="คัดลอกโค้ด">${svgIcon("copy", 16, 2)}</button>
    </div>
    <dl class="promo-details">
      <div><dt>ใช้กับ</dt><dd title="${escapeHtml(eventLabel)}">${escapeHtml(eventLabel)}</dd></div>
      <div><dt>เริ่มใช้</dt><dd>${escapeHtml(startLabel)}</dd></div>
      <div><dt>ถึงวันที่</dt><dd>${escapeHtml(endLabel)}</dd></div>
    </dl>
  `;

  const btn = card.querySelector(".promo-copy");
  btn.addEventListener("click", async () => {
    const ok = await copyText(p.code);
    showToast(ok ? `คัดลอกโค้ด ${p.code} แล้ว` : "คัดลอกไม่สำเร็จ ลองกดค้างที่โค้ดเพื่อคัดลอก");
    if (ok) {
      btn.innerHTML = svgIcon("check", 16, 2.6);
      btn.classList.add("done");
      setTimeout(() => {
        btn.innerHTML = svgIcon("copy", 16, 2);
        btn.classList.remove("done");
      }, 1600);
    }
  });
  return card;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

let toastTimer = 0;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
}
