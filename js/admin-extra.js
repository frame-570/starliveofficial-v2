// ส่วนเสริมของหน้าแอดมิน: (1) สถิติการใช้งาน (ในปุ่มฟันเฟือง)  (2) จัดการรหัสประจำตัวลูกค้า (แท็บ "สมาชิก")
import { adminSupabase as supabase } from "./supabaseClient.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const nf = (n) => Number(n || 0).toLocaleString("th-TH");

// =====================================================================
// 1) สถิติการใช้งาน
// =====================================================================
const RANGES = [
  { key: "1", label: "1 วัน", days: 1, unit: "hour", hint: "24 ชั่วโมงล่าสุด (รายชั่วโมง)" },
  { key: "7", label: "7 วัน", days: 7, unit: "day", hint: "7 วันล่าสุด (รายวัน)" },
  { key: "15", label: "15 วัน", days: 15, unit: "day", hint: "15 วันล่าสุด (รายวัน)" },
  { key: "30", label: "30 วัน", days: 30, unit: "day", hint: "30 วันล่าสุด (รายวัน)" },
  { key: "183", label: "6 เดือน", days: 183, unit: "week", hint: "6 เดือนล่าสุด (รายสัปดาห์)" },
  { key: "365", label: "1 ปี", days: 365, unit: "month", hint: "12 เดือนล่าสุด (รายเดือน)" },
];

// หน้าที่เลือกดูได้ (ค่าเริ่มต้น = หน้าเลือกงาน)
const PAGES = [
  ["/", "หน้าเลือกงาน (หน้าแรก)"],
  ["*", "ทุกหน้ารวมกัน"],
  ["/event-detail", "หน้ารายละเอียดงาน"],
  ["/promotion", "หน้าโปรโมชั่น (/promotion)"],
  ["/review", "หน้ารีวิว (/review)"],
  ["/login", "หน้าเข้าสู่ระบบ"],
  ["/payment", "หน้าชำระเงิน"],
  ["/orders", "หน้าประวัติการสั่งซื้อ"],
  ["/watch", "หน้ารับชม"],
  ["/cardshop", "หน้า Card Shop"],
  ["/admin", "หน้าแอดมิน"],
];
const PAGE_LABEL = Object.fromEntries(PAGES);
PAGE_LABEL["/cardshop-admin"] = "หน้าแอดมิน Card Shop";

const MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

function bucketLabel(b, unit) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(b || "");
  if (!m) return b || "";
  const [, y, mo, d, h] = m;
  if (unit === "hour") return `${h}:00`;
  if (unit === "month") return `${MONTHS[Number(mo) - 1]} ${String((Number(y) + 543) % 100).padStart(2, "0")}`;
  return `${Number(d)} ${MONTHS[Number(mo) - 1]}`;
}

