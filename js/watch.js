import { extractYouTubeId } from "./supabaseClient.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

// DOM Elements
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
const dayTabContainer = document.getElementById("dayTabContainer");
const switchDayBtn = document.getElementById("switchDayBtn");

// Modals
const daySelectModal = document.getElementById("daySelectModal");
const dayOptionsList = document.getElementById("dayOptionsList");
const rulesModal = document.getElementById("rulesModal");
const rulesContent = document.getElementById("rulesContent");
const dontShowAgainCheck = document.getElementById("dontShowAgainCheck");
const acceptRulesBtn = document.getElementById("acceptRulesBtn");

// State Variables
let lockoutTimer = null;
let heartbeatInterval = null;
let currentSessionToken = null;
let currentAccessCode = null;
let activeEventData = null;
let pendingSelectedDay = null; // { dayData, mode }

// Icons SVG Template
const ICONS = {
  lock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  play: `<svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  clock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  liveDot: `<span class="icon-live-dot"></span>`
};

// 1. เติมรหัสอัตโนมัติหากมี Query Parameter (?code=...)
const prefillCode = new URLSearchParams(window.location.search).get("code");
if (prefillCode) {
  codeInput.value = prefillCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  codeInput.classList.toggle("filled", codeInput.value.length === 8);
}

// 2. จัดการ Input และกรองตัวอักษรให้อยู่ในรูปแบบ 8 หลัก
codeInput.addEventListener("input", () => {
  const cleaned = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  codeInput.value = cleaned;
  codeInput.classList.toggle("filled", cleaned.length === 8);
});

// 3. ตรวจสอบรหัสผ่าน Form Submit
codeForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = codeInput.value.trim();

  if (code.length !== 8) {
    showError("กรุณากรอกรหัสเข้าชมให้ครบ 8 หลัก");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "กำลังตรวจสอบ...";
  errorText.textContent = "";

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
    submitBtn.disabled = false;
    submitBtn.textContent = "เข้าสู่การถ่ายทอดสด";
    showError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    return;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "เข้าสู่การถ่ายทอดสด";

  // ตรวจสอบสถานะการทำงาน (Lockout / Error)
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

  // เข้าสู่ระบบสำเร็จ
  currentAccessCode = code;
  currentSessionToken = body.session_token || null;
  activeEventData = body;

  // เริ่มส่ง Heartbeat เช็กสิทธิ์การใช้งาน 1 เครื่อง
  startHeartbeat();

  // ดึงรายการวัน
  const purchasedDays = body.purchased_days || [1];
  const eventDays = body.event_days || [];

  // ตรวจสอบแพ็กเกจการรับชมแบบหลายวัน
  if (purchasedDays.length > 1 && eventDays.length > 1) {
    // 🟢 Step 1: เปิด ป๊อปอัพเลือกวัน ก่อนเป็นอันดับแรกสำหรับตั๋วหลายวัน
    showDaySelectionModal(body);
  } else {
    // 🟡 สำหรับตั๋ววันเดียว: เลือกวันแรกให้อัตโนมัติ (มีระบบ Fallback กัน undefined)
    const targetDayNumber = purchasedDays[0] || 1;
    const selectedDay = eventDays.find(d => Number(d.day_number) === Number(targetDayNumber)) 
                        || eventDays[0] 
                        || body;

    proceedToRulesOrWatch(selectedDay);
  }
});

// 4. แสดง Modal เลือกวันสำหรับตั๋วแบบหลายวัน (Pop-up ที่ 1)
function showDaySelectionModal(data) {
  dayOptionsList.innerHTML = "";
  const purchasedDays = data.purchased_days || [1];
  const days = (data.event_days || []).sort((a, b) => a.day_number - b.day_number);

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
        // เมื่อเลือกวันสำเร็จ -> ส่งต่อไปยัง Pop-up กฎ
        proceedToRulesOrWatch(day, "live");
      };
    } else if (day.rerun_youtube_url || day.rerun_cloudflare_uid) {
      btn.innerHTML = `<div class="day-title">${ICONS.play} วันที่ ${day.day_number}</div><div class="day-status rerun">รับชมรีรัน</div>`;
      btn.onclick = () => {
        daySelectModal.style.display = "none";
        // เมื่อเลือกวันสำเร็จ -> ส่งต่อไปยัง Pop-up กฎ
        proceedToRulesOrWatch(day, "rerun");
      };
    } else {
      btn.disabled = true;
      btn.innerHTML = `<div class="day-title">${ICONS.clock} วันที่ ${day.day_number}</div><div class="day-status">ยังไม่ถึงวันถ่ายทอดสด</div>`;
    }

    dayOptionsList.appendChild(btn);
  });

  daySelectModal.style.display = "flex";
}

// 5. แสดง Modal กฎระเบียบและข้อตกลงการรับชม (Pop-up ที่ 2)
function proceedToRulesOrWatch(dayData, mode = null) {
  pendingSelectedDay = { dayData, mode };
  const hideRules = localStorage.getItem("hide_watch_rules") === "true";

  if (!hideRules) {
    const noticeText = activeEventData?.notice_message || 
      "1. ห้ามบันทึกภาพหน้าจอหรือนำคลิปไปเผยแพร่โดยไม่ได้รับอนุญาต\n2. รหัสเข้าชมใช้งานได้ทีละ 1 เครื่องเท่านั้น\n3. หากมีการเข้าใช้งานซ้อน ระบบจะตัดการเชื่อมต่อทันที";
    rulesContent.innerText = noticeText;
    rulesModal.style.display = "flex";
  } else {
    // ถ้าผู้ใช้เคยติ๊ก "ไม่ต้องแสดงอีก" ไว้ จะข้ามไปหน้าดูเลย
    startViewing(dayData, mode);
  }
}

// เมื่อผู้ใช้กดปุ่มยอมรับกฎใน Pop-up ที่ 2
acceptRulesBtn.addEventListener("click", () => {
  if (dontShowAgainCheck.checked) {
    localStorage.setItem("hide_watch_rules", "true");
  }
  rulesModal.style.display = "none";
  
  if (pendingSelectedDay) {
    startViewing(pendingSelectedDay.dayData, pendingSelectedDay.mode);
  }
});

// 6. เริ่มเข้าสู่หน้าเล่นวิดีโอ (Player Screen) หลังผ่านป๊อปอัพทั้งหมดแล้ว
function startViewing(dayData, mode) {
  liveTitle.textContent = activeEventData.eventTitle || activeEventData.title || "Star Live Official";

  // แสดงปุ่มสลับวันตรง Top bar สำหรับคนที่ซื้อแบบหลายวัน
  if (activeEventData.purchased_days && activeEventData.purchased_days.length > 1) {
    switchDayBtn.style.display = "inline-block";
    switchDayBtn.onclick = () => {
      // เมื่อกดปุ่มสลับวัน ให้เปิด Pop-up เลือกวันขึ้นมาใหม่
      showDaySelectionModal(activeEventData);
    };
  }

  renderDayTabs(activeEventData, dayData);
  loadSelectedDayStream(dayData, mode);

  topBar.style.display = "flex";
  codeScreen.classList.add("curtain-exit");
  setTimeout(() => {
    codeScreen.style.display = "none";
    playerScreen.style.display = "block";
  }, 480);
}

// 7. Render แท็บการสลับวันบนหน้าเครื่องเล่นวิดีโอ
function renderDayTabs(data, activeDay) {
  if (!dayTabContainer) return;
  dayTabContainer.innerHTML = "";

  const purchasedDays = data.purchased_days || [1];
  const days = (data.event_days || []).sort((a, b) => a.day_number - b.day_number);

  days.forEach((day) => {
    const isPurchased = purchasedDays.includes(day.day_number);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-tab-btn";
    if (activeDay && day.day_number === activeDay.day_number) {
      btn.classList.add("active");
    }

    if (!isPurchased) {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.lock} <span>วันที่ ${day.day_number}</span>`;
    } else if (data.status === "live" && (day.live_youtube_url || day.live_cloudflare_uid)) {
      btn.innerHTML = `${ICONS.liveDot} <span>สด: วันที่ ${day.day_number}</span>`;
      btn.onclick = () => {
        setActiveTab(btn);
        loadSelectedDayStream(day, "live");
      };
    } else if (day.rerun_youtube_url || day.rerun_cloudflare_uid) {
      btn.innerHTML = `${ICONS.play} <span>รีรัน: วันที่ ${day.day_number}</span>`;
      btn.onclick = () => {
        setActiveTab(btn);
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
  const allTabs = dayTabContainer.querySelectorAll(".day-tab-btn");
  allTabs.forEach((b) => b.classList.remove("active"));
  activeBtn.classList.add("active");
}

// 8. โหลดสตรีมข้อมูลตามวันที่เลือก (ปรับปรุงเพิ่ม Guard ป้องกัน undefined)
function loadSelectedDayStream(day, forceMode = null) {
  if (!day) {
    day = activeEventData || {};
  }

  let platform, streamUrl, token;

  const isLive = forceMode === "live" || 
    (activeEventData?.status === "live" && (day.live_youtube_url || day.live_cloudflare_uid));

  if (isLive) {
    platform = day.live_platform || activeEventData?.live_platform;
    streamUrl = day.live_youtube_url || activeEventData?.live_youtube_url;
    token = day.live_cloudflare_uid || activeEventData?.live_cloudflare_uid;
    updateStatusBadge("live");
  } else {
    platform = day.rerun_platform || activeEventData?.rerun_platform;
    streamUrl = day.rerun_youtube_url || activeEventData?.rerun_youtube_url;
    token = day.rerun_cloudflare_uid || activeEventData?.rerun_cloudflare_uid;
    updateStatusBadge("rerun");
  }

  loadVideoStream({
    platform,
    streamUrl,
    token,
    customer_code: activeEventData?.customer_code
  });
}

// 9. โหลด iframe สำหรับรับชม (Cloudflare Stream / YouTube)
function loadVideoStream(streamData) {
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
    streamFrame.src = src;
  } else {
    showError("ไม่พบสัญญาณภาพ หรือยังไม่ถึงเวลาถ่ายทอดสด");
  }
}

