import { adminSupabase as supabase } from "./supabaseClient.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

// ============================================================
// Styled confirm/alert modal
// ============================================================
let dialogOverlay = null;

function ensureDialogOverlay() {
  if (dialogOverlay) return dialogOverlay;

  dialogOverlay = document.createElement("div");
  dialogOverlay.className = "modal-overlay";
  dialogOverlay.style.display = "none";
  dialogOverlay.style.zIndex = "99999";
  dialogOverlay.innerHTML = `
    <div class="admin-card modal-card" style="text-align:center;">
      <div id="appDialogIcon" class="verify-icon" style="display:none;"></div>
      <p id="appDialogMessage" style="font-size:14.5px; line-height:1.6; margin:6px 0 22px; white-space:pre-line;"></p>
      <div id="appDialogButtons" style="display:flex; gap:10px; justify-content:center;"></div>
    </div>
  `;
  document.body.appendChild(dialogOverlay);
  return dialogOverlay;
}

function appConfirm(message, { danger = false, confirmText = "ยืนยัน", cancelText = "ยกเลิก" } = {}) {
  const overlay = ensureDialogOverlay();
  const icon = overlay.querySelector("#appDialogIcon");
  const msgEl = overlay.querySelector("#appDialogMessage");
  const btnWrap = overlay.querySelector("#appDialogButtons");

  icon.style.display = "none";
  msgEl.textContent = message;
  btnWrap.innerHTML = `
    <button type="button" class="icon-btn" id="appDialogCancel" style="flex:1;">${cancelText}</button>
    <button type="button" class="btn-marquee" id="appDialogConfirm" style="flex:1; margin:0; ${danger ? "background:linear-gradient(135deg,#ff8a8a,#e8384f); box-shadow:0 10px 30px -8px rgba(232,56,79,0.6);" : ""}">${confirmText}</button>
  `;

  overlay.style.display = "flex";

  return new Promise((resolve) => {
    const cleanup = (result) => {
      overlay.style.display = "none";
      resolve(result);
    };
    overlay.querySelector("#appDialogCancel").onclick = () => cleanup(false);
    overlay.querySelector("#appDialogConfirm").onclick = () => cleanup(true);
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup(false);
    };
  });
}

function appAlert(message, { type = "info" } = {}) {
  const overlay = ensureDialogOverlay();
  const icon = overlay.querySelector("#appDialogIcon");
  const msgEl = overlay.querySelector("#appDialogMessage");
  const btnWrap = overlay.querySelector("#appDialogButtons");

  if (type === "success") {
    icon.style.display = "flex";
    icon.className = "verify-icon verify-icon-success";
    icon.textContent = "✓";
  } else if (type === "error") {
    icon.style.display = "flex";
    icon.className = "verify-icon verify-icon-failed";
    icon.textContent = "✕";
  } else {
    icon.style.display = "none";
  }

  msgEl.textContent = message;
  btnWrap.innerHTML = `<button type="button" class="btn-marquee" id="appDialogOk" style="margin:0; min-width:120px;">ตกลง</button>`;

  overlay.style.display = "flex";

  return new Promise((resolve) => {
    const cleanup = () => {
      overlay.style.display = "none";
      resolve();
    };
    overlay.querySelector("#appDialogOk").onclick = cleanup;
    overlay.onclick = (e) => {
      if (e.target === overlay) cleanup();
    };
  });
}

// ============================================================
// Slip Image Modal
// ============================================================
let slipModalOverlay = null;

function ensureSlipModalOverlay() {
  if (slipModalOverlay) return slipModalOverlay;

  slipModalOverlay = document.createElement("div");
  slipModalOverlay.className = "modal-overlay";
  slipModalOverlay.style.display = "none";
  slipModalOverlay.style.zIndex = "99999";
  slipModalOverlay.innerHTML = `
    <div class="admin-card modal-card" style="width:min(480px, 92vw); text-align:center; padding:16px;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
        <span style="font-family:'Prompt',sans-serif; font-weight:600; font-size:14.5px;">สลิปการโอนเงิน</span>
        <button type="button" id="slipModalClose" class="icon-btn ghost" style="padding:4px 10px;">✕</button>
      </div>
      <img id="slipModalImage" src="" alt="สลิปการโอนเงิน" style="width:100%; max-height:70vh; object-fit:contain; border-radius:10px; background:#0d0d10;" />
      <a id="slipModalOpenNewTab" href="" target="_blank" rel="noopener" class="icon-btn ghost" style="display:inline-block; margin-top:14px; text-decoration:none;">เปิดในแท็บใหม่</a>
    </div>
  `;
  document.body.appendChild(slipModalOverlay);

  slipModalOverlay.querySelector("#slipModalClose").onclick = () => {
    slipModalOverlay.style.display = "none";
  };
  slipModalOverlay.onclick = (e) => {
    if (e.target === slipModalOverlay) slipModalOverlay.style.display = "none";
  };

  return slipModalOverlay;
}

function showSlipModal(imageUrl) {
  const overlay = ensureSlipModalOverlay();
  overlay.querySelector("#slipModalImage").src = imageUrl;
  overlay.querySelector("#slipModalOpenNewTab").href = imageUrl;
  overlay.style.display = "flex";
}

// ============================================================
// Auth Session Helper (ป้องกัน Session หลุด)
// ============================================================
async function ensureAuthSession() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (!session || error) {
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshed.session) {
      await appAlert("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่อีกครั้ง", { type: "error" });
      supabase.auth.signOut();
      location.reload();
      return null;
    }
    return refreshed.session;
  }
  return session;
}

// --- DOM Elements ---
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

