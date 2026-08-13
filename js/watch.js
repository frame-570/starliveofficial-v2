import { extractYouTubeId } from "./supabaseClient.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";

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

let lockoutTimer = null;

// รูปไอคอน SVG สำหรับแทนที่อิโมจิ
const ICONS = {
  lock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  play: `<svg class="icon-svg" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  clock: `<svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
  liveDot: `<span class="icon-live-dot"></span>`
};

// เติมรหัสอัตโนมัติถ้ามาจากลิงก์
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
  } catch {
    submitBtn.disabled = false;
    submitBtn.textContent = "เข้าสู่การถ่ายทอดสด";
    showError("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง");
    return;
  }

  submitBtn.disabled = false;
  submitBtn.textContent = "เข้าสู่การถ่ายทอดสด";

  if (res.status === 429) {
    startLockoutCountdown(body.retry_after_seconds ?? 300);
    return;
  }

  if (!res.ok) {
    if (body.error === "code_expired") {
      showError("รหัสเข้าชมนี้หมดอายุแล้ว");
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

  enterStage(body);
});

function showError(message) {
  errorText.textContent = message;
  codeInput.classList.remove("shake");
  void codeInput.offsetWidth;
  codeInput.classList.add("shake");
}

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

function enterStage(data) {
  liveTitle.textContent = data.eventTitle || data.title || "Star Live Official";

  // ตรวจสอบและ Render แท็บสลับวัน
  if (data.event_days && data.event_days.length > 0) {
    renderDayTabs(data);
  } else {
    // กรณีข้อมูลส่งมาแค่วิดีโอเดียว (ไม่มีข้อมูลวันแบบอาเรย์)
    loadVideoStream(data);
    updateStatusBadge(data.status);
  }

  topBar.style.display = "flex";

  codeScreen.classList.add("curtain-exit");
  setTimeout(() => {
    codeScreen.style.display = "none";
    playerScreen.style.display = "block";
  }, 480);
}

// ฟังก์ชันสำหรับ Render แท็บสลับวัน
function renderDayTabs(data) {
  if (!dayTabContainer) return;
  dayTabContainer.innerHTML = "";

  const purchasedDays = data.purchased_days || [1]; // วันที่สิทธิ์ซื้อครอบคลุม
  const days = (data.event_days || []).sort((a, b) => a.day_number - b.day_number);

  let activeSet = false;

  days.forEach((day) => {
    const isPurchased = purchasedDays.includes(day.day_number);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "day-tab-btn";

    // 1. รหัสไม่ได้ซื้อวันดังกล่าว
    if (!isPurchased) {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.lock} <span>วันที่ ${day.day_number} (ไม่มีสิทธิ์)</span>`;
    } 
    // 2. อยู่ในช่วงถ่ายทอดสดของวันดังกล่าว
    else if (data.status === "live" && (day.live_youtube_url || day.live_cloudflare_uid)) {
      btn.innerHTML = `${ICONS.liveDot} <span>ถ่ายทอดสด: วันที่ ${day.day_number}</span>`;
      btn.onclick = () => {
        setActiveTab(btn);
        loadVideoStream({
          platform: day.live_platform,
          streamUrl: day.live_youtube_url,
          token: day.live_cloudflare_uid,
          customer_code: data.customer_code
        });
        updateStatusBadge("live");
      };
    } 
    // 3. อยู่ในช่วงรีรัน (ดูย้อนหลัง)
    else if (day.rerun_youtube_url || day.rerun_cloudflare_uid) {
      btn.innerHTML = `${ICONS.play} <span>รีรัน: วันที่ ${day.day_number}</span>`;
      btn.onclick = () => {
        setActiveTab(btn);
        loadVideoStream({
          platform: day.rerun_platform,
          streamUrl: day.rerun_youtube_url,
          token: day.rerun_cloudflare_uid,
          customer_code: data.customer_code
        });
        updateStatusBadge("rerun");
      };
    } 
    // 4. ยังไม่เปิดรับชม
    else {
      btn.disabled = true;
      btn.innerHTML = `${ICONS.clock} <span>วันที่ ${day.day_number} (ยังไม่เปิด)</span>`;
    }

    // Auto click วันแรกที่มีสิทธิ์ดูได้
    if (!activeSet && !btn.disabled) {
      activeSet = true;
      setTimeout(() => btn.click(), 50);
    }

    dayTabContainer.appendChild(btn);
  });
}

function setActiveTab(activeBtn) {
  const allTabs = dayTabContainer.querySelectorAll(".day-tab-btn");
  allTabs.forEach((b) => b.classList.remove("active"));
  activeBtn.classList.add("active");
}

function updateStatusBadge(status) {
  if (status === "rerun") {
    statusBadge.innerHTML = `รีรัน`;
    statusBadge.classList.add("event-card-badge-rerun");
  } else {
    statusBadge.innerHTML = `<span class="live-dot"></span> LIVE`;
    statusBadge.classList.remove("event-card-badge-rerun");
  }
}

function loadVideoStream(streamData) {
  let src = null;

  if (streamData.platform === "cloudflare") {
    if (streamData.streamUrl) {
      src = streamData.streamUrl.includes("?") 
        ? `${streamData.streamUrl}&autoplay=true` 
        : `${streamData.streamUrl}?autoplay=true`;
    } else {
      const code = streamData.customer_code || "ohx74kd7koi6qp2a";
      src = `https://customer-${code}.cloudflarestream.com/${streamData.token}/iframe?autoplay=true`;
    }
  } else {
    const rawUrl = streamData.streamUrl || streamData.youtube_url;
    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      showError("ลิงก์การถ่ายทอดสดไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  }

  streamFrame.src = src;
}
