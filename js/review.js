import { supabase } from "./supabaseClient.js";
import { svgIcon } from "./icons.js";
import { drawBackground, POSTER_THEMES } from "./poster.js";

const PAGE_SIZE = 20;
const MIN_LEN = 5;
const COOLDOWN_MS = 60 * 1000;

const listEl = document.getElementById("reviewList");
const emptyEl = document.getElementById("reviewEmpty");
const loadingEl = document.getElementById("reviewLoading");
const moreBtn = document.getElementById("reviewMoreBtn");
const modal = document.getElementById("reviewModal");
const starPicker = document.getElementById("starPicker");
const starHint = document.getElementById("starHint");
const textEl = document.getElementById("reviewText");
const nickEl = document.getElementById("reviewNickname");
const counterEl = document.getElementById("reviewCounter");
const errorEl = document.getElementById("reviewError");
const submitBtn = document.getElementById("reviewSubmitBtn");
const toastEl = document.getElementById("reviewToast");
const themeCanvas = document.getElementById("reviewThemeBg");

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z";
const STAR_HINTS = ["", "ไม่พอใจ", "พอใช้", "ปานกลาง", "ดี", "ยอดเยี่ยม"];

let offset = 0;
let rating = 0;
let openedAt = 0;
let sending = false;

document.getElementById("reviewCloseBtn").innerHTML = svgIcon("x", 16, 2.2);

// ============================================================
// ดาว
// ============================================================
function starSvg(filled, size = 22) {
  return `<svg class="rv-star ${filled ? "on" : "off"}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${STAR_PATH}" /></svg>`;
}

// ดาว 5 ดวง: ได้กี่ดวงเป็นสีเหลืองเต็ม ที่เหลือเป็นแค่กรอบสีเหลืองข้างในโปร่ง
function starsRow(n) {
  let html = "";
  for (let i = 1; i <= 5; i++) html += starSvg(i <= n);
  return html;
}

function buildStarPicker() {
  starPicker.innerHTML = "";
  for (let i = 1; i <= 5; i++) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "star-btn";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", `${i} ดาว`);
    b.setAttribute("aria-checked", "false");
    b.innerHTML = starSvg(false, 40);
    b.addEventListener("click", () => setRating(i));
    b.addEventListener("mouseenter", () => paintStars(i));
    b.addEventListener("focus", () => paintStars(i));
    starPicker.appendChild(b);
  }
  starPicker.addEventListener("mouseleave", () => paintStars(rating));
  starPicker.addEventListener("focusout", () => paintStars(rating));
}

function paintStars(n) {
  [...starPicker.children].forEach((b, idx) => {
    const svg = b.querySelector("svg");
    svg.classList.toggle("on", idx < n);
    svg.classList.toggle("off", idx >= n);
  });
}

function setRating(n) {
  rating = n;
  paintStars(n);
  [...starPicker.children].forEach((b, idx) => b.setAttribute("aria-checked", String(idx + 1 === n)));
  starHint.textContent = `${n} ดาว · ${STAR_HINTS[n]}`;
  refreshSubmit();
}

function refreshSubmit() {
  const len = Array.from(textEl.value.trim()).length;
  counterEl.textContent = `${Array.from(textEl.value).length}/500`;
  // ต้องมีทั้งดาวและข้อความ ถึงจะส่งได้
  submitBtn.disabled = sending || rating < 1 || len < MIN_LEN;
}

// ============================================================
// เปิด/ปิดฟอร์ม
// ============================================================
function openModal() {
  rating = 0;
  textEl.value = "";
  nickEl.value = "";
  errorEl.textContent = "";
  document.getElementById("reviewWebsite").value = "";
  starHint.textContent = "";
  buildStarPicker();
  refreshSubmit();
  openedAt = Date.now();
  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
  starPicker.firstElementChild.focus();
}

function closeModal() {
  modal.style.display = "none";
  document.body.style.overflow = "";
}

document.getElementById("writeReviewBtn").addEventListener("click", openModal);
document.getElementById("reviewCloseBtn").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && modal.style.display !== "none") closeModal();
});
textEl.addEventListener("input", refreshSubmit);

submitBtn.addEventListener("click", submitReview);