// ---------- Login gate (Supabase Auth - Admin Instance) ----------
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
  stopOrdersPolling();
  stopLiveViewersPolling();
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
  authSubtitle.textContent = "สำหรับจัดการงาน ออเดอร์ และการตั้งค่าระบบ";
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
  } catch {
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
    stopOrdersPolling();
    stopLiveViewersPolling();
    dashboard.style.display = "none";
    loginScreen.style.display = "flex";
  }
});

function showDashboard() {
  loginScreen.style.display = "none";
  dashboard.style.display = "block";
  loadEvents();
}

// ============================================================
// Tabs
// ============================================================
document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".admin-tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById("eventsTab").style.display = btn.dataset.tab === "events" ? "block" : "none";
    document.getElementById("ordersTab").style.display = btn.dataset.tab === "orders" ? "block" : "none";
    document.getElementById("manualTab").style.display = btn.dataset.tab === "manual" ? "block" : "none";
    document.getElementById("liveTab").style.display = btn.dataset.tab === "live" ? "block" : "none";

    if (btn.dataset.tab === "orders") {
      loadOrders();
      startOrdersPolling();
    } else {
      stopOrdersPolling();
    }

    if (btn.dataset.tab === "manual") {
      loadManualEventOptions();
    }

    if (btn.dataset.tab === "live") {
      loadLiveViewers();
      startLiveViewersPolling();
    } else {
      stopLiveViewersPolling();
    }
  });
});

// หยุด/เริ่ม poll ใหม่ตามการสลับแท็บของเบราว์เซอร์ (กันยิง request ตอนไม่ได้เปิดหน้าอยู่)
document.addEventListener("visibilitychange", () => {
  const ordersTabActive = document.getElementById("ordersTab").style.display !== "none";
  const liveTabActive = document.getElementById("liveTab").style.display !== "none";
  if (document.hidden) {
    stopOrdersPolling();
    stopLiveViewersPolling();
  } else {
    if (ordersTabActive) startOrdersPolling();
    if (liveTabActive) startLiveViewersPolling();
  }
});

// ============================================================
// Events: Form, Dynamic Days & Packages
// ============================================================
const eventFormCard = document.getElementById("eventFormCard");
const eventFormTitle = document.getElementById("eventFormTitle");
const eventForm = document.getElementById("eventForm");
const eventIdInput = document.getElementById("eventIdInput");
const evTitle = document.getElementById("evTitle");
const evDescription = document.getElementById("evDescription");
const evBannerFile = document.getElementById("evBannerFile");
const evBannerPreview = document.getElementById("evBannerPreview");
const evStatus = document.getElementById("evStatus");
const evRerunMonths = document.getElementById("evRerunMonths");
const dayRows = document.getElementById("dayRows");
const packageRows = document.getElementById("packageRows");
const eventFormError = document.getElementById("eventFormError");
const eventListWrap = document.getElementById("eventListWrap");
const eventEmptyState = document.getElementById("eventEmptyState");

let currentBannerUrl = "";
let dayRowCount = 0;

evBannerFile.addEventListener("change", () => {
  const file = evBannerFile.files[0];
  if (!file) return;
  evBannerPreview.src = URL.createObjectURL(file);
  evBannerPreview.style.display = "block";
});

document.getElementById("addDayBtn").addEventListener("click", () => addDayRow());
document.getElementById("newEventBtn").addEventListener("click", () => openEventForm());
document.getElementById("cancelEventFormBtn").addEventListener("click", () => closeEventForm());

