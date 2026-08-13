Import { supabase } from "./supabaseClient.js";
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
    if (btn.dataset.tab === "orders") loadOrders();
  });
});

// ============================================================
// Events: form open/close, dynamic day + package rows
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
const evViewingMonths = document.getElementById("evViewingMonths");
const evRerunMonths = document.getElementById("evRerunMonths");
const evLivePlatform = document.getElementById("evLivePlatform");
const evLiveYoutubeUrl = document.getElementById("evLiveYoutubeUrl");
const evLiveCfUid = document.getElementById("evLiveCfUid");
const evRerunPlatform = document.getElementById("evRerunPlatform");
const evRerunYoutubeUrl = document.getElementById("evRerunYoutubeUrl");
const evRerunCfUid = document.getElementById("evRerunCfUid");
const dayRows = document.getElementById("dayRows");
const packageRows = document.getElementById("packageRows");
const eventFormError = document.getElementById("eventFormError");
const eventListWrap = document.getElementById("eventListWrap");
const eventEmptyState = document.getElementById("eventEmptyState");

let currentBannerUrl = "";
let dayRowCount = 0;

function togglePlatformField(select, youtubeField, cfField) {
  const v = select.value;
  youtubeField.style.display = v === "youtube" ? "block" : "none";
  cfField.style.display = v === "cloudflare" ? "block" : "none";
}
evLivePlatform.addEventListener("change", () =>
  togglePlatformField(evLivePlatform, document.getElementById("evLiveYoutubeField"), document.getElementById("evLiveCfField"))
);
evRerunPlatform.addEventListener("change", () =>
  togglePlatformField(evRerunPlatform, document.getElementById("evRerunYoutubeField"), document.getElementById("evRerunCfField"))
);

evBannerFile.addEventListener("change", () => {
  const file = evBannerFile.files[0];
  if (!file) return;
  evBannerPreview.src = URL.createObjectURL(file);
  evBannerPreview.style.display = "block";
});

document.getElementById("addDayBtn").addEventListener("click", () => addDayRow());
document.getElementById("newEventBtn").addEventListener("click", () => openEventForm());
document.getElementById("cancelEventFormBtn").addEventListener("click", () => closeEventForm());

