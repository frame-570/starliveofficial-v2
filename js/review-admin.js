// แท็บ "รีวิว" ในหน้าแอดมิน — ลบ / ซ่อน-แสดง รีวิว และเลือกธีมหน้ารีวิว
import { REVIEW_THEMES, normalizeTheme, starsSvg, escapeHtml, formatThaiDate } from "./review-themes.js";

let wired = false;

export async function loadReviewsAdmin(supabase) {
  const listEl = document.getElementById("reviewListWrap");
  const countEl = document.getElementById("reviewCountLabel");
  const themeSel = document.getElementById("reviewThemeSelect");
  const filterEl = document.getElementById("reviewFilterSelect");

  if (!themeSel.options.length) {
    themeSel.innerHTML = REVIEW_THEMES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  }

  if (!wired) {
    wired = true;
    themeSel.addEventListener("change", async () => {
      const status = document.getElementById("reviewThemeStatus");
      status.textContent = "กำลังบันทึก...";
      const { error } = await supabase.from("app_settings").update({ review_theme: themeSel.value }).eq("id", 1);
      status.textContent = error ? "บันทึกไม่สำเร็จ: " + error.message : "บันทึกแล้ว ✓";
    });
    filterEl.addEventListener("change", () => render());
  }

  listEl.innerHTML = `<p class="muted" style="text-align:center; padding:20px 0;">กำลังโหลด...</p>`;

  const { data: setting } = await supabase.from("app_settings").select("review_theme").eq("id", 1).maybeSingle();
  themeSel.value = normalizeTheme(setting?.review_theme);

  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, comment, reviewer_name, is_hidden, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="error-text">โหลดรีวิวไม่สำเร็จ: ${escapeHtml(error.message)}<br>(ต้องรัน sql/reviews.sql ใน Supabase ก่อน)</p>`;
    return;
  }
  cache = data || [];
  render();

  function render() {
    const f = filterEl.value;
    const rows = cache.filter((r) => f === "all" || (f === "hidden" ? r.is_hidden : !r.is_hidden));
    const avg = cache.length ? (cache.reduce((s, r) => s + r.rating, 0) / cache.length).toFixed(1) : "-";
    countEl.textContent = `ทั้งหมด ${cache.length} รีวิว · เฉลี่ย ${avg} ดาว`;

    if (!rows.length) {
      listEl.innerHTML = `<p class="muted" style="text-align:center; padding:30px 0;">ไม่มีรีวิว</p>`;
      return;
    }
    listEl.innerHTML = "";
    rows.forEach((r) => {
      const row = document.createElement("div");
      row.className = "session-row";
      row.style.opacity = r.is_hidden ? "0.55" : "1";
      row.innerHTML = `
        <div style="min-width:0; flex:1;">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <span class="rv-admin-stars">${starsSvg(r.rating, 16)}</span>
            ${r.is_hidden ? `<span class="muted" style="font-size:11.5px; border:1px solid var(--line); border-radius:999px; padding:1px 8px;">ซ่อนอยู่</span>` : ""}
          </div>
          <div style="margin:6px 0; line-height:1.6; white-space:pre-wrap; word-break:break-word;">${escapeHtml(r.comment)}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(r.reviewer_name || "ลูกค้า")} · ${formatThaiDate(r.created_at)}</div>
        </div>
        <div style="display:flex; gap:8px; flex-shrink:0; align-items:flex-start;">
          <button type="button" class="icon-btn ghost" data-act="toggle">${r.is_hidden ? "แสดง" : "ซ่อน"}</button>
          <button type="button" class="icon-btn" data-act="delete">ลบ</button>
        </div>`;
      row.querySelector('[data-act="toggle"]').addEventListener("click", async () => {
        const { error: e } = await supabase.from("reviews").update({ is_hidden: !r.is_hidden }).eq("id", r.id);
        if (e) return alert("ทำรายการไม่สำเร็จ: " + e.message);
        r.is_hidden = !r.is_hidden;
        render();
      });
      row.querySelector('[data-act="delete"]').addEventListener("click", async () => {
        if (!confirm("ลบรีวิวนี้ถาวร? ไม่สามารถกู้คืนได้")) return;
        const { error: e } = await supabase.from("reviews").delete().eq("id", r.id);
        if (e) return alert("ลบไม่สำเร็จ: " + e.message);
        cache = cache.filter((x) => x.id !== r.id);
        render();
      });
      listEl.appendChild(row);
    });
  }
}
let cache = [];