function addDayRow(dayData = {}) {
  dayRowCount++;
  const n = dayRowCount;
  
  const date = dayData.event_date || "";
  const label = dayData.label || "";
  const livePlatform = dayData.live_platform || "";
  const liveYt = dayData.live_youtube_url || "";
  const liveCf = dayData.live_cloudflare_uid || "";
  const rerunPlatform = dayData.rerun_platform || "";
  const rerunYt = dayData.rerun_youtube_url || "";
  const rerunCf = dayData.rerun_cloudflare_uid || "";

  const row = document.createElement("div");
  row.className = "day-row";
  row.style.cssText = "background: rgba(255,255,255,0.02); border: 1px solid var(--border); padding: 14px; border-radius: 8px; margin-bottom: 12px;";
  row.dataset.dayNumber = n;

  row.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
      <span style="font-weight:600; font-size:14px;" class="day-title-label">วันที่ ${n}</span>
      <button type="button" class="icon-btn ghost remove-day-btn" style="padding:4px 10px; font-size:12px;">ลบวันนี้</button>
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
      <input type="date" class="field-input day-date-input" value="${date}" required />
      <input type="text" class="field-input day-label-input" placeholder="ป้ายกำกับ เช่น Day 1 (ไม่บังคับ)" value="${escapeAttr(label)}" />
    </div>

    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:10px; margin-bottom:8px;">
      <select class="field-input day-live-platform">
        <option value="">-- ไลฟ์: ยังไม่ตั้งค่า --</option>
        <option value="youtube" ${livePlatform === "youtube" ? "selected" : ""}>YouTube Live</option>
        <option value="cloudflare" ${livePlatform === "cloudflare" ? "selected" : ""}>Cloudflare Stream</option>
      </select>
      <input type="text" class="field-input day-live-url" placeholder="YouTube URL หรือ Cloudflare UID" value="${escapeAttr(livePlatform === "youtube" ? liveYt : liveCf)}" />
    </div>

    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:10px;">
      <select class="field-input day-rerun-platform">
        <option value="">-- รีรัน: ยังไม่ตั้งค่า --</option>
        <option value="youtube" ${rerunPlatform === "youtube" ? "selected" : ""}>YouTube (รีรัน)</option>
        <option value="cloudflare" ${rerunPlatform === "cloudflare" ? "selected" : ""}>Cloudflare (รีรัน)</option>
      </select>
      <input type="text" class="field-input day-rerun-url" placeholder="YouTube URL หรือ Cloudflare UID" value="${escapeAttr(rerunPlatform === "youtube" ? rerunYt : rerunCf)}" />
    </div>
  `;

  row.querySelector(".remove-day-btn").addEventListener("click", () => {
    row.remove();
    renumberDayRows();
    rebuildPackageRows();
  });

  dayRows.appendChild(row);
  rebuildPackageRows();
}

function renumberDayRows() {
  [...dayRows.children].forEach((row, i) => {
    row.dataset.dayNumber = i + 1;
    row.querySelector(".day-title-label").textContent = `วันที่ ${i + 1}`;
  });
  dayRowCount = dayRows.children.length;
}

function getDaysFromForm() {
  return [...dayRows.children].map((row, i) => {
    const livePlat = row.querySelector(".day-live-platform").value;
    const liveVal = row.querySelector(".day-live-url").value.trim();
    const rerunPlat = row.querySelector(".day-rerun-platform").value;
    const rerunVal = row.querySelector(".day-rerun-url").value.trim();

    return {
      day_number: i + 1,
      event_date: row.querySelector(".day-date-input").value,
      label: row.querySelector(".day-label-input").value.trim() || `วันที่ ${i + 1}`,
      live_platform: livePlat || null,
      live_youtube_url: livePlat === "youtube" ? liveVal : null,
      live_cloudflare_uid: livePlat === "cloudflare" ? liveVal : null,
      rerun_platform: rerunPlat || null,
      rerun_youtube_url: rerunPlat === "youtube" ? rerunVal : null,
      rerun_cloudflare_uid: rerunPlat === "cloudflare" ? rerunVal : null,
    };
  });
}

function rebuildPackageRows() {
  const totalDays = dayRows.children.length;
  const existingValues = {};
  packageRows.querySelectorAll("[data-num-days]").forEach((row) => {
    const n = Number(row.dataset.numDays);
    existingValues[n] = {
      enabled: row.querySelector(".pkg-enable").checked,
      price: row.querySelector(".pkg-price").value,
    };
  });

  packageRows.innerHTML = "";
  [1, 2, 3].forEach((n) => {
    if (n > totalDays) return;
    const prev = existingValues[n] || { enabled: false, price: "" };
    const row = document.createElement("div");
    row.className = "package-row";
    row.dataset.numDays = n;
    row.innerHTML = `
      <label style="display:flex; align-items:center; gap:8px; flex:1; cursor:pointer;">
        <input type="checkbox" class="pkg-enable" ${prev.enabled ? "checked" : ""} />
        <span style="font-size:13.5px;">${n} วัน</span>
      </label>
      <input type="number" min="0" step="1" class="field-input pkg-price" placeholder="ราคา (บาท)" value="${escapeAttr(prev.price)}" style="max-width:140px;" />
    `;
    packageRows.appendChild(row);
  });
}

function openEventForm(event = null) {
  eventFormError.textContent = "";
  eventForm.reset();
  dayRows.innerHTML = "";
  packageRows.innerHTML = "";
  dayRowCount = 0;
  currentBannerUrl = "";
  evBannerPreview.style.display = "none";
  evBannerPreview.src = "";

  if (event) {
    eventFormTitle.textContent = "แก้ไขงาน";
    eventIdInput.value = event.id;
    evTitle.value = event.title;
    evDescription.value = event.description || "";
    evStatus.value = event.status;
    if (evRerunMonths) evRerunMonths.value = event.rerun_duration_months || 6;
    currentBannerUrl = event.banner_url || "";
    if (currentBannerUrl) {
      evBannerPreview.src = currentBannerUrl;
      evBannerPreview.style.display = "block";
    }

    const days = (event.event_days || []).sort((a, b) => a.day_number - b.day_number);
    if (days.length === 0) addDayRow();
    days.forEach((d) => addDayRow(d));

    rebuildPackageRows();
    (event.ticket_packages || []).forEach((pkg) => {
      const row = packageRows.querySelector(`[data-num-days="${pkg.num_days}"]`);
      if (row) {
        row.querySelector(".pkg-enable").checked = true;
        row.querySelector(".pkg-price").value = pkg.price;
      }
    });
  } else {
    eventFormTitle.textContent = "สร้างงานใหม่";
    eventIdInput.value = "";
    evStatus.value = "upcoming";
    if (evRerunMonths) evRerunMonths.value = 6;
    addDayRow();
  }

  eventFormCard.style.display = "block";
  eventFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEventForm() {
  eventFormCard.style.display = "none";
}

function combinations(arr, size) {
  if (size === arr.length) return [arr];
  if (size === 1) return arr.map((x) => [x]);
  const result = [];
  for (let i = 0; i <= arr.length - size; i++) {
    const rest = combinations(arr.slice(i + 1), size - 1);
    rest.forEach((r) => result.push([arr[i], ...r]));
  }
  return result;
}

// ------------------------------------------------------------
// บันทึก / แก้ไข Event
// ------------------------------------------------------------
eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  eventFormError.textContent = "";

  const session = await ensureAuthSession();
  if (!session) return;

  const days = getDaysFromForm();
  if (days.length === 0) {
    eventFormError.textContent = "กรุณาเพิ่มวันจัดงานอย่างน้อย 1 วัน";
    return;
  }
  if (days.some((d) => !d.event_date)) {
    eventFormError.textContent = "กรุณาเลือกวันที่ให้ครบทุกแถว";
    return;
  }

  const enabledPackages = [...packageRows.querySelectorAll("[data-num-days]")]
    .filter((row) => row.querySelector(".pkg-enable").checked)
    .map((row) => ({
      num_days: Number(row.dataset.numDays),
      price: Number(row.querySelector(".pkg-price").value),
    }));

  if (enabledPackages.length === 0) {
    eventFormError.textContent = "กรุณาเปิดใช้งานแพ็กเกจอย่างน้อย 1 แบบ พร้อมราคา";
    return;
  }
  if (enabledPackages.some((p) => !p.price || p.price <= 0)) {
    eventFormError.textContent = "กรุณากรอกราคาของแพ็กเกจที่เปิดใช้งานให้ครบ";
    return;
  }

  const saveBtn = document.getElementById("saveEventBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "กำลังบันทึก...";

  try {
    let bannerUrl = currentBannerUrl;
    const file = evBannerFile.files[0];
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("event-banners").upload(path, file, { upsert: false });
      if (uploadError) throw new Error("อัปโหลดโปสเตอร์ไม่สำเร็จ");
      const { data: publicUrlData } = supabase.storage.from("event-banners").getPublicUrl(path);
      bannerUrl = publicUrlData.publicUrl;
    }

    const rerunMonthsVal = Number(evRerunMonths.value) || 6;
    const eventPayload = {
      title: evTitle.value.trim(),
      description: evDescription.value.trim() || null,
      banner_url: bannerUrl || null,
      status: evStatus.value,
      viewing_duration_months: rerunMonthsVal,
      rerun_duration_months: rerunMonthsVal,
    };

    const eventId = eventIdInput.value;
    let savedEventId = eventId;

    if (eventId) {
      const { error } = await supabase.from("events").update(eventPayload).eq("id", eventId);
      if (error) throw new Error(error.message);
    } else {
      const { data, error } = await supabase.from("events").insert(eventPayload).select().single();
      if (error) throw new Error(error.message);
      savedEventId = data.id;
    }

    await supabase.from("event_days").delete().eq("event_id", savedEventId);
    const { data: insertedDays, error: daysError } = await supabase
      .from("event_days")
      .insert(days.map((d) => ({ ...d, event_id: savedEventId })))
      .select();
    if (daysError) throw new Error(daysError.message);

    const enabledNumDaysList = enabledPackages.map((p) => p.num_days);
    const { data: existingPkgs } = await supabase
      .from("ticket_packages")
      .select("id, num_days")
      .eq("event_id", savedEventId);

    if (existingPkgs) {
      for (const ep of existingPkgs) {
        if (!enabledNumDaysList.includes(ep.num_days)) {
          await supabase.from("ticket_package_day_options").delete().eq("package_id", ep.id);
          const { error: delPkgErr } = await supabase.from("ticket_packages").delete().eq("id", ep.id);
          if (delPkgErr) {
            console.warn("ไม่สามารถลบแพ็กเกจที่มีออเดอร์อ้างอิงได้");
          }
        }
      }
    }

    const sortedDays = insertedDays.sort((a, b) => a.day_number - b.day_number);

    for (const pkg of enabledPackages) {
      const { data: pkgRow, error: pkgError } = await supabase
        .from("ticket_packages")
        .upsert(
          { event_id: savedEventId, num_days: pkg.num_days, price: pkg.price },
          { onConflict: "event_id, num_days" }
        )
        .select()
        .single();
      if (pkgError) throw new Error(pkgError.message);

      await supabase.from("ticket_package_day_options").delete().eq("package_id", pkgRow.id);

      const combos = combinations(sortedDays, pkg.num_days);
      const optionRows = combos.map((combo) => ({
        package_id: pkgRow.id,
        day_numbers: combo.map((d) => d.day_number),
        label:
          combo.length === sortedDays.length && sortedDays.length > 1
            ? `ทุกวัน (${combo.length} วัน)`
            : `วันที่ ${combo.map((d) => d.day_number).join("+")}`,
      }));

      const { error: optError } = await supabase.from("ticket_package_day_options").insert(optionRows);
      if (optError) throw new Error(optError.message);
    }

    closeEventForm();
    await loadEvents();
    
    // ✅ แสดง Pop-up สำเร็จ
    await appAlert(eventId ? "แก้ไขงานสำเร็จเรียบร้อยแล้ว!" : "สร้างงานใหม่สำเร็จเรียบร้อยแล้ว!", { type: "success" });

  } catch (err) {
    eventFormError.textContent = err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่";
    await appAlert("บันทึกไม่สำเร็จ: " + (err.message || "เกิดข้อผิดพลาด"), { type: "error" });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "บันทึกงาน";
  }
});

async function loadEvents() {
  const { data, error } = await supabase
    .from("events")
    .select("*, event_days(*), ticket_packages(*)")
    .order("created_at", { ascending: false });

  if (error) {
    eventListWrap.innerHTML = `<p class="error-text">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
    return;
  }

  eventListWrap.innerHTML = "";
  eventEmptyState.style.display = data.length === 0 ? "block" : "none";
  data.forEach((ev) => eventListWrap.appendChild(renderEventRow(ev)));
}

