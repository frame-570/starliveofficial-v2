import { extractYouTubeId } from "./supabaseClient.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

// ==========================================
// 1. DOM Elements
// ==========================================
const codeInput = document.getElementById("codeInput");
const codeForm = document.getElementById("codeForm");
const submitBtn = document.getElementById("submitBtn");
const errorText = document.getElementById("errorText");
const codeScreen = document.getElementById("codeScreen");
const playerScreen = document.getElementById("playerScreen");
const liveTitle = document.getElementById("liveTitle");
const streamFrame = document.getElementById("streamFrame");
const topBar = document.getElementById("topBar");
const statusBadge = document.getElementById("statusBadge");
const dayTabContainer = document.getElementById("dayTabContainer"); // Sidebar/แถบเลือกวันทางขวา
const switchDayBtn = document.getElementById("switchDayBtn");
const exitBtn = document.getElementById("exitBtn"); // ปุ่มออกจากระบบ/เคลียร์เซสชัน

// Modals
const daySelectModal = document.getElementById("daySelectModal");
const dayOptionsList = document.getElementById("dayOptionsList");
const rulesModal = document.getElementById("rulesModal");
const rulesContent = document.getElementById("rulesContent");
const dontShowAgainCheck = document.getElementById("dontShowAgainCheck");
const acceptRulesBtn = document.getElementById("acceptRulesBtn");

// ==========================================
// 2. State Management
// ==========================================
let lockoutTimer = null;
let heartbeatInterval = null;
let currentSessionToken = null;
let currentAccessCode = null;
let currentOrderId = null;
let activeEventData = null;
let currentSelectedDay = null; // บันทึกวัน/รอบที่เลือกไว้ { dayData, mode }

// Icons SVG Template
const ICONS = {
  lock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  play: `<svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  clock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  liveDot: `<span class="icon-live-dot"></span>`
};

// ==========================================
// 3. Initial Setup & Event Listeners
// ==========================================

// Auto prefill code จาก URL ?code=...
if (codeInput) {
  const prefillCode = new URLSearchParams(window.location.search).get("code");
  if (prefillCode) {
    codeInput.value = prefillCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    codeInput.classList.toggle("filled", codeInput.value.length === 8);
  }

  codeInput.addEventListener("input", () => {
    const cleaned = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    codeInput.value = cleaned;
    codeInput.classList.toggle("filled", cleaned.length === 8);
  });
}

// ผูกอีเวนต์ปุ่มออกจากระบบ (Clear Session)
if (exitBtn) {
  exitBtn.addEventListener("click", () => {
    if (confirm("คุณต้องการออกจากหน้าการรับชมเพื่อคืนสิทธิ์ให้เครื่องอื่นใช่หรือไม่?")) {
      handleExitSession();
    }
  });
}

// เมื่อกดปุ่ม "เข้าสู่การถ่ายทอดสด"
if (codeForm) {
  codeForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!codeInput) return;

    const code = codeInput.value.trim();
    if (code.length !== 8) {
      showError("กรุณากรอกรหัสเข้าชมให้ครบ 8 หลัก");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "กำลังตรวจสอบ...";
    }
    if (errorText) errorText.textContent = "";

    let res, body;
    try {
      res = await fetch(`${FUNCTIONS_URL}/verify-access-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ code }),
      });
      body = await res.json();
    } catch (err) {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "เข้าสู่การถ่ายทอดสด";
      }
      showError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "เข้าสู่การถ่ายทอดสด";
    }

    if (res.status === 429) {
      startLockoutCountdown(body.retry_after_seconds ?? 300);
      return;
    }

    if (!res.ok) {
      if (body.error === "code_expired") {
        showError("รหัสเข้าชมนี้หมดอายุแล้ว");
      } else if (body.error === "already_in_use") {
        showError("รหัสนี้กำลังถูกใช้งานอยู่บนเครื่องอื่น (รับชมได้พร้อมกัน 1 เครื่อง)");
      } else if (body.error === "not_started") {
        showError(`"${body.title || "งานนี้"}" ยังไม่เริ่มถ่ายทอดสด กรุณากลับมาใหม่ในวันที่จัดงาน`);
      } else if (body.error === "ended") {
        showError(`"${body.title || "งานนี้"}" ปิดการถ่ายทอดแล้ว`);
      } else if (typeof body.attempts_left === "number" && body.attempts_left > 0) {
        showError(`รหัสไม่ถูกต้อง เหลืออีก ${body.attempts_left} ครั้งก่อนถูกล็อกชั่วคราว`);
      } else if (body.locked) {
        startLockoutCountdown(300);
      } else {
        showError(body.error || "รหัสเข้าชมไม่ถูกต้อง หรือหมดอายุ");
      }
      return;
    }

    // ยืนยันรหัสสำเร็จ
    currentAccessCode = code;
    currentSessionToken = body.session_token || null;
    currentOrderId = body.orderId || null;
    activeEventData = body;

    startHeartbeat();

    // ----------------------------------------------------
    // Step 1: เช็กจำนวนวันของบัตร
    // ----------------------------------------------------
    const purchasedDays = body.purchased_days || [1];
    const eventDays = body.event_days || [];

    if (purchasedDays.length > 1 && eventDays.length > 1) {
      // ตั๋วเหมาหลายวัน -> เปิด Pop-up เลือกรอบวันที่ต้องการรับชมก่อน
      showDaySelectionModal(body);
    } else {
      // ตั๋ววันเดียว -> เลือกวันแรกให้อัตโนมัติ แล้วข้ามไป Pop-up กฎข้อตกลง
      const targetDayNumber = purchasedDays[0] || 1;
      const selectedDay = eventDays.find(d => Number(d.day_number) === Number(targetDayNumber)) 
                          || eventDays[0] 
                          || body;

      currentSelectedDay = { dayData: selectedDay, mode: null };
      showRulesModal();
    }
  });
}

