import { POSTER_THEMES } from "./poster.js";

const STAR_PATH = "M12 2.5l2.9 6.1 6.6.9-4.8 4.6 1.2 6.6L12 17.5l-5.9 3.2 1.2-6.6L2.5 9.5l6.6-.9z";
const STATUS_LABEL = { pending: "รอตรวจ", published: "แสดงอยู่", hidden: "ซ่อน" };

let sb = null;
let inited = false;
let rows = [];

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function stars(n) {
  let h = '<span class="rv-stars" role="img" aria-label="' + n + ' ดาว">';
  for (let i = 1; i <= 5; i++) {
    h += `<svg class="rv-star ${i <= n ? "on" : "off"}" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="${STAR_PATH}"/></svg>`;
  }
  return h + "</span>";
}

function fmtDate(iso) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
}

async function loadSettings() {
  const { data, error } = await sb.from("review_settings").select("key, value");
  if (error) {
    $("reviewThemeStatus").textContent = "โหลดการตั้งค่าไม่สำเร็จ (ยังไม่ได้รัน review-setup.sql?)";
    return;
  }
  const m = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  $("reviewThemeSelect").value = POSTER_THEMES.some((t) => t.id === m.review_theme) ? m.review_theme : "st";
  $("reviewRequireApproval").checked = m.review_require_approval === "true";
  $("reviewBlockedWords").value = m.blocked_words || "";
}

async function saveSettings() {
  const st = $("reviewSettingsStatus");
  st.textContent = "กำลังบันทึก...";
  const theme = $("reviewThemeSelect").value;
  if (!POSTER_THEMES.some((t) => t.id === theme)) return (st.textContent = "ธีมไม่ถูกต้อง");
  const payload = [
    { key: "review_theme", value: theme },
    { key: "review_require_approval", value: $("reviewRequireApproval").checked ? "true" : "false" },
    { key: "blocked_words", value: $("reviewBlockedWords").value.trim().slice(0, 1000) },
  ];
  const { error } = await sb.from("review_settings").upsert(payload, { onConflict: "key" });
  st.textContent = error ? "บันทึกไม่สำเร็จ: " + error.message : "บันทึกแล้ว ✓";
}

async function saveTheme() {
  const st = $("reviewThemeStatus");
  st.textContent = "กำลังบันทึก...";
  const { error } = await sb
    .from("review_settings")
    .upsert({ key: "review_theme", value: $("reviewThemeSelect").value }, { onConflict: "key" });
  st.textContent = error ? "บันทึกไม่สำเร็จ: " + error.message : "เปลี่ยนธีมแล้ว ✓";
}

function render() {
  const f = $("reviewFilterSelect").value;
  const list = rows.filter((r) => f === "all" || r.status === f);
  const pending = rows.filter((r) => r.status === "pending").length;
  $("reviewCountLabel").textContent = `แสดง ${list.length} จาก ${rows.length} รีวิว` + (pending ? ` · รอตรวจ ${pending}` : "");
  const wrap = $("reviewListWrap");
  if (!list.length) {
    wrap.innerHTML = '<p class="muted" style="text-align:center; padding:30px 0;">ไม่มีรีวิว</p>';
    return;
  }
  wrap.innerHTML = list
    .map(
      (r) => `
    <div class="admin-card" style="padding:14px 16px;" data-id="${esc(r.id)}">
      <div style="display:flex; justify-content:space-between; gap:10px; flex-wrap:wrap; align-items:center;">
        <span class="rv-admin-stars">${stars(Number(r.rating))}</span>
        <span><span class="rv-badge ${esc(r.status)}">${esc(STATUS_LABEL[r.status] || r.status)}</span>
        <span class="muted" style="font-size:12px; margin-left:8px;">${esc(fmtDate(r.created_at))}</span></span>
      </div>
      <p style="margin:10px 0 6px; white-space:pre-wrap; overflow-wrap:anywhere; font-size:14px; line-height:1.6;">${esc(r.content)}</p>
      ${r.flag_reason ? `<p style="margin:0 0 8px; font-size:12px; color:#ffb84d;">⚠ ถูกพักไว้เพราะ: ${esc(r.flag_reason)}</p>` : ""}
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${r.status !== "published" ? '<button type="button" class="icon-btn" data-act="published">อนุมัติ/แสดง</button>' : ""}
        ${r.status !== "hidden" ? '<button type="button" class="icon-btn" data-act="hidden">ซ่อน</button>' : ""}
        <button type="button" class="icon-btn" data-act="delete">ลบถาวร</button>
      </div>
    </div>`
    )
    .join("");
}

async function onListClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest("[data-id]").dataset.id;
  const act = btn.dataset.act;
  btn.disabled = true;
  let error;
  if (act === "delete") {
    if (!window.confirm("ลบรีวิวนี้ถาวร? ย้อนกลับไม่ได้")) return void (btn.disabled = false);
    ({ error } = await sb.from("reviews").delete().eq("id", id));
    if (!error) rows = rows.filter((r) => r.id !== id);
  } else {
    ({ error } = await sb.from("reviews").update({ status: act }).eq("id", id));
    if (!error) rows = rows.map((r) => (r.id === id ? { ...r, status: act } : r));
  }
  if (error) {
    window.alert("ทำรายการไม่สำเร็จ: " + error.message);
    btn.disabled = false;
    return;
  }
  render();
}

async function loadReviews() {
  $("reviewListWrap").innerHTML = '<p class="muted" style="text-align:center; padding:30px 0;">กำลังโหลด...</p>';
  const { data, error } = await sb
    .from("reviews")
    .select("id, rating, content, status, flag_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    $("reviewListWrap").innerHTML = `<p class="error-text">โหลดรีวิวไม่สำเร็จ: ${esc(error.message)}</p>`;
    return;
  }
  rows = data || [];
  render();
}

export async function loadReviewsAdmin(supabase) {
  sb = supabase;
  if (!inited) {
    inited = true;
    $("reviewThemeSelect").innerHTML = POSTER_THEMES.map((t) => `<option value="${t.id}">${esc(t.label)}</option>`).join("");
    $("reviewThemeSelect").addEventListener("change", saveTheme);
    $("reviewSettingsSaveBtn").addEventListener("click", saveSettings);
    $("reviewFilterSelect").addEventListener("change", render);
    $("reviewListWrap").addEventListener("click", onListClick);
  }
  await Promise.all([loadSettings(), loadReviews()]);
}