const STATUS_LABELS = { upcoming: "กำลังจะถึง", live: "กำลังถ่ายทอดสด", rerun: "รีรัน", ended: "ปิดแล้ว" };

function renderEventRow(ev) {
  const row = document.createElement("div");
  row.className = "session-row";

  const days = (ev.event_days || []).sort((a, b) => a.day_number - b.day_number);
  const dateRange = days.length ? `${days[0].event_date} ถึง ${days[days.length - 1].event_date}` : "ยังไม่กำหนดวัน";
  const prices = (ev.ticket_packages || []).map((p) => Number(p.price));
  const priceLabel = prices.length ? `เริ่มต้น ${Math.min(...prices).toLocaleString("th-TH")}฿` : "ยังไม่ตั้งราคา";

  row.innerHTML = `
    <div style="min-width:0;">
      <div style="font-family:'Prompt',sans-serif; font-weight:600; font-size:15px; margin-bottom:6px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${escapeHtml(ev.title)}
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
        <span class="muted" style="font-size:12px;">${escapeHtml(dateRange)}</span>
        <span class="muted" style="font-size:12px;">${escapeHtml(priceLabel)}</span>
      </div>
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap;">
      <select class="field-input status-select" style="padding:8px 10px; width:auto;">
        ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${ev.status === v ? "selected" : ""}>${l}</option>`).join("")}
      </select>
      <button class="icon-btn ghost" data-action="edit">แก้ไข</button>
      <button class="icon-btn" data-action="delete">ลบ</button>
    </div>
  `;

  // เปลี่ยนสถานะ Event
  row.querySelector(".status-select").addEventListener("change", async (e) => {
    const session = await ensureAuthSession();
    if (!session) return;

    const newStatus = e.target.value;
    const { error } = await supabase.from("events").update({ status: newStatus }).eq("id", ev.id);
    
    if (error) {
      await appAlert("อัปเดตสถานะไม่สำเร็จ: " + error.message, { type: "error" });
      loadEvents();
    } else {
      await appAlert(`เปลี่ยนสถานะงานเป็น "${STATUS_LABELS[newStatus]}" สำเร็จ`, { type: "success" });
      loadEvents();
    }
  });

  row.querySelector('[data-action="edit"]').addEventListener("click", () => openEventForm(ev));

  row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    const session = await ensureAuthSession();
    if (!session) return;

    const ok = await appConfirm(`ลบงาน "${ev.title}" ใช่หรือไม่?\n(ออเดอร์ที่เกี่ยวข้องจะถูกลบด้วย)`, { danger: true, confirmText: "ลบงานนี้" });
    if (!ok) return;

    const { error } = await supabase.from("events").delete().eq("id", ev.id);
    if (error) {
      await appAlert("ลบงานไม่สำเร็จ: " + error.message, { type: "error" });
    } else {
      await appAlert("ลบงานเรียบร้อยแล้ว", { type: "success" });
      loadEvents();
    }
  });

  return row;
}

// ============================================================
// Orders tab
// ============================================================
const ORDER_STATUS_LABELS = {
  pending_payment: "รอชำระเงิน",
  verifying: "กำลังตรวจสอบสลิป",
  paid: "ชำระเงินสำเร็จ",
  failed: "ตรวจสอบไม่สำเร็จ",
  cancelled: "ยกเลิก",
};

document.getElementById("orderStatusFilter").addEventListener("change", loadOrders);

// ---------- Auto-refresh: poll ออเดอร์ใหม่ทุก 10 วิ เฉพาะตอนเปิด tab นี้อยู่ ----------
const ORDERS_POLL_MS = 10000;
let ordersPollTimer = null;

function startOrdersPolling() {
  if (ordersPollTimer) return; // กันตั้งซ้ำ
  ordersPollTimer = setInterval(() => {
    loadOrders({ silent: true });
  }, ORDERS_POLL_MS);
}

function stopOrdersPolling() {
  if (ordersPollTimer) {
    clearInterval(ordersPollTimer);
    ordersPollTimer = null;
  }
}

async function loadOrders({ silent = false } = {}) {
  const listEl = document.getElementById("adminOrderList");
  const emptyEl = document.getElementById("orderEmptyState");
  const filter = document.getElementById("orderStatusFilter").value;

  let query = supabase
    .from("orders")
    .select("*, events(title), ticket_packages(num_days), ticket_package_day_options(label)")
    .order("created_at", { ascending: false })
    .limit(100);

  if (filter) query = query.eq("status", filter);

  const { data, error } = await query;

  if (error) {
    if (!silent) {
      listEl.innerHTML = `<p class="error-text">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
    }
    return;
  }

  listEl.innerHTML = "";
  emptyEl.style.display = data.length === 0 ? "block" : "none";
  data.forEach((order) => listEl.appendChild(renderOrderRow(order)));
}