// ==========================================
// 4. Modals & Flow Handlers
// ==========================================

// 📌 Pop-up ที่ 1: เลือกรอบวันที่ต้องการรับชม
function showDaySelectionModal(data) {
  if (!dayOptionsList || !daySelectModal) return;

  dayOptionsList.innerHTML = "";
  const purchasedDays = data.purchased_days || [1];
  const days = [...(data.event_days || [])].sort((a, b) => a.day_number - b.day_number);

  days.forEach((day) => {
    const isPurchased = purchasedDays.includes(day.day_number);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-option-btn";

    if (!isPurchased) {
      btn.disabled = true;
      btn.innerHTML = `<div class="day-title">${ICONS.lock} วันที่ ${day.day_number}</div><div class="day-status">ไม่มีสิทธิ์รับชม</div>`;
    } else if (data.status === "live" && (day.live_youtube_url || day.live_cloudflare_uid)) {
      btn.innerHTML = `<div class="day-title">${ICONS.liveDot} วันที่ ${day.day_number}</div><div class="day-status live">ถ่ายทอดสด</div>`;
      btn.onclick = () => {
        daySelectModal.style.display = "none";
        // บันทึกวันที่เลือกไว้ใน State
        currentSelectedDay = { dayData: day, mode: "live" };
        // ส่งต่อไป Pop-up ที่ 2 (กฎข้อตกลง)
        showRulesModal();
      };
    } else if (day.rerun_youtube_url || day.rerun_cloudflare_uid) {
      btn.innerHTML = `<div class="day-title">${ICONS.play} วันที่ ${day.day_number}</div><div class="day-status rerun">รับชมรีรัน</div>`;
      btn.onclick = () => {
        daySelectModal.style.display = "none";
        // บันทึกวันที่เลือกไว้ใน State
        currentSelectedDay = { dayData: day, mode: "rerun" };
        // ส่งต่อไป Pop-up ที่ 2 (กฎข้อตกลง)
        showRulesModal();
      };
    } else {
      btn.disabled = true;
      btn.innerHTML = `<div class="day-title">${ICONS.clock} วันที่ ${day.day_number}</div><div class="day-status">ยังไม่ถึงวันถ่ายทอดสด</div>`;
    }

    dayOptionsList.appendChild(btn);
  });

  daySelectModal.style.display = "flex";
}