export function initStats() {
  const root = document.getElementById("statsRoot");
  if (!root) return { open() {} };
  const state = { range: "7", path: "/", eventNames: null };
  const rangeBtns = root.querySelector("#statsRanges");
  const pageSel = root.querySelector("#statsPage");
  const out = root.querySelector("#statsOut");

  rangeBtns.innerHTML = RANGES.map((r) => `<button type="button" class="icon-btn ghost" data-range="${r.key}">${r.label}</button>`).join("");
  pageSel.innerHTML = PAGES.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join("");

  const paintRange = () =>
    rangeBtns.querySelectorAll("button").forEach((b) => {
      const on = b.dataset.range === state.range;
      b.style.borderColor = on ? "var(--amber,#f2b705)" : "";
      b.style.color = on ? "var(--amber,#f2b705)" : "";
      b.style.fontWeight = on ? "700" : "";
    });

  rangeBtns.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-range]");
    if (!b) return;
    state.range = b.dataset.range;
    load();
  });
  pageSel.addEventListener("change", () => {
    state.path = pageSel.value;
    load();
  });

  async function eventNames() {
    if (state.eventNames) return state.eventNames;
    const map = new Map();
    const { data } = await supabase.from("events").select("id, slug, title");
    for (const e of data || []) {
      map.set(String(e.id), e.title);
      if (e.slug) map.set(String(e.slug).toLowerCase(), e.title);
    }
    state.eventNames = map;
    return map;
  }

  async function load() {
    paintRange();
    pageSel.value = state.path;
    const r = RANGES.find((x) => x.key === state.range);
    out.innerHTML = `<p class="muted" style="text-align:center; padding:24px 0;">กำลังโหลด...</p>`;
    const { data, error } = await supabase.rpc("stats_report", { p_days: r.days, p_unit: r.unit, p_path: state.path });
    if (error) {
      out.innerHTML = `<p class="error-text">โหลดสถิติไม่สำเร็จ: ${esc(error.message)}<br><span class="muted" style="font-size:12px;">(ถ้ายังไม่เคยรัน setup-member-code-and-stats.sql ใน Supabase ให้รันก่อน)</span></p>`;
      return;
    }
    const names = await eventNames();
    render(data, r, names);
  }

  function render(d, r, names) {
    const t = d.totals || {};
    const series = d.series || [];
    const max = Math.max(1, ...series.map((s) => Math.max(s.cv, s.av)));
    const pageName = PAGE_LABEL[state.path] || (state.path === "*" ? "ทุกหน้ารวมกัน" : state.path);

    const card = (title, views, people, color) => `
      <div style="flex:1; min-width:140px; border:1px solid var(--line,rgba(255,255,255,.16)); border-radius:12px; padding:12px 14px; border-top:3px solid ${color};">
        <div class="muted" style="font-size:12px;">${title}</div>
        <div style="font-size:24px; font-weight:800; line-height:1.2;">${nf(views)} <span style="font-size:12px; font-weight:500;" class="muted">ครั้ง</span></div>
        <div class="muted" style="font-size:12px;">${nf(people)} คน (นับต่อเบราว์เซอร์)</div>
      </div>`;

    const barW = series.length > 40 ? 6 : series.length > 20 ? 10 : 16;
    const every = Math.max(1, Math.ceil(series.length / 8));
    const bars = series
      .map((s, i) => {
        const hc = Math.round((s.cv / max) * 100);
        const ha = Math.round((s.av / max) * 100);
        const lab = bucketLabel(s.b, r.unit);
        return `<div title="${esc(lab)} · ลูกค้า ${nf(s.cv)} ครั้ง (${nf(s.cu)} คน) · แอดมิน ${nf(s.av)} ครั้ง" style="flex:1; min-width:${barW}px; display:flex; flex-direction:column; align-items:center; justify-content:flex-end;">
          <div style="display:flex; align-items:flex-end; gap:1px; height:120px; width:100%; justify-content:center;">
            <div style="width:${Math.max(3, Math.floor(barW / 2))}px; height:${s.cv ? Math.max(hc, 2) : 0}%; background:var(--amber,#f2b705); border-radius:2px 2px 0 0;"></div>
            <div style="width:${Math.max(3, Math.floor(barW / 2))}px; height:${s.av ? Math.max(ha, 2) : 0}%; background:#5b9dff; border-radius:2px 2px 0 0;"></div>
          </div>
          <div class="muted" style="font-size:10px; height:14px; margin-top:4px; white-space:nowrap;">${i % every === 0 ? esc(lab) : "&nbsp;"}</div>
        </div>`;
      })
      .join("");

    const pagesRows = (d.pages || [])
      .map(
        (p) => `<tr data-path="${esc(p.path)}" style="cursor:pointer;">
          <td style="padding:6px 4px;">${esc(PAGE_LABEL[p.path] || p.path)}</td>
          <td style="text-align:right; padding:6px 4px;">${nf(p.cv)} <span class="muted" style="font-size:11px;">(${nf(p.cu)} คน)</span></td>
          <td style="text-align:right; padding:6px 4px;">${nf(p.av)}</td></tr>`
      )
      .join("");

    const detailRows = (d.details || [])
      .map((x) => {
        const name = names.get(String(x.detail).toLowerCase()) || names.get(String(x.detail)) || x.detail;
        return `<tr><td style="padding:6px 4px;">${esc(name)}</td><td style="text-align:right; padding:6px 4px;">${nf(x.views)} <span class="muted" style="font-size:11px;">(${nf(x.visitors)} คน)</span></td></tr>`;
      })
      .join("");

    out.innerHTML = `
      <p class="muted" style="font-size:12.5px; margin:0 0 10px;">${esc(pageName)} · ${esc(r.hint)}</p>
      <div style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px;">
        ${card("ลูกค้าเข้าใช้งาน", t.cv, t.cu, "var(--amber,#f2b705)")}
        ${card("แอดมินเข้าใช้งาน", t.av, t.au, "#5b9dff")}
      </div>
      <div style="display:flex; gap:14px; font-size:12px; margin-bottom:6px;" class="muted">
        <span><i style="display:inline-block; width:10px; height:10px; background:var(--amber,#f2b705); border-radius:2px;"></i> ลูกค้า</span>
        <span><i style="display:inline-block; width:10px; height:10px; background:#5b9dff; border-radius:2px;"></i> แอดมิน</span>
      </div>
      <div style="display:flex; align-items:flex-end; gap:2px; overflow-x:auto; padding-bottom:4px;">${bars || `<span class="muted">ยังไม่มีข้อมูล</span>`}</div>

      <h4 class="display" style="font-size:14px; margin:18px 0 6px;">แยกตามหน้า <span class="muted" style="font-size:11.5px; font-weight:400;">(กดที่แถวเพื่อดูหน้านั้น)</span></h4>
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead><tr class="muted" style="font-size:11.5px;"><th style="text-align:left; padding:4px;">หน้า</th><th style="text-align:right; padding:4px;">ลูกค้า (ครั้ง)</th><th style="text-align:right; padding:4px;">แอดมิน (ครั้ง)</th></tr></thead>
        <tbody>${pagesRows || `<tr><td colspan="3" class="muted" style="padding:10px 4px;">ยังไม่มีข้อมูล</td></tr>`}</tbody>
      </table>

      ${
        detailRows
          ? `<h4 class="display" style="font-size:14px; margin:18px 0 6px;">งานที่คนเปิดดูมากสุด (ลูกค้า)</h4>
      <table style="width:100%; border-collapse:collapse; font-size:13px;"><tbody>${detailRows}</tbody></table>`
          : ""
      }
      <p class="muted" style="font-size:11.5px; line-height:1.6; margin:14px 0 0;">นับ 1 ครั้งต่อ 1 หน้าต่อ 1 เซสชัน (รีเฟรชซ้ำภายใน 30 นาทีไม่นับ) · "คน" นับจากเบราว์เซอร์ จึงเป็นค่าประมาณ · เบราว์เซอร์ที่ล็อกอินแอดมินอยู่จะนับเป็นแอดมิน</p>`;

    out.querySelectorAll("tr[data-path]").forEach((tr) =>
      tr.addEventListener("click", () => {
        if (!PAGE_LABEL[tr.dataset.path]) return;
        state.path = tr.dataset.path;
        load();
      })
    );
  }

  return { open: load };
}

