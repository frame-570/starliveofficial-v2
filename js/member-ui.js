// หน้าต่าง "เข้าสู่ระบบโดยตั้งรหัสเอง" (รหัสประจำตัวลูกค้า ST + 6 ตัว)
// ใช้ได้ทุกหน้า: openMemberDialog({ onDone(result) })
import { MEMBER_PREFIX, MEMBER_INFO_POINTS, validateSuffix, suggestSuffix, memberCall, startMemberSession } from "./member.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clean = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);

const COPY_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/></svg>`;

const PREFIX_BOX = `display:flex; align-items:center; justify-content:center; padding:0 14px; font-weight:800; letter-spacing:2px; border:1px solid var(--line,rgba(255,255,255,.18)); border-right:none; border-radius:10px 0 0 10px; background:rgba(242,183,5,.12); color:var(--amber,#f2b705);`;

export function openMemberDialog({ onDone, startView = "info" } = {}) {
  document.getElementById("memberOverlay")?.remove();
  const overlay = document.createElement("div");
  overlay.id = "memberOverlay";
  overlay.className = "modal-overlay";
  overlay.style.cssText = "display:flex; z-index:100002;";
  overlay.innerHTML = `<div class="admin-card modal-card" style="text-align:left; max-width:430px; max-height:92vh; overflow:auto;"><div id="mBody"></div></div>`;
  document.body.appendChild(overlay);
  const body = overlay.querySelector("#mBody");
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const title = (t) => `<h2 class="display" style="font-size:18px; margin:0 0 12px; text-align:center;">${t}</h2>`;
  const errP = `<p id="mErr" class="error-text" style="min-height:18px; margin:8px 0 6px; font-size:13px;"></p>`;
  const setErr = (t) => {
    const el = body.querySelector("#mErr");
    if (el) el.textContent = t || "";
  };

  // ---------- 1) ข้อความอธิบาย ----------
  function viewInfo() {
    body.innerHTML = `
      ${title("เข้าสู่ระบบโดยตั้งรหัสเอง")}
      <div style="background:rgba(242,183,5,0.1); border:1px solid rgba(242,183,5,0.45); border-radius:12px; padding:12px 14px; font-size:13px; line-height:1.75;">
        <strong style="color:var(--amber,#f2b705);">รหัสประจำตัวของลูกค้า</strong>
        <ul style="margin:6px 0 0; padding-left:18px;">${MEMBER_INFO_POINTS.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
      </div>
      <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
        <button type="button" id="mNew" class="btn-marquee" style="margin:0;">ตั้งรหัสใหม่</button>
        <button type="button" id="mHave" class="icon-btn" style="justify-content:center;">ฉันมีรหัสประจำตัวแล้ว</button>
        <button type="button" id="mCancel" class="icon-btn ghost" style="justify-content:center;">ยกเลิก</button>
      </div>`;
    body.querySelector("#mNew").onclick = viewRegister;
    body.querySelector("#mHave").onclick = viewLogin;
    body.querySelector("#mCancel").onclick = close;
  }

  // ---------- 2) ตั้งรหัสใหม่ ----------
  function viewRegister() {
    body.innerHTML = `
      ${title("ตั้งรหัสประจำตัว")}
      <label class="field-label" for="mName">ชื่อ <span class="muted" style="font-size:11px;">(ไว้ให้แอดมินยืนยันตัวตนเวลาเปลี่ยนรหัส)</span></label>
      <input id="mName" class="field-input" maxlength="60" autocomplete="name" style="margin-bottom:10px;" />
      <label class="field-label" for="mLine">LINE ID <span class="muted" style="font-size:11px;">(ไม่บังคับ ไว้ให้แอดมินติดต่อกลับ)</span></label>
      <input id="mLine" class="field-input" maxlength="40" style="margin-bottom:10px;" />
      <label class="field-label" for="mSuffix">รหัสของคุณ (ตั้งเอง 6 ตัว)</label>
      <div style="display:flex; align-items:stretch;">
        <span style="${PREFIX_BOX}">${MEMBER_PREFIX}</span>
        <input id="mSuffix" class="field-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="เช่น KA2P7M" style="flex:1; min-width:0; border-radius:0 10px 10px 0; letter-spacing:3px; font-weight:700; text-transform:uppercase;" />
      </div>
      <p id="mHint" class="muted" style="font-size:12px; line-height:1.6; margin:6px 0 0;">ใช้ตัวอักษรภาษาอังกฤษอย่างน้อย 2 ตัว และตัวเลขอย่างน้อย 1 ตัว (รวม 6 ตัว) ห้ามเรียงลำดับหรือซ้ำกัน เช่น 123456, AAAA11</p>
      <button type="button" id="mRand" class="link-btn" style="margin-top:6px;">สุ่มรหัสให้ฉัน</button>
      ${errP}
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button type="button" id="mGo" class="btn-marquee" style="margin:0;">ตั้งรหัสและเข้าสู่ระบบ</button>
        <button type="button" id="mBack" class="icon-btn ghost" style="justify-content:center;">กลับ</button>
      </div>`;
    const suffix = body.querySelector("#mSuffix");
    const hint = body.querySelector("#mHint");
    const HINT = hint.textContent;
    suffix.addEventListener("input", () => {
      suffix.value = clean(suffix.value);
      const bad = suffix.value.length === 6 ? validateSuffix(suffix.value) : "";
      hint.style.color = bad ? "#ff8a8a" : "";
      hint.textContent = bad || HINT;
    });
    body.querySelector("#mRand").onclick = () => {
      suffix.value = suggestSuffix();
      hint.style.color = "";
      hint.textContent = HINT;
      setErr("");
    };
    body.querySelector("#mBack").onclick = viewInfo;
    const go = body.querySelector("#mGo");
    go.onclick = async () => {
      setErr("");
      const name = body.querySelector("#mName").value.trim();
      const line = body.querySelector("#mLine").value.trim();
      const s = clean(suffix.value);
      if (!name) return setErr("กรุณากรอกชื่อ");
      const bad = validateSuffix(s);
      if (bad) return setErr(bad);
      go.disabled = true;
      go.textContent = "กำลังตั้งรหัส...";
      try {
        const result = await memberCall({ action: "register", code: MEMBER_PREFIX + s, name, line });
        startMemberSession(result);
        viewCreated(result);
      } catch (e) {
        go.disabled = false;
        go.textContent = "ตั้งรหัสและเข้าสู่ระบบ";
        setErr(e.message || "ตั้งรหัสไม่สำเร็จ กรุณาลองใหม่");
      }
    };
    if (startView === "register") suffix.focus();
  }

  // ---------- 3) ตั้งรหัสสำเร็จ ----------
  function viewCreated(result) {
    const code = result.member.code;
    body.innerHTML = `
      ${title("ตั้งรหัสสำเร็จ")}
      <p class="muted" style="font-size:13px; text-align:center; margin:0 0 10px;">รหัสประจำตัวของคุณคือ (จดหรือคัดลอกเก็บไว้)</p>
      <div class="access-code-display" style="font-size:24px; padding:12px; text-align:center;">${esc(code)}</div>
      <button type="button" id="mCopy" class="icon-btn" style="width:100%; justify-content:center; gap:6px; margin-top:10px;">${COPY_SVG}<span>คัดลอกรหัส</span></button>
      <p class="muted" style="font-size:12.5px; line-height:1.7; margin:12px 0 0;">เก็บเป็นความลับ ห้ามแจกผู้อื่น ใครมีรหัสนี้ก็ดูงานที่คุณซื้อได้ทั้งหมด หากลืมหรือหลุด ให้ทักแอดมินเพื่อเปลี่ยนรหัส</p>
      <button type="button" id="mOk" class="btn-marquee" style="margin:14px 0 0;">ไปต่อ</button>`;
    body.querySelector("#mCopy").onclick = (e) => {
      navigator.clipboard?.writeText(code);
      const sp = e.currentTarget.querySelector("span");
      sp.textContent = "คัดลอกแล้ว";
      setTimeout(() => (sp.textContent = "คัดลอกรหัส"), 1500);
    };
    body.querySelector("#mOk").onclick = () => {
      close();
      onDone?.(result);
    };
  }

  // ---------- 4) เข้าสู่ระบบด้วยรหัสเดิม ----------
  function viewLogin() {
    body.innerHTML = `
      ${title("เข้าสู่ระบบด้วยรหัสประจำตัว")}
      <label class="field-label" for="mSuffix">รหัสประจำตัว</label>
      <div style="display:flex; align-items:stretch;">
        <span style="${PREFIX_BOX}">${MEMBER_PREFIX}</span>
        <input id="mSuffix" class="field-input" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6 ตัวที่คุณตั้งไว้" style="flex:1; min-width:0; border-radius:0 10px 10px 0; letter-spacing:3px; font-weight:700; text-transform:uppercase;" />
      </div>
      ${errP}
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button type="button" id="mGo" class="btn-marquee" style="margin:0;">เข้าสู่ระบบ</button>
        <button type="button" id="mBack" class="icon-btn ghost" style="justify-content:center;">กลับ</button>
      </div>
      <p class="muted" style="font-size:12px; text-align:center; margin:10px 0 0;">ลืมรหัส? ทักแอดมินเพื่อให้เปลี่ยนรหัสให้</p>`;
    const suffix = body.querySelector("#mSuffix");
    suffix.addEventListener("input", () => (suffix.value = clean(suffix.value)));
    suffix.addEventListener("keydown", (e) => {
      if (e.key === "Enter") body.querySelector("#mGo").click();
    });
    body.querySelector("#mBack").onclick = viewInfo;
    const go = body.querySelector("#mGo");
    go.onclick = async () => {
      setErr("");
      const s = clean(suffix.value);
      if (s.length !== 6) return setErr("กรุณากรอกรหัสให้ครบ 6 ตัว");
      go.disabled = true;
      go.textContent = "กำลังตรวจสอบ...";
      try {
        const result = await memberCall({ action: "login", code: MEMBER_PREFIX + s });
        startMemberSession(result);
        close();
        onDone?.(result);
      } catch (e) {
        go.disabled = false;
        go.textContent = "เข้าสู่ระบบ";
        let msg = e.message || "เข้าสู่ระบบไม่สำเร็จ";
        if (e.status === 401 && typeof e.body?.attempts_left === "number" && e.body.attempts_left <= 4) msg += ` (เหลืออีก ${e.body.attempts_left} ครั้งก่อนถูกพักชั่วคราว)`;
        setErr(msg);
      }
    };
    suffix.focus();
  }

  if (startView === "login") viewLogin();
  else if (startView === "register") viewRegister();
  else viewInfo();
}