// 📌 Pop-up ที่ 2: กฎข้อตกลงการรับชม
function showRulesModal() {
  const hideRules = localStorage.getItem("hide_watch_rules") === "true";

  if (!hideRules && rulesModal && rulesContent) {
    const noticeText = activeEventData?.notice_message || 
      "1. ห้ามบันทึกภาพหน้าจอหรือนำคลิปไปเผยแพร่โดยไม่ได้รับอนุญาต\n2. รหัสเข้าชมใช้งานได้ทีละ 1 เครื่องเท่านั้น\n3. หากมีการเข้าใช้งานซ้อน ระบบจะตัดการเชื่อมต่อทันที";
    rulesContent.innerText = noticeText;
    rulesModal.style.display = "flex";
  } else {
    // หากเคยติ๊ก "ไม่ต้องแสดงอีก" -> เข้าหน้าดูวิดีโอทันที
    startViewing();
  }
}

// เมื่อผู้ใช้กดปุ่มยินยอมใน Pop-up กฎข้อตกลง
if (acceptRulesBtn) {
  acceptRulesBtn.addEventListener("click", () => {
    if (dontShowAgainCheck && dontShowAgainCheck.checked) {
      localStorage.setItem("hide_watch_rules", "true");
    }
    if (rulesModal) rulesModal.style.display = "none";
    
    // เข้าสู่หน้าวิดีโอ
    startViewing();
  });
}

// ==========================================
// 5. Player Screen & Sidebar Logic
// ==========================================

// เข้าสู่หน้าเล่นวิดีโอหลัก
function startViewing() {
  if (!currentSelectedDay) return;

  const { dayData, mode } = currentSelectedDay;

  if (liveTitle && activeEventData) {
    liveTitle.textContent = activeEventData.eventTitle || activeEventData.title || "Star Live Official";
  }

  if (switchDayBtn && activeEventData?.purchased_days?.length > 1) {
    switchDayBtn.style.display = "inline-block";
    switchDayBtn.onclick = () => showDaySelectionModal(activeEventData);
  }

  // 1. Render แถบ/ปุ่มเลือกวันฝั่งขวา (Sidebar)
  renderRightSidebarDays(activeEventData, dayData);

  // 2. โหลดวิดีโอของวันที่เลือกเข้า Player
  loadSelectedDayStream(dayData, mode);

  // 3. แสดงผล UI หน้าเล่นวิดีโอ
  if (topBar) topBar.style.display = "flex";
  
  if (codeScreen) {
    codeScreen.classList.add("curtain-exit");
    setTimeout(() => {
      codeScreen.style.display = "none";
      if (playerScreen) playerScreen.style.display = "flex";
    }, 480);
  } else if (playerScreen) {
    playerScreen.style.display = "flex";
  }
}

// Render รายชื่อวันฝั่งขวา (Sidebar Right Column)
function renderRightSidebarDays(data, activeDay) {
  if (!dayTabContainer || !data) return;
  dayTabContainer.innerHTML = "";

  const purchasedDays = data.purchased_days || [1];
  const days = [...(data.event_days || [])].sort((a, b) => a.day_number - b.day_number);

  days.forEach((day) => {
    const isPurchased = purchasedDays.includes(day.day_number);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-tab-btn";
    
    if (activeDay && Number(day.day_number) === Number(activeDay.day_number)) {
      btn.classList.add("active");
    }

    if (!isPurchased) {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.lock} <span>วันที่ ${day.day_number}</span>`;
    } else if (data.status === "live" && (day.live_youtube_url || day.live_cloudflare_uid)) {
      btn.innerHTML = `${ICONS.liveDot} <span>สด: วันที่ ${day.day_number}</span>`;
      btn.onclick = () => {
        setActiveTab(btn);
        currentSelectedDay = { dayData: day, mode: "live" };
        loadSelectedDayStream(day, "live");
      };
    } else if (day.rerun_youtube_url || day.rerun_cloudflare_uid) {
      btn.innerHTML = `${ICONS.play} <span>รีรัน: วันที่ ${day.day_number}</span>`;
      btn.onclick = () => {
        setActiveTab(btn);
        currentSelectedDay = { dayData: day, mode: "rerun" };
        loadSelectedDayStream(day, "rerun");
      };
    } else {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.clock} <span>วันที่ ${day.day_number} (ยังไม่ถึงวัน)</span>`;
    }

    dayTabContainer.appendChild(btn);
  });
}

