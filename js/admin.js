import { supabase } from "./supabaseClient.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

const loginScreen = document.getElementById("loginScreen");
const dashboard = document.getElementById("dashboard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginBtn = document.getElementById("loginBtn");

const signupForm = document.getElementById("signupForm");
const signupError = document.getElementById("signupError");
const signupBtn = document.getElementById("signupBtn");
const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");

const formCard = document.getElementById("formCard");
const formTitle = document.getElementById("formTitle");
const sessionForm = document.getElementById("sessionForm");
const sessionIdInput = document.getElementById("sessionId");
const titleInput = document.getElementById("titleInput");
const platformSelect = document.getElementById("platformSelect");
const youtubeField = document.getElementById("youtubeField");
const cloudflareField = document.getElementById("cloudflareField");
const urlInput = document.getElementById("urlInput");
const cfUidInput = document.getElementById("cfUidInput");
const pinInput = document.getElementById("pinInput");
const activeToggle = document.getElementById("activeToggle");
const formError = document.getElementById("formError");
const sessionList = document.getElementById("sessionList");
const emptyState = document.getElementById("emptyState");

platformSelect.addEventListener("change", () => togglePlatformFields(platformSelect.value));

function togglePlatformFields(platform) {
  const isCloudflare = platform === "cloudflare";
  youtubeField.style.display = isCloudflare ? "none" : "block";
  cloudflareField.style.display = isCloudflare ? "block" : "none";
}

// ---------- Login gate (Supabase Auth) ----------
const { data: { session } } = await supabase.auth.getSession();
if (session) showDashboard();

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginBtn.disabled = true;
  loginBtn.textContent = "กำลังเข้าสู่ระบบ...";

  const email = document.getElementById("adminEmail").value.trim();
  const password = document.getElementById("adminPassword").value;
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  loginBtn.disabled = false;
  loginBtn.textContent = "เข้าสู่ระบบ";

  if (error) {
    loginError.textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    return;
  }
  showDashboard();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  location.reload();
});

document.getElementById("showSignup").addEventListener("click", (e) => {
  e.preventDefault();
  loginForm.style.display = "none";
  signupForm.style.display = "block";
  authTitle.textContent = "สมัครสมาชิกแอดมิน";
  authSubtitle.textContent = "ต้องมีรหัสเชิญจากผู้ดูแลระบบเท่านั้น";
});