async function submitReview() {
  errorEl.textContent = "";
  const content = textEl.value.trim();
  if (rating < 1) return (errorEl.textContent = "กรุณาให้คะแนนดาวก่อน");
  if (Array.from(content).length < MIN_LEN) return (errorEl.textContent = `กรุณาเขียนข้อความรีวิวอย่างน้อย ${MIN_LEN} ตัวอักษร`);

  const last = Number(localStorage.getItem("review_last_at") || 0);
  if (Date.now() - last < COOLDOWN_MS) {
    return (errorEl.textContent = "คุณเพิ่งส่งรีวิวไป กรุณารอสักครู่แล้วลองใหม่");
  }

  sending = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "กำลังส่ง...";
  try {
    const { data, error } = await supabase.functions.invoke("submit-review", {
      body: {
        rating,
        content,
        nickname: nickEl.value.trim(),
        website: document.getElementById("reviewWebsite").value,
        t: Date.now() - openedAt, // เวลาที่ใช้กรอก (ms) — ไม่พึ่งนาฬิกาเครื่องลูกค้า
      },
    });
    if (error || !data?.success) {
      throw new Error(data?.reason || "ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
    localStorage.setItem("review_last_at", String(Date.now()));
    closeModal();
    showToast(data.status === "pending" ? "ขอบคุณสำหรับรีวิว! จะแสดงในหน้านี้หลังทีมงานตรวจสอบ" : "ขอบคุณสำหรับรีวิว!", 3600);
    if (data.status !== "pending") loadReviews(true);
  } catch (err) {
    errorEl.textContent = err.message || "ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  } finally {
    sending = false;
    submitBtn.textContent = "ส่งรีวิว";
    refreshSubmit();
  }
}

// ============================================================
// รายการรีวิว
// ============================================================
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// วันที่ + เวลา เวลาไทย เช่น "17 ต.ค. 2569 15:30"
function formatReviewDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderCard(r) {
  const el = document.createElement("article");
  el.className = "review-card";
  const name = String(r.nickname || "").trim();
  const when = formatReviewDate(r.created_at);
  el.innerHTML = `
    <div class="review-stars" role="img" aria-label="ให้ ${r.rating} ดาวจาก 5 ดาว">${starsRow(Number(r.rating))}</div>
    <p class="review-text">${escapeHtml(r.content)}</p>
    <div class="review-meta">${name ? `<span class="review-name">${escapeHtml(name)}</span>` : ""}${name && when ? `<span class="review-dot" aria-hidden="true">·</span>` : ""}${when ? `<time datetime="${escapeHtml(r.created_at)}">${escapeHtml(when)}</time>` : ""}</div>
  `;
  return el;
}

async function loadReviews(reset = false) {
  if (reset) {
    offset = 0;
    listEl.innerHTML = "";
    emptyEl.style.display = "none";
    moreBtn.style.display = "none";
    loadingEl.style.display = "block";
  }
  const { data, error } = await supabase.rpc("get_public_reviews", { p_limit: PAGE_SIZE, p_offset: offset });
  loadingEl.style.display = "none";

  if (error) {
    emptyEl.textContent = "โหลดรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    emptyEl.style.display = "block";
    return;
  }
  (data || []).forEach((r) => listEl.appendChild(renderCard(r)));
  offset += (data || []).length;
  emptyEl.style.display = listEl.children.length === 0 ? "block" : "none";
  moreBtn.style.display = (data || []).length === PAGE_SIZE ? "inline-block" : "none";
}
moreBtn.addEventListener("click", () => loadReviews(false));

// ============================================================
// ธีมหน้ารีวิว (แอดมินเลือก) — ใช้พื้นหลังชุดเดียวกับระบบสร้างโปสเตอร์
// ============================================================
let currentTheme = "st";
let resizeTimer = 0;

function paintTheme() {
  try {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    themeCanvas.width = vw;
    themeCanvas.height = vh;
    const ctx = themeCanvas.getContext("2d");

    // จอแคบ: ย่อภาพธีมให้เห็นลวดลายครบ (ไม่ย่อต่ำกว่า 0.55 แล้วตัดขอบซ้าย-ขวา)
    const s = vw < 1080 ? Math.max(vw / 1080, 0.55) : 1;
    const off = document.createElement("canvas");
    off.width = 1080;
    off.height = Math.max(Math.ceil(vh / s), 600);
    drawBackground(off.getContext("2d"), off.height, currentTheme);

    if (s !== 1) {
      ctx.drawImage(off, (vw - 1080 * s) / 2, 0, 1080 * s, off.height * s);
    } else {
      // จอกว้าง: ต่อภาพสลับสะท้อนซ้าย-ขวา ให้เนียนไม่มีรอยต่อ
      for (let x = 0, i = 0; x < vw; x += 1080, i++) {
        ctx.save();
        if (i % 2 === 1) {
          ctx.translate(x + 1080, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(off, 0, 0);
        } else {
          ctx.drawImage(off, x, 0);
        }
        ctx.restore();
      }
    }
    document.body.dataset.reviewTheme = currentTheme;
    themeCanvas.style.display = "block";
  } catch {
    themeCanvas.style.display = "none";
  }
}

async function loadTheme() {
  const { data } = await supabase.rpc("get_review_theme");
  currentTheme = POSTER_THEMES.some((t) => t.id === data) ? data : "st";
  paintTheme();
}
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(paintTheme, 250);
});

// ============================================================
let toastTimer = 0;
function showToast(msg, ms = 1800) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), ms);
}

loadTheme();
loadReviews(true);