function addDayRow(date = "", label = "") {
  dayRowCount++;
  const n = dayRowCount;
  const row = document.createElement("div");
  row.className = "day-row";
  row.dataset.dayNumber = n;
  row.innerHTML = `
    <span class="muted" style="font-size:12.5px; flex-shrink:0;">วันที่ ${n}</span>
    <input type="date" class="field-input day-date-input" value="${date}" style="flex:1;" required />
    <input type="text" class="field-input day-label-input" placeholder="ป้ายกำกับ (ไม่บังคับ)" value="${escapeAttr(label)}" style="flex:1;" />
    <button type="button" class="icon-btn ghost remove-day-btn" style="flex-shrink:0; padding:0 12px;">ลบ</button>
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
    row.querySelector("span").textContent = `วันที่ ${i + 1}`;
  });
  dayRowCount = dayRows.children.length;
}

function getDaysFromForm() {
  return [...dayRows.children].map((row, i) => ({
    day_number: i + 1,
    event_date: row.querySelector(".day-date-input").value,
    label: row.querySelector(".day-label-input").value.trim() || `วันที่ ${i + 1}`,
  }));
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
    evViewingMonths.value = event.viewing_duration_months;
    evRerunMonths.value = event.rerun_duration_months;
    currentBannerUrl = event.banner_url || "";
    if (currentBannerUrl) {
      evBannerPreview.src = currentBannerUrl;
      evBannerPreview.style.display = "block";
    }

    evLivePlatform.value = event.live_platform || "";
    evLiveYoutubeUrl.value = event.live_youtube_url || "";
    evLiveCfUid.value = event.live_cloudflare_uid || "";
    evRerunPlatform.value = event.rerun_platform || "";
    evRerunYoutubeUrl.value = event.rerun_youtube_url || "";
    evRerunCfUid.value = event.rerun_cloudflare_uid || "";

    const days = (event.event_days || []).sort((a, b) => a.day_number - b.day_number);
    if (days.length === 0) addDayRow();
    days.forEach((d) => addDayRow(d.event_date, d.label));

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
    evViewingMonths.value = 6;
    evRerunMonths.value = 6;
    addDayRow();
  }

  togglePlatformField(evLivePlatform, document.getElementById("evLiveYoutubeField"), document.getElementById("evLiveCfField"));
  togglePlatformField(evRerunPlatform, document.getElementById("evRerunYoutubeField"), document.getElementById("evRerunCfField"));

  eventFormCard.style.display = "block";
  eventFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function closeEventForm() {
  eventFormCard.style.display = "none";
}

// ---------- Save event ----------
eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  eventFormError.textContent = "";

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
    // ---------- อัปโหลดโปสเตอร์ถ้ามีไฟล์ใหม่ ----------
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

    const eventPayload = {
      title: evTitle.value.trim(),
      description: evDescription.value.trim() || null,
      banner_url: bannerUrl || null,
      status: evStatus.value,
      viewing_duration_months: Number(evViewingMonths.value) || 6,
      rerun_duration_months: Number(evRerunMonths.value) || 6,
      live_platform: evLivePlatform.value || null,
      live_youtube_url: evLivePlatform.value === "youtube" ? evLiveYoutubeUrl.value.trim() || null : null,
      live_cloudflare_uid: evLivePlatform.value === "cloudflare" ? evLiveCfUid.value.trim() || null : null,
      rerun_platform: evRerunPlatform.value || null,
      rerun_youtube_url: evRerunPlatform.value === "youtube" ? evRerunYoutubeUrl.value.trim() || null : null,
      rerun_cloudflare_uid: evRerunPlatform.value === "cloudflare" ? evRerunCfUid.value.trim() || null : null,
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

    // ---------- Sync event_days (ลบของเดิมแล้วสร้างใหม่) ----------
    await supabase.from("event_days").delete().eq("event_id", savedEventId);
    const { data: insertedDays, error: daysError } = await supabase
      .from("event_days")
      .insert(days.map((d) => ({ ...d, event_id: savedEventId })))
      .select();
    if (daysError) throw new Error(daysError.message);

    // ---------- Sync ticket_packages + day options ----------
    // 1. ดึงแพ็กเกจเดิมทั้งหมดของ event นี้ขึ้นมาเพื่อลบตัวเลือกวัน (options) ย่อยก่อน
    const { data: existingPkgs } = await supabase
      .from("ticket_packages")
      .select("id")
      .eq("event_id", savedEventId);

    if (existingPkgs && existingPkgs.length > 0) {
      const pkgIds = existingPkgs.map((p) => p.id);
      await supabase.from("ticket_package_day_options").delete().in("package_id", pkgIds);
    }

    // 2. ลบแพ็กเกจราคาเดิมออก
    await supabase.from("ticket_packages").delete().eq("event_id", savedEventId);

    // 3. สร้างแพ็กเกจราคา + ตัวเลือกวันใหม่
    for (const pkg of enabledPackages) {
      const { data: pkgRow, error: pkgError } = await supabase
        .from("ticket_packages")
        .insert({ event_id: savedEventId, num_days: pkg.num_days, price: pkg.price })
        .select()
        .single();
      if (pkgError) throw new Error(pkgError.message);

      const combos = combinations(insertedDays.sort((a, b) => a.day_number - b.day_number), pkg.num_days);
      const optionRows = combos.map((combo) => ({
        package_id: pkgRow.id,
        day_numbers: combo.map((d) => d.day_number),
        label:
          combo.length === insertedDays.length && insertedDays.length > 1
            ? `ทุกวัน (${combo.length} วัน)`
            : `วันที่ ${combo.map((d) => d.day_number).join("+")}`,
      }));
      const { error: optError } = await supabase.from("ticket_package_day_options").insert(optionRows);
      if (optError) throw new Error(optError.message);
    }

    closeEventForm();
    loadEvents();
  } catch (err) {
    eventFormError.textContent = err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "บันทึกงาน";
  }
});

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

// ---------- List events ----------
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

  row.querySelector(".status-select").addEventListener("change", async (e) => {
    await supabase.from("events").update({ status: e.target.value }).eq("id", ev.id);
    loadEvents();
  });

  row.querySelector('[data-action="edit"]').addEventListener("click", () => openEventForm(ev));

  row.querySelector('[data-action="delete"]').addEventListener("click", async () => {
    if (!confirm(`ลบงาน "${ev.title}" ใช่หรือไม่? (ออเดอร์ที่เกี่ยวข้องจะถูกลบด้วย)`)) return;
    await supabase.from("events").delete().eq("id", ev.id);
    loadEvents();
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

async function loadOrders() {
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
    listEl.innerHTML = `<p class="error-text">โหลดข้อมูลไม่สำเร็จ: ${escapeHtml(error.message)}</p>`;
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
    </div>
  `;

  const slipBtn = row.querySelector('[data-action="view-slip"]');
  if (slipBtn) {
    slipBtn.addEventListener("click", async () => {
      const { data, error } = await supabase.storage.from("payment-slips").createSignedUrl(order.slip_image_url, 120);
      if (!error && data?.signedUrl) window.open(data.signedUrl, "_blank");
    });
  }

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
const shopNameInput = document.getElementById("shopNameInput");
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

  const { data, error } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();

  if (error) {
    settingsError.textContent = "โหลดการตั้งค่าไม่สำเร็จ: " + error.message;
    return;
  }

  promptpayIdInput.value = data?.promptpay_id || "";
  promptpayNameInput.value = data?.promptpay_name || "";
  shopNameInput.value = data?.shop_name || "";
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
    shop_name: shopNameInput.value.trim() || null,
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