// =====================================================================
// 2) รหัสประจำตัวลูกค้า (แท็บ "สมาชิก")
// =====================================================================
async function memberFn(payload) {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error("หมดเวลาเข้าสู่ระบบ กรุณารีเฟรชหน้า");
  const res = await fetch(`${FUNCTIONS_URL}/member-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail || body.error || "ทำรายการไม่สำเร็จ");
  return body;
}

// หน้าต่างของเว็บเอง (แทน prompt ของเบราว์เซอร์) — คืน null = ยกเลิก, "" = ให้ระบบสุ่ม, อื่นๆ = 6 ตัวที่ระบุ
function askNewCode(m) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex; z-index:100003;";
    overlay.innerHTML = `<div class="admin-card modal-card" style="text-align:left; max-width:420px;">
      <h2 class="display" style="font-size:18px; margin:0 0 6px; text-align:center;">เปลี่ยนรหัสให้ลูกค้า</h2>
      <p class="muted" style="font-size:13px; text-align:center; margin:0 0 14px;">${esc(m.name)} · <b style="color:var(--amber,#f2b705); letter-spacing:1.5px;">${esc(m.code)}</b></p>
      <label class="field-label" for="ncSuffix">รหัสใหม่ (6 ตัวหลัง ST ที่ลูกค้าแจ้ง)</label>
      <div style="display:flex; align-items:stretch;">
        <span style="display:flex; align-items:center; padding:0 14px; font-weight:800; letter-spacing:2px; border:1px solid var(--line,rgba(255,255,255,.18)); border-right:none; border-radius:10px 0 0 10px; background:rgba(242,183,5,.12); color:var(--amber,#f2b705);">ST</span>
        <input id="ncSuffix" class="field-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="เว้นว่าง = ให้ระบบสุ่มให้" style="flex:1; min-width:0; border-radius:0 10px 10px 0; letter-spacing:3px; font-weight:700; text-transform:uppercase;" />
      </div>
      <p class="muted" style="font-size:12px; line-height:1.6; margin:8px 0 0;">ต้องมีตัวอักษรอังกฤษอย่างน้อย 2 ตัวและตัวเลขอย่างน้อย 1 ตัว · การเปลี่ยนรหัสจะออกจากระบบทุกเครื่องที่ใช้รหัสเดิมอยู่</p>
      <p id="ncErr" class="error-text" style="min-height:18px; margin:8px 0 6px; font-size:13px;"></p>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button type="button" id="ncOk" class="btn-marquee" style="margin:0;">เปลี่ยนรหัส</button>
        <button type="button" id="ncCancel" class="icon-btn ghost" style="justify-content:center;">ยกเลิก</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("#ncSuffix");
    const done = (v) => {
      overlay.remove();
      resolve(v);
    };
    input.addEventListener("input", () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") overlay.querySelector("#ncOk").click();
    });
    overlay.querySelector("#ncOk").onclick = () => {
      const s = input.value;
      if (s && s.length !== 6) {
        overlay.querySelector("#ncErr").textContent = "ต้องกรอกให้ครบ 6 ตัว หรือเว้นว่างให้ระบบสุ่มให้";
        return;
      }
      done(s);
    };
    overlay.querySelector("#ncCancel").onclick = () => done(null);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) done(null);
    });
    input.focus();
  });
}

