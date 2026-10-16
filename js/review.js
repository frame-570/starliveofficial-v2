import { customerSupabase as supabase } from "./supabaseClient.js";
import { REVIEW_THEMES, normalizeTheme, starsSvg, escapeHtml, formatThaiDate } from "./review-themes.js";

const $ = (id) => document.getElementById(id);
const COOLDOWN_MS = 60 * 1000;
const COOLDOWN_KEY = "starlive_review_last";

let rating = 0;

// ---------- ธีม ----------
function applyTheme(id) {
  document.body.dataset.theme = normalizeTheme(id);
}
try { applyTheme(localStorage.getItem("starlive_review_theme")); } catch { /* ignore */ }

async function loadTheme() {
  const { data } = await supabase.from("app_settings").select("review_theme").eq("id", 1).maybeSingle();
  const t = normalizeTheme(data?.review_theme);
  applyTheme(t);
  try { localStorage.setItem("starlive_review_theme", t); } catch { /* ignore */ }
  return t;
}

// ---------- รายการรีวิว ----------
async function loadReviews() {
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, reviewer_name, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  $("rvLoading").style.display = "none";
  if (error) {
    $("rvEmpty").textContent = "โหลดรีวิวไม่สำเร็จ กรุณาลองใหม่";
    $("rvEmpty").style.display = "block";
    return;
  }
  const list = data || [];
  $("rvEmpty").style.display = list.length ? "none" : "block";
  if (!list.length) $("rvEmpty").textContent = "ยังไม่มีรีวิว เป็นคนแรกที่รีวิวเลย!";

  $("rvList").innerHTML = list.map((r) => `
    <article class="rv-card">
      ${starsSvg(r.rating, 22)}
      <p class="rv-card-text">${escapeHtml(r.comment)}</p>
      <div class="rv-card-meta">${escapeHtml(r.reviewer_name || "ลูกค้า")} · ${formatThaiDate(r.created_at)}</div>
    </article>
  `).join("");

  if (list.length) {
    const avg = list.reduce((s, r) => s + r.rating, 0) / list.length;
    $("rvSummary").innerHTML = `${starsSvg(Math.round(avg), 18)} <strong>${avg.toFixed(1)}</strong> <span>จาก ${list.length} รีวิว</span>`;
  } else {
    $("rvSummary").innerHTML = "";
  }
}

// ---------- ฟอร์มเขียนรีวิว ----------
function renderStarInput() {
  const wrap = $("rvStarInput");
  wrap.innerHTML = [1, 2, 3, 4, 5].map((n) => `
    <button type="button" data-n="${n}" aria-label="${n} ดาว">
      <svg class="rv-star ${n <= rating ? "is-on" : ""}" width="38" height="38" viewBox="0 0 24 24"><path d="M12 2.5l2.95 6.1 6.7.9-4.9 4.65 1.2 6.65L12 17.6l-5.95 3.2 1.2-6.65-4.9-4.65 6.7-.9z" stroke-linejoin="round"/></svg>
    </button>`).join("");
  wrap.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => { rating = Number(b.dataset.n); renderStarInput(); updateSubmit(); });
  });
}

function updateSubmit() {
  $("rvSubmit").disabled = !(rating >= 1 && $("rvText").value.trim().length > 0);
}

function openModal() {
  const wait = COOLDOWN_MS - (Date.now() - Number(safeGet(COOLDOWN_KEY) || 0));
  if (wait > 0) { toast(`กรุณารออีก ${Math.ceil(wait / 1000)} วินาที ก่อนส่งรีวิวใหม่`); return; }
  rating = 0;
  $("rvText").value = "";
  $("rvName").value = "";
  $("rvCount").textContent = "0";
  $("rvError").textContent = "";
  renderStarInput();
  updateSubmit();
  $("rvModal").classList.add("open");
  setTimeout(() => $("rvText").focus(), 50);
}
function closeModal() { $("rvModal").classList.remove("open"); }

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

let toastTimer;
function toast(msg) {
  const el = $("rvToast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

$("rvWriteBtn").addEventListener("click", openModal);
$("rvCancel").addEventListener("click", closeModal);
$("rvModal").addEventListener("click", (e) => { if (e.target === $("rvModal")) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
$("rvText").addEventListener("input", () => { $("rvCount").textContent = $("rvText").value.length; updateSubmit(); });

$("rvForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const comment = $("rvText").value.trim();
  if (rating < 1 || !comment) return;
  if ($("rvHp").value) { closeModal(); return; } // บอทกรอกช่องซ่อน

  $("rvSubmit").disabled = true;
  $("rvSubmit").textContent = "กำลังส่ง...";
  $("rvError").textContent = "";

  const { error } = await supabase.from("reviews").insert({
    rating,
    comment,
    reviewer_name: $("rvName").value.trim() || null,
  });

  $("rvSubmit").textContent = "ส่งรีวิว";
  if (error) {
    $("rvError").textContent = "ส่งรีวิวไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    updateSubmit();
    return;
  }
  safeSet(COOLDOWN_KEY, String(Date.now()));
  closeModal();
  toast("ขอบคุณสำหรับรีวิว ⭐");
  loadReviews();
});

// ---------- เริ่มต้น ----------
(async () => {
  loadTheme();
  loadReviews();
})();