document.getElementById("showLogin").addEventListener("click", (e) => {
  e.preventDefault();
  signupForm.style.display = "none";
  loginForm.style.display = "block";
  authTitle.textContent = "เข้าสู่ระบบผู้ดูแล";
  authSubtitle.textContent = "สำหรับควบคุมการถ่ายทอดสดและรหัส PIN";
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signupError.textContent = "";

  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  const passwordConfirm = document.getElementById("signupPasswordConfirm").value;
  const inviteCode = document.getElementById("inviteCode").value.trim();

  if (password.length < 8) {
    signupError.textContent = "รหัสผ่านต้องมีอย่างน้อย 8 ตัว";
    return;
  }
  if (password !== passwordConfirm) {
    signupError.textContent = "รหัสผ่านทั้งสองช่องไม่ตรงกัน";
    return;
  }

  signupBtn.disabled = true;
  signupBtn.textContent = "กำลังสมัครสมาชิก...";

  let res, body;
  try {
    res = await fetch(`${FUNCTIONS_URL}/admin-signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ email, password, inviteCode }),
    });
    body = await res.json();
  } catch (err) {
    signupBtn.disabled = false;
    signupBtn.textContent = "สมัครสมาชิก";
    signupError.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง";
    return;
  }

  signupBtn.disabled = false;
  signupBtn.textContent = "สมัครสมาชิก";

  if (!res.ok) {
    const messages = {
      invalid_invite_code: "รหัสเชิญไม่ถูกต้อง",
      already_registered: "อีเมลนี้สมัครไว้แล้ว กรุณาเข้าสู่ระบบแทน",
      weak_password: "รหัสผ่านต้องมีอย่างน้อย 8 ตัว",
      missing_fields: "กรุณากรอกข้อมูลให้ครบ",
    };
    signupError.textContent = messages[body.error] || "สมัครไม่สำเร็จ กรุณาลองใหม่";
    return;
  }

  const { error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
  if (loginErr) {
    signupForm.reset();
    document.getElementById("showLogin").click();
    return;
  }
  showDashboard();
});

supabase.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") {
    dashboard.style.display = "none";
    loginScreen.style.display = "flex";
  }
});

function showDashboard() {
  loginScreen.style.display = "none";
  dashboard.style.display = "block";
  loadSessions();
}

// ---------- Session form open/close ----------
document.getElementById("newSessionBtn").addEventListener("click", () => openForm());
document.getElementById("cancelFormBtn").addEventListener("click", () => closeForm());

function openForm(session = null) {
  formError.textContent = "";
  if (session) {
    formTitle.textContent = "แก้ไขไลฟ์";
    sessionIdInput.value = session.id;
    titleInput.value = session.title;
    platformSelect.value = session.platform || "youtube";
    urlInput.value = session.youtube_url || "";
    cfUidInput.value = session.cloudflare_uid || "";
    pinInput.value = session.pin;
    setToggle(session.is_active);
  } else {
    formTitle.textContent = "สร้างไลฟ์ใหม่";
    sessionForm.reset();
    sessionIdInput.value = "";
    platformSelect.value = "youtube";
    setToggle(false);
  }
  togglePlatformFields(platformSelect.value);
  formCard.style.display = "block";
  formCard.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeForm() {
  formCard.style.display = "none";
  sessionForm.reset();
}

// ---------- Active toggle ----------
let toggleState = false;
function setToggle(state) {
  toggleState = state;
  activeToggle.classList.toggle("on", state);
}
activeToggle.addEventListener("click", () => setToggle(!toggleState));

// ---------- Random PIN ----------
document.getElementById("randomPinBtn").addEventListener("click", () => {
  pinInput.value = String(Math.floor(100000 + Math.random() * 900000));
});

// ---------- Save (create or update) ----------
sessionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";

  const pin = pinInput.value.trim();
  if (!/^\d{6}$/.test(pin)) {
    formError.textContent = "รหัส PIN ต้องเป็นตัวเลข 6 หลัก";
    return;
  }

  const platform = platformSelect.value;
  const payload = {
    title: titleInput.value.trim(),
    platform,
    youtube_url: platform === "youtube" ? urlInput.value.trim() : null,
    cloudflare_uid: platform === "cloudflare" ? cfUidInput.value.trim() : null,
    pin,
    is_active: toggleState,
  };

  if (platform === "youtube" && !payload.youtube_url) {
    formError.textContent = "กรุณาวางลิงก์ YouTube Live";
    return;
  }
  if (platform === "cloudflare" && !payload.cloudflare_uid) {
    formError.textContent = "กรุณากรอก Cloudflare Stream UID";
    return;
  }

  const id = sessionIdInput.value;
  const query = id
    ? supabase.from("live_sessions").update(payload).eq("id", id)
    : supabase.from("live_sessions").insert(payload);

  const { error } = await query;

  if (error) {
    formError.textContent = error.message.includes("duplicate")
      ? "รหัส PIN นี้ถูกใช้งานแล้ว กรุณาเลือกรหัสอื่น"
      : "เกิดข้อผิดพลาด: " + error.message;
    return;
  }

  closeForm();
  loadSessions();
});

// ---------- List + row actions ----------
async function loadSessions() {
  const { data, error } = await supabase
    .from("live_sessions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    sessionList.innerHTML = `<p class="error-text">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    return;
  }

  sessionList.innerHTML = "";
  emptyState.style.display = data.length === 0 ? "block" : "none";
  data.forEach((s) => sessionList.appendChild(renderRow(s)));
}

function renderRow(s) {
  const row = document.createElement("div");
  row.className = "session-row";

  const created = new Date(s.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

  row.innerHTML = `
    <div style="min-width:0;">
      <div style="font-family:'Prompt',sans-serif; font-weight:600; font-size:15px; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${escapeHtml(s.title)}
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="pin-chip">${s.pin}</span>
        <span class="muted" style="font-size:12px;">${s.platform === "cloudflare" ? "Cloudflare Stream" : "YouTube"}</span>
        <span class="muted" style="font-size:12px;">สร้างเมื่อ ${created}</span>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
      <button class="icon-btn ghost" data-action="copy">คัดลอก PIN</button>
      <button class="toggle ${s.is_active ? "on" : ""}" data-action="toggle" title="เปิด/ปิดการถ่ายทอดสด"></button>
      <button class="icon-btn ghost" data-action="edit">แก้ไข</button>
      <button class="icon-btn" data-action="delete">ลบ</button>
    </div>
  `;

  row.querySelector('[data-action="copy"]').addEventListener("click", () => {
    navigator.clipboard.writeText(s.pin);
    const btn = row.querySelector('[data-action="copy"]');
    const original = btn.textContent;
    btn.textContent = "คัดลอกแล้ว";
    setTimeout(() => (btn.textContent = original), 1200);
  });

  row.querySelector('[data-action="toggle"]').addEventListener("click", async () => {
    await supabase.from("live_sessions").update({ is_active: !s.is_active }).eq("id", s.id);
    loadSessions();
  });

  row.querySelector('[data-action="edit"]').addEventListener("click", () => openForm(s));

  row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm(`ลบไลฟ์ "${s.title}" ใช่หรือไม่?`)) return;
    await supabase.from("live_sessions").delete().eq("id", s.id);
    loadSessions();
  });

  return row;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Settings modal (ปุ่มฟันเฟือง) ----------
const settingsBtn = document.getElementById("settingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsForm = document.getElementById("settingsForm");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
const saveSettingsBtn = document.getElementById("saveSettingsBtn");
const settingsError = document.getElementById("settingsError");
const settingsSaved = document.getElementById("settingsSaved");
const promptpayIdInput = document.getElementById("promptpayIdInput");
const promptpayNameInput = document.getElementById("promptpayNameInput");
const lineOaInput = document.getElementById("lineOaInput");

settingsBtn.addEventListener("click", openSettings);
closeSettingsBtn.addEventListener("click", closeSettings);
cancelSettingsBtn.addEventListener("click", closeSettings);
settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) closeSettings();
});