export function initCodeMembers() {
  const root = document.getElementById("codeMembersRoot");
  if (!root) return { load() {} };
  const listEl = root.querySelector("#codeMemberList");
  const countEl = root.querySelector("#codeMemberCount");
  const search = document.getElementById("memberSearchInput");
  const toggle = document.getElementById("codeMembersToggle");
  const userWrap = document.getElementById("userMembersWrap");
  const userCount = document.getElementById("memberCountLabel");
  const userPlaceholder = search.placeholder;
  let codeView = false;

  // สลับมุมมอง: รายชื่อสมาชิก <-> รหัสประจำตัวลูกค้า (ช่องค้นหาด้านบนใช้ร่วมกัน)
  function setView(on) {
    codeView = on;
    userWrap.style.display = on ? "none" : "block";
    root.style.display = on ? "block" : "none";
    userCount.style.display = on ? "none" : "";
    search.placeholder = on ? "ค้นหารหัส / ชื่อ / LINE..." : userPlaceholder;
    toggle.style.borderColor = on ? "var(--amber,#f2b705)" : "";
    toggle.style.color = on ? "var(--amber,#f2b705)" : "";
    toggle.textContent = on ? "← กลับรายชื่อสมาชิก" : "รหัสประจำตัวลูกค้า";
    search.value = "";
    search.dispatchEvent(new Event("input"));
    if (on) load();
  }
  toggle.addEventListener("click", () => setView(!codeView));
  const banner = root.querySelector("#codeMemberBanner");
  let cache = [];

  const fmt = (v) => (v ? new Date(v).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : "-");

  function showBanner(html) {
    banner.style.display = "block";
    banner.innerHTML = html;
    banner.querySelector("[data-copy]")?.addEventListener("click", (e) => {
      navigator.clipboard?.writeText(e.currentTarget.dataset.copy);
      e.currentTarget.textContent = "คัดลอกแล้ว";
    });
  }

  function paint() {
    const term = search.value.trim().toLowerCase();
    const rows = !term ? cache : cache.filter((m) => [m.code, m.name, m.line].some((v) => String(v || "").toLowerCase().includes(term)));
    countEl.textContent = `ทั้งหมด ${cache.length} รหัส`;
    if (!rows.length) {
      listEl.innerHTML = `<p class="muted" style="text-align:center; padding:24px 0;">${cache.length ? "ไม่พบรหัสที่ตรงกับคำค้นหา" : "ยังไม่มีลูกค้าตั้งรหัสประจำตัว"}</p>`;
      return;
    }
    listEl.innerHTML = rows
      .map(
        (m) => `<div class="session-row" style="${m.disabled ? "opacity:.6;" : ""}">
        <div style="min-width:0;">
          <div style="font-family:'Prompt',sans-serif; font-weight:600; font-size:14.5px; margin-bottom:4px;">
            ${esc(m.name)} <span style="color:var(--amber,#f2b705); letter-spacing:1.5px; margin-left:6px;">${esc(m.code)}</span>
            ${m.disabled ? `<span class="muted" style="font-size:11.5px;"> · ระงับอยู่</span>` : ""}
          </div>
          <div class="muted" style="font-size:12px;">LINE: ${esc(m.line || "-")} · ซื้อสำเร็จ ${m.orders_paid}/${m.orders_total} ออเดอร์ · เปลี่ยนรหัสแล้ว ${m.reset_count} ครั้ง</div>
          <div class="muted" style="font-size:12px; margin-top:2px;">ตั้งเมื่อ ${esc(fmt(m.created_at))} · เข้าล่าสุด ${esc(fmt(m.last_login_at))}</div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="icon-btn" data-act="reset" data-id="${esc(m.id)}">เปลี่ยนรหัสให้</button>
          <button type="button" class="icon-btn ghost" data-act="toggle" data-id="${esc(m.id)}">${m.disabled ? "เปิดใช้" : "ระงับ"}</button>
        </div>
      </div>`
      )
      .join("");
  }

  listEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const m = cache.find((x) => x.id === btn.dataset.id);
    if (!m) return;
    btn.disabled = true;
    try {
      if (btn.dataset.act === "reset") {
        const input = await askNewCode(m);
        if (input === null) return;
        const s = input.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
        const r = await memberFn({ action: "admin-reset", memberId: m.id, newCode: s ? (s.startsWith("ST") && s.length === 8 ? s : "ST" + s) : undefined });
        showBanner(`รหัสใหม่ของ <b>${esc(m.name)}</b> คือ <b style="letter-spacing:2px; color:var(--amber,#f2b705);">${esc(r.code)}</b> <button type="button" class="icon-btn ghost" data-copy="${esc(r.code)}" style="padding:3px 10px; margin-left:6px;">คัดลอก</button><br><span class="muted" style="font-size:12px;">ส่งให้ลูกค้าทาง LINE แล้วให้ลูกค้าใช้รหัสนี้เข้าสู่ระบบใหม่</span>`);
      } else {
        await memberFn({ action: "admin-disable", memberId: m.id, disabled: !m.disabled });
      }
      await load();
    } catch (err) {
      showBanner(`<span style="color:#ff8a8a;">ทำรายการไม่สำเร็จ: ${esc(err.message)}</span>`);
    } finally {
      btn.disabled = false;
    }
  });
  search.addEventListener("input", () => {
    if (codeView) paint();
  });

  async function load() {
    try {
      const r = await memberFn({ action: "admin-list" });
      cache = r.members || [];
      paint();
    } catch (err) {
      listEl.innerHTML = `<p class="error-text">โหลดรายการรหัสไม่สำเร็จ: ${esc(err.message)}<br><span class="muted" style="font-size:12px;">(ต้องสร้าง Edge Function "member-code" และรัน setup-member-code-and-stats.sql ก่อน)</span></p>`;
    }
  }
  return { load };
}