function setActiveTab(activeBtn) {
  if (!dayTabContainer) return;
  const allTabs = dayTabContainer.querySelectorAll(".day-tab-btn");
  allTabs.forEach((b) => b.classList.remove("active"));
  activeBtn.classList.add("active");
}

// โหลด Stream Link เข้า Iframe Player
// หมายเหตุ: วิดีโอเปิด "Require Signed URLs" ไว้ที่ Cloudflare ดังนั้นห้ามใช้ live_cloudflare_uid/rerun_cloudflare_uid
// (เป็นแค่ video id ดิบๆ) มาสร้างลิงก์ตรงๆ เด็ดขาด ต้องขอ signed token จาก verify-access-code เท่านั้น
async function loadSelectedDayStream(day, forceMode = null) {
  if (!day) day = activeEventData || {};
  const dayNumber = day.day_number ?? activeEventData?.current_day?.day_number ?? 1;

  // กรณีเป็นวัน/สถานะเดียวกับที่เพิ่ง verify มาตอนเข้าหน้าครั้งแรก ใช้ signed token ที่มีอยู่แล้วได้เลย ไม่ต้องยิงซ้ำ
  const cached = activeEventData?.current_day;
  if (
    cached &&
    Number(cached.day_number) === Number(dayNumber) &&
    (!forceMode || cached.status === forceMode)
  ) {
    updateStatusBadge(cached.status === "rerun" ? "rerun" : "live");
    loadVideoStream({
      platform: cached.platform,
      streamUrl: cached.stream_url,
      token: cached.token,
      customer_code: activeEventData?.customer_code
    });
    return;
  }

  // สลับวัน หรือ ต้องการ token ใหม่ -> ขอ signed URL ใหม่จากเซิร์ฟเวอร์เสมอ
  try {
    const res = await fetch(`${FUNCTIONS_URL}/verify-access-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        code: currentAccessCode,
        dayNumber: dayNumber,
        session_token: currentSessionToken,
        forceTakeover: true
      }),
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok || !body.current_day) {
      showError(body.error || "ไม่สามารถโหลดสัญญาณภาพของวันนี้ได้ กรุณาลองใหม่");
      return;
    }

    currentSessionToken = body.session_token || currentSessionToken;
    if (activeEventData) activeEventData.current_day = body.current_day;

    updateStatusBadge(body.current_day.status === "rerun" ? "rerun" : "live");
    loadVideoStream({
      platform: body.current_day.platform,
      streamUrl: body.current_day.stream_url,
      token: body.current_day.token,
      customer_code: body.customer_code || activeEventData?.customer_code
    });
  } catch (e) {
    console.warn("Load day stream error:", e);
    showError("เกิดข้อผิดพลาดในการโหลดสัญญาณภาพ กรุณาลองใหม่");
  }
}

function loadVideoStream(streamData) {
  if (!streamFrame) return;
  let src = null;

  if (streamData.platform === "cloudflare") {
    if (streamData.streamUrl) {
      src = streamData.streamUrl.includes("?") 
        ? `${streamData.streamUrl}&autoplay=true` 
        : `${streamData.streamUrl}?autoplay=true`;
    } else if (streamData.token) {
      const code = streamData.customer_code || "ohx74kd7koi6qp2a";
      src = `https://customer-${code}.cloudflarestream.com/${streamData.token}/iframe?autoplay=true`;
    }
  } else {
    const rawUrl = streamData.streamUrl || streamData.youtube_url;
    const videoId = extractYouTubeId(rawUrl);
    if (videoId) {
      src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
    }
  }

  if (src) {
    streamFrame.allow = "autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen";
    streamFrame.src = src;
  } else {
    showError("ไม่พบสัญญาณภาพ หรือยังไม่ถึงเวลาถ่ายทอดสด");
  }
}