function renderOrderRow(order) {
  const row = document.createElement("div");
  row.className = "session-row";
  row.style.alignItems = "flex-start";

  const created = new Date(order.created_at).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });

  row.innerHTML = `
    <div style="min-width:0;">
      <div style="font-family:'Prompt',sans-serif; font-weight:600; font-size:14.5px; margin-bottom:6px;">
        ${escapeHtml(order.order_number)} — ${escapeHtml(order.events?.title || "-")}
      </div>
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap; font-size:12px;" class="muted">
        <span>${order.ticket_packages?.num_days || "-"} วัน (${escapeHtml(order.ticket_package_day_options?.label || "-")})</span>
        <span>${Number(order.amount).toLocaleString("th-TH")}฿</span>
        <span>${created}</span>
        ${order.access_code ? `<span class="pin-chip">${escapeHtml(order.access_code)}</span>` : ""}
      </div>
      ${order.status === "failed" && order.verification_reason ? `<p class="error-text" style="margin:6px 0 0;">${escapeHtml(order.verification_reason)}</p>` : ""}
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-shrink:0;">
      <span class="status-pill status-${escapeHtml(order.status)}" style="font-size:12.5px;">${ORDER_STATUS_LABELS[order.status] || order.status}</span>
      ${order.slip_image_url ? `<button class="icon-btn ghost" data-action="view-slip">ดูสลิป</button>` : ""}
      ${order.status !== "paid" && order.status !== "cancelled" ? `<button class="icon-btn" data-action="manual-approve" style="border-color:#46c882; color:#46c882;">อนุมัติด้วยมือ</button>` : ""}
      <button class="icon-btn ghost" data-action="delete-order" style="border-color:var(--crimson); color:var(--crimson);">ลบ</button>
    </div>
  `;

  const slipBtn = row.querySelector('[data-action="view-slip"]');
  if (slipBtn) {
    slipBtn.addEventListener("click", async () => {
      const originalText = slipBtn.textContent;
      slipBtn.disabled = true;
      slipBtn.textContent = "กำลังโหลด...";

      const { data, error } = await supabase.storage.from("payment-slips").createSignedUrl(order.slip_image_url, 120);

      slipBtn.disabled = false;
      slipBtn.textContent = originalText;

      if (error || !data?.signedUrl) {
        await appAlert("เปิดรูปสลิปไม่สำเร็จ: " + (error?.message || "ไม่พบไฟล์ในระบบ"), { type: "error" });
        return;
      }

      showSlipModal(data.signedUrl);
    });
  }

  const approveBtn = row.querySelector('[data-action="manual-approve"]');
  if (approveBtn) {
    approveBtn.addEventListener("click", async () => {
      const session = await ensureAuthSession();
      if (!session) return;

      const ok = await appConfirm(
        `ยืนยันว่าตรวจสลิปของออเดอร์ ${order.order_number} ด้วยตาแล้วว่าเป็นสลิปจริง\nและต้องการออกรหัสเข้าชมให้ลูกค้าใช่หรือไม่?`,
        { confirmText: "อนุมัติ" }
      );
      if (!ok) return;

      approveBtn.disabled = true;
      approveBtn.textContent = "กำลังอนุมัติ...";

      let body;
      try {
        const res = await fetch(`${FUNCTIONS_URL}/admin-approve-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId: order.id }),
        });
        body = await res.json();
        if (!res.ok || !body.success) throw new Error(body.detail || body.error || "อนุมัติไม่สำเร็จ");
      } catch (err) {
        await appAlert("อนุมัติไม่สำเร็จ: " + err.message, { type: "error" });
        approveBtn.disabled = false;
        approveBtn.textContent = "อนุมัติด้วยมือ";
        return;
      }

      await appAlert(`ออกรหัสเข้าชมให้ลูกค้าสำเร็จแล้ว!\nรหัสเข้าชมคือ: ${body.access_code}`, { type: "success" });
      loadOrders();
    });
  }

  const deleteBtn = row.querySelector('[data-action="delete-order"]');
  deleteBtn.addEventListener("click", async () => {
    const session = await ensureAuthSession();
    if (!session) return;

    const warning =
      order.status === "paid"
        ? `⚠️ ออเดอร์นี้จ่ายเงินแล้วและมีรหัสเข้าชม ${order.access_code} อยู่\nลบแล้วลูกค้าจะดูไม่ได้อีกเลย\nยืนยันลบ ${order.order_number} ใช่หรือไม่?`
        : `ยืนยันลบออเดอร์ ${order.order_number} ใช่หรือไม่?\n(ลบแล้วกู้คืนไม่ได้)`;
    const ok = await appConfirm(warning, { danger: true, confirmText: "ลบออเดอร์นี้" });
    if (!ok) return;

    deleteBtn.disabled = true;
    const { error } = await supabase.from("orders").delete().eq("id", order.id);
    if (error) {
      await appAlert("ลบไม่สำเร็จ: " + error.message, { type: "error" });
      deleteBtn.disabled = false;
      return;
    }
    await appAlert(`ลบออเดอร์ ${order.order_number} เรียบร้อยแล้ว`, { type: "success" });
    loadOrders();
  });

  return row;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, "&quot;");
}

// ============================================================
// ออกรหัสไลน์ (Manual order — แอดมินตรวจสลิปเองผ่านแชท)
// ============================================================
const manualEventSelect = document.getElementById("manualEventSelect");
const manualPackageSelect = document.getElementById("manualPackageSelect");
const manualDayOptionSelect = document.getElementById("manualDayOptionSelect");
const manualCustomerNote = document.getElementById("manualCustomerNote");
const manualOrderForm = document.getElementById("manualOrderForm");
const manualOrderError = document.getElementById("manualOrderError");
const manualOrderSubmitBtn = document.getElementById("manualOrderSubmitBtn");

const manualResultOverlay = document.getElementById("manualResultOverlay");
const manualResultText = document.getElementById("manualResultText");
const manualResultCloseBtn = document.getElementById("manualResultCloseBtn");
const manualResultCopyBtn = document.getElementById("manualResultCopyBtn");

let manualEventsCache = [];

async function loadManualEventOptions() {
  manualOrderError.textContent = "";
  const { data, error } = await supabase
    .from("events")
    .select("id, title, status, event_days(day_number, event_date), ticket_packages(id, num_days, price, ticket_package_day_options(id, day_numbers, label))")
    .order("created_at", { ascending: false });

  if (error) {
    manualOrderError.textContent = "โหลดรายการงานไม่สำเร็จ: " + error.message;
    return;
  }

  manualEventsCache = data || [];

  manualEventSelect.innerHTML =
    `<option value="">-- เลือกงาน --</option>` +
    manualEventsCache.map((ev) => `<option value="${escapeAttr(ev.id)}">${escapeHtml(ev.title)}</option>`).join("");

  manualPackageSelect.innerHTML = `<option value="">-- เลือกงานก่อน --</option>`;
  manualPackageSelect.disabled = true;
  manualDayOptionSelect.innerHTML = `<option value="">-- เลือกแพ็กเกจก่อน --</option>`;
  manualDayOptionSelect.disabled = true;
}

manualEventSelect.addEventListener("change", () => {
  const ev = manualEventsCache.find((e) => e.id === manualEventSelect.value);
  manualDayOptionSelect.innerHTML = `<option value="">-- เลือกแพ็กเกจก่อน --</option>`;
  manualDayOptionSelect.disabled = true;

  if (!ev || !ev.ticket_packages?.length) {
    manualPackageSelect.innerHTML = `<option value="">-- งานนี้ยังไม่มีแพ็กเกจ --</option>`;
    manualPackageSelect.disabled = true;
    return;
  }

  manualPackageSelect.innerHTML =
    `<option value="">-- เลือกแพ็กเกจ --</option>` +
    ev.ticket_packages
      .map((p) => `<option value="${escapeAttr(p.id)}">${p.num_days} วัน — ${Number(p.price).toLocaleString("th-TH")}฿</option>`)
      .join("");
  manualPackageSelect.disabled = false;
});

manualPackageSelect.addEventListener("change", () => {
  const ev = manualEventsCache.find((e) => e.id === manualEventSelect.value);
  const pkg = ev?.ticket_packages?.find((p) => p.id === manualPackageSelect.value);

  if (!pkg || !pkg.ticket_package_day_options?.length) {
    manualDayOptionSelect.innerHTML = `<option value="">-- ไม่มีตัวเลือกรอบวัน --</option>`;
    manualDayOptionSelect.disabled = true;
    return;
  }

  manualDayOptionSelect.innerHTML =
    `<option value="">-- เลือกรอบวันที่ --</option>` +
    pkg.ticket_package_day_options
      .map((opt) => `<option value="${escapeAttr(opt.id)}">${escapeHtml(opt.label)}</option>`)
      .join("");
  manualDayOptionSelect.disabled = false;
});

manualOrderForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  manualOrderError.textContent = "";

  const session = await ensureAuthSession();
  if (!session) return;

  const eventId = manualEventSelect.value;
  const packageId = manualPackageSelect.value;
  const dayOptionId = manualDayOptionSelect.value;

  if (!eventId || !packageId || !dayOptionId) {
    manualOrderError.textContent = "กรุณาเลือกงาน/แพ็กเกจ/รอบวันที่ให้ครบ";
    return;
  }

  manualOrderSubmitBtn.disabled = true;
  manualOrderSubmitBtn.textContent = "กำลังออกรหัส...";

  let body;
  try {
    const res = await fetch(`${FUNCTIONS_URL}/admin-issue-manual-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        eventId,
        packageId,
        dayOptionId,
        customerNote: manualCustomerNote.value.trim() || null,
      }),
    });
    body = await res.json();
    if (!res.ok || !body.success) throw new Error(body.detail || body.error || "ออกรหัสไม่สำเร็จ");
  } catch (err) {
    manualOrderError.textContent = err.message;
    manualOrderSubmitBtn.disabled = false;
    manualOrderSubmitBtn.textContent = "ออกรหัส";
    return;
  }

  manualOrderSubmitBtn.disabled = false;
  manualOrderSubmitBtn.textContent = "ออกรหัส";

  showManualResult(body);

  manualOrderForm.reset();
  manualPackageSelect.innerHTML = `<option value="">-- เลือกงานก่อน --</option>`;
  manualPackageSelect.disabled = true;
  manualDayOptionSelect.innerHTML = `<option value="">-- เลือกแพ็กเกจก่อน --</option>`;
  manualDayOptionSelect.disabled = true;
});