async function openSettings() {
  settingsError.textContent = "";
  settingsSaved.textContent = "";
  settingsOverlay.style.display = "flex";

  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    settingsError.textContent = "โหลดการตั้งค่าไม่สำเร็จ: " + error.message;
    return;
  }

  promptpayIdInput.value = data?.promptpay_id || "";
  promptpayNameInput.value = data?.promptpay_name || "";
  lineOaInput.value = data?.line_oa_url || "";
}

function closeSettings() {
  settingsOverlay.style.display = "none";
}

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  settingsError.textContent = "";
  settingsSaved.textContent = "";
  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = "กำลังบันทึก...";

  const payload = {
    id: 1,
    promptpay_id: promptpayIdInput.value.trim() || null,
    promptpay_name: promptpayNameInput.value.trim() || null,
    line_oa_url: lineOaInput.value.trim() || null,
  };

  const { error } = await supabase.from("app_settings").upsert(payload);

  saveSettingsBtn.disabled = false;
  saveSettingsBtn.textContent = "บันทึกการตั้งค่า";

  if (error) {
    settingsError.textContent = "บันทึกไม่สำเร็จ: " + error.message;
    return;
  }

  settingsSaved.textContent = "บันทึกเรียบร้อยแล้ว";
  setTimeout(() => (settingsSaved.textContent = ""), 2000);
});