function updateStatusBadge(status) {
  if (!statusBadge) return;
  if (status === "rerun") {
    statusBadge.innerHTML = `รีรัน`;
    statusBadge.classList.add("event-card-badge-rerun");
  } else {
    statusBadge.innerHTML = `<span class="live-dot"></span> LIVE`;
    statusBadge.classList.remove("event-card-badge-rerun");
  }
}

// ==========================================
// 6. Security & Session Management
// ==========================================

function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(async () => {
    if (!currentOrderId || !currentSessionToken) return;

    try {
      const res = await fetch(`${FUNCTIONS_URL}/viewing-heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          orderId: currentOrderId,
          sessionToken: currentSessionToken
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (res.ok && body.active === false) {
        // เซิร์ฟเวอร์ยืนยันชัดเจนว่า session ถูกแย่งไปแล้วเท่านั้น ถึงจะเด้งผู้ใช้ออก
        clearInterval(heartbeatInterval);
        alert("รหัสนี้ถูกนำไปเปิดใช้งานบนเครื่องอื่น ระบบจะทำการออกจากหน้าชมสด");
        resetToCodeScreen();
      } else if (!res.ok) {
        // error อื่นๆ (ฟังก์ชันล่ม/deploy ไม่ครบ/เน็ตสะดุด) แค่ log ไว้ ไม่เด้งผู้ใช้ออก
        console.warn("Heartbeat responded with", res.status, "- keeping session alive");
      }
    } catch (e) {
      console.warn("Heartbeat failed:", e);
    }
  }, 15000);
}

// ฟังก์ชันส่ง Request ไปบอกเซิร์ฟเวอร์เพื่อ Clear Session ใน DB แล้วรีเซ็ต UI
async function handleExitSession() {
  if (currentAccessCode) {
    try {
      await fetch(`${FUNCTIONS_URL}/verify-access-code`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          code: currentAccessCode,
          action: "leave"
        }),
      });
    } catch (e) {
      console.warn("Exit session error:", e);
    }
  }

  resetToCodeScreen();
}

// รีเซ็ตการทำงาน เคลียร์ค่า State และเปลี่ยนกลับไปหน้ากรอกรหัส
function resetToCodeScreen() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  currentSessionToken = null;
  currentAccessCode = null;
  currentOrderId = null;
  activeEventData = null;
  currentSelectedDay = null;

  // หยุดการเล่นวิดีโอ (ถอด src ของ Iframe)
  if (streamFrame) streamFrame.src = "";

  // ซ่อน Element หน้าเครื่องเล่นวิดีโอ
  if (topBar) topBar.style.display = "none";
  if (playerScreen) playerScreen.style.display = "none";

  // แสดงหน้ากรอกรหัสตั๋ว
  if (codeScreen) {
    codeScreen.classList.remove("curtain-exit");
    codeScreen.style.display = "block";
  }

  if (codeInput) {
    codeInput.value = "";
    codeInput.classList.remove("filled");
  }

  if (errorText) errorText.textContent = "";
}

function showError(message) {
  if (!errorText) return;
  errorText.textContent = message;

  if (codeInput) {
    codeInput.classList.remove("shake");
    void codeInput.offsetWidth;
    codeInput.classList.add("shake");
  }
}

function startLockoutCountdown(seconds) {
  if (lockoutTimer) clearInterval(lockoutTimer);
  if (submitBtn) submitBtn.disabled = true;
  
  let remaining = seconds;

  const render = () => {
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, "0");
    if (errorText) {
      errorText.textContent = `กรอกผิดครบ 3 ครั้ง กรุณารอ ${m}:${s} แล้วลองใหม่`;
    }
  };
  render();

  lockoutTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(lockoutTimer);
      if (submitBtn) submitBtn.disabled = false;
      if (errorText) errorText.textContent = "";
      return;
    }
    render();
  }, 1000);
}