function showManualResult(result) {
  const watchUrl = `${window.location.origin}/watch?code=${result.access_code}`;
  const expiresLabel = new Date(result.access_code_expires_at).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const message = [
    `🎫 STAR LIVE OFFICIAL`,
    ``,
    `คอนเสิร์ต: ${result.event_title}`,
    `วันที่จัดงาน: ${result.event_date_label || "-"}`,
    `แพ็กเกจ: ${result.package_num_days} วัน (${result.day_option_label})`,
    ``,
    `รหัสเข้าชม: ${result.access_code}`,
    `ลิงก์เข้าชม (ใช้ดูได้ทั้งถ่ายทอดสดและรีรัน): ${watchUrl}`,
    ``,
    `📅 ใช้งานได้ถึงวันที่: ${expiresLabel}`,
    ``,
    `ขอบคุณที่อุดหนุน STAR LIVE OFFICIAL ครับ 💛`,
  ].join("\n");

  manualResultText.value = message;
  manualResultOverlay.style.display = "flex";
}

manualResultCloseBtn.addEventListener("click", () => {
  manualResultOverlay.style.display = "none";
});
manualResultOverlay.addEventListener("click", (e) => {
  if (e.target === manualResultOverlay) manualResultOverlay.style.display = "none";
});
manualResultCopyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(manualResultText.value);
  } catch {
    manualResultText.select();
    document.execCommand("copy");
  }
  const original = manualResultCopyBtn.textContent;
  manualResultCopyBtn.textContent = "คัดลอกแล้ว!";
  setTimeout(() => (manualResultCopyBtn.textContent = original), 1500);
});