// 10. อัปเดต Badge แสดงสถานะ (LIVE / รีรัน)
function updateStatusBadge(status) {
  if (status === "rerun") {
    statusBadge.innerHTML = `รีรัน`;
    statusBadge.classList.add("event-card-badge-rerun");
  } else {
    statusBadge.innerHTML = `<span class="live-dot"></span> LIVE`;
    statusBadge.classList.remove("event-card-badge-rerun");
  }
}

// 11. ระบบ Heartbeat ตรวจสอบสิทธิ์การใช้งาน 1 เครื่อง (เช็กทุกๆ 15 วินาที)
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  
  heartbeatInterval = setInterval(async () => {
    if (!currentAccessCode || !currentSessionToken) return;

    try {
      const res = await fetch(`${FUNCTIONS_URL}/viewing-heartbeat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ 
          code: currentAccessCode,
          session_token: currentSessionToken 
        }),
      });

      if (!res.ok) {
        clearInterval(heartbeatInterval);
        alert("รหัสนี้ถูกนำไปเปิดใช้งานบนเครื่องอื่น ระบบจะทำการออกจากหน้าชมสด");
        window.location.reload();
      }
    } catch (e) {
      console.warn("Heartbeat failed:", e);
    }
  }, 15000);
}

// 12. Helper แสดงข้อความ Error พร้อม Effect การสั่น
function showError(message) {
  errorText.textContent = message;
  codeInput.classList.remove("shake");
  void codeInput.offsetWidth; // Trigger reflow
  codeInput.classList.add("shake");
}

// 13. นับถอยหลังเมื่อกรอกรหัสผิดเกินจำนวนครั้ง (Lockout)
function startLockoutCountdown(seconds) {
  clearInterval(lockoutTimer);
  submitBtn.disabled = true;
  let remaining = seconds;

  const render = () => {
    const m = Math.floor(remaining / 60);
    const s = String(remaining % 60).padStart(2, "0");
    errorText.textContent = `กรอกผิดครบ 3 ครั้ง กรุณารอ ${m}:${s} แล้วลองใหม่`;
  };
  render();

  lockoutTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(lockoutTimer);
      submitBtn.disabled = false;
      errorText.textContent = "";
      return;
    }
    render();
  }, 1000);
}