// ============================================================
// กำลังดูอยู่ตอนนี้ (Live viewers — อิงจาก viewing_sessions ที่ heartbeat จริง)
// ============================================================
const LIVE_VIEWERS_POLL_MS = 10000;
const HEARTBEAT_TIMEOUT_SECONDS = 30; // ต้องตรงกับค่าใน Edge Function verify-access-code/heartbeat
let liveViewersPollTimer = null;

function startLiveViewersPolling() {
  if (liveViewersPollTimer) return;
  liveViewersPollTimer = setInterval(() => loadLiveViewers({ silent: true }), LIVE_VIEWERS_POLL_MS);
}

function stopLiveViewersPolling() {
  if (liveViewersPollTimer) {
    clearInterval(liveViewersPollTimer);
    liveViewersPollTimer = null;
  }
}

async function loadLiveViewers({ silent = false } = {}) {
  const countEl = document.getElementById("liveViewerCount");
  const listEl = document.getElementById("liveViewerList");
  const emptyEl = document.getElementById("liveViewerEmptyState");

  const cutoff = new Date(Date.now() - HEARTBEAT_TIMEOUT_SECONDS * 1000).toISOString();

  const { data, error } = await supabase
    .from("viewing_sessions")
    .select("*, orders(order_number, access_code, events(title))")
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false });

  if (error) {
    if (!silent) {
      listEl.innerHTML = `<p class="error-text">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
    }
    return;
  }

  const sessions = data || [];
  countEl.textContent = sessions.length;

  listEl.innerHTML = "";
  emptyEl.style.display = sessions.length === 0 ? "block" : "none";

  sessions.forEach((s) => {
    const watchedSeconds = Math.max(0, Math.floor((Date.now() - new Date(s.created_at).getTime()) / 1000));
    const watchedLabel =
      watchedSeconds < 60 ? `${watchedSeconds} วินาที` : `${Math.floor(watchedSeconds / 60)} นาที`;

    const row = document.createElement("div");
    row.className = "session-row";
    row.innerHTML = `
      <div style="min-width:0;">
        <div style="font-family:'Prompt',sans-serif; font-weight:600; font-size:14.5px; margin-bottom:4px;">
          ${escapeHtml(s.orders?.events?.title || "-")} — วันที่ ${s.day_number}
        </div>
        <div class="muted" style="font-size:12px;">
          ${escapeHtml(s.orders?.order_number || "-")} · รหัส ${escapeHtml(s.orders?.access_code || "-")} · ดูมาแล้ว ${watchedLabel}
        </div>
      </div>
      <span class="status-pill" style="color:#46c882; font-size:12.5px; flex-shrink:0;">🟢 กำลังดู</span>
    `;
    listEl.appendChild(row);
  });
}

// ============================================================
// Settings Modal (ปุ่มตั้งค่าระบบ ⚙️)
// ============================================================
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
const shopNameInput = document.getElementById("shopNameInput");
const lineOaInput = document.getElementById("lineOaInput");
const lineOpenchatUrlInput = document.getElementById("lineOpenchatUrlInput");
const lineOpenchatMessageInput = document.getElementById("lineOpenchatMessageInput");
const tiktokUrlInput = document.getElementById("tiktokUrlInput");
const watchRulesNoticeInput = document.getElementById("watchRulesNoticeInput");

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

  const { data: appData, error: appError } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();

  if (appError) {
    settingsError.textContent = "โหลดการตั้งค่าไม่สำเร็จ: " + appError.message;
    return;
  }

  promptpayIdInput.value = appData?.promptpay_id || "";
  promptpayNameInput.value = appData?.promptpay_name || "";
  shopNameInput.value = appData?.shop_name || "";
  lineOaInput.value = appData?.line_oa_url || "";
  lineOpenchatUrlInput.value = appData?.line_openchat_url || "";
  lineOpenchatMessageInput.value = appData?.line_openchat_message || "";
  tiktokUrlInput.value = appData?.tiktok_url || "";

  const { data: sysData } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", "watch_rules_notice")
    .maybeSingle();

  watchRulesNoticeInput.value = sysData?.value || "1. ห้ามบันทึกภาพหน้าจอหรือนำคลิปไปเผยแพร่โดยไม่ได้รับอนุญาต\n2. รหัสเข้าชมใช้งานได้ทีละ 1 เครื่องเท่านั้น\n3. หากมีการเข้าใช้งานซ้อน ระบบจะตัดการเชื่อมต่อทันที";
}

function closeSettings() {
  settingsOverlay.style.display = "none";
}

settingsForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  settingsError.textContent = "";
  settingsSaved.textContent = "";

  const session = await ensureAuthSession();
  if (!session) return;

  saveSettingsBtn.disabled = true;
  saveSettingsBtn.textContent = "กำลังบันทึก...";

  try {
    const payload = {
      id: 1,
      promptpay_id: promptpayIdInput.value.trim() || null,
      promptpay_name: promptpayNameInput.value.trim() || null,
      shop_name: shopNameInput.value.trim() || null,
      line_oa_url: lineOaInput.value.trim() || null,
      line_openchat_url: lineOpenchatUrlInput.value.trim() || null,
      line_openchat_message: lineOpenchatMessageInput.value.trim() || null,
      tiktok_url: tiktokUrlInput.value.trim() || null,
    };

    const { error: appErr } = await supabase.from("app_settings").upsert(payload);
    if (appErr) throw new Error("บันทึกข้อมูลทั่วไปไม่สำเร็จ: " + appErr.message);

    const watchRulesValue = watchRulesNoticeInput.value.trim();
    const { error: sysErr } = await supabase
      .from("system_settings")
      .upsert({ key: "watch_rules_notice", value: watchRulesValue, updated_at: new Date() });

    if (sysErr) throw new Error("บันทึกกฎไม่สำเร็จ: " + sysErr.message);

    closeSettings();
    await appAlert("บันทึกการตั้งค่าระบบเรียบร้อยแล้ว!", { type: "success" });

  } catch (err) {
    settingsError.textContent = err.message;
    await appAlert(err.message, { type: "error" });
  } finally {
    saveSettingsBtn.disabled = false;
    saveSettingsBtn.textContent = "บันทึกการตั้งค่า";
  }
});
