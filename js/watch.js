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

let lockoutTimer = null;

// เติมรหัสอัตโนมัติถ้ามาจากลิงก์ (เช่นจากหน้าประวัติการสั่งซื้อ)
const prefillCode = new URLSearchParams(window.location.search).get("code");
if (prefillCode) {
  codeInput.value = prefillCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  codeInput.classList.toggle("filled", codeInput.value.length === 8);
}

// บังคับตัวพิมพ์ใหญ่อัตโนมัติขณะพิมพ์
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
  let src = null;

  if (data.platform === "cloudflare") {
    // 📌 แก้ไขจุดนี้: ใช้ streamUrl ที่ยิงมาจาก Edge Function หรือต่อ URL หากไม่ได้ส่ง streamUrl
    if (data.streamUrl) {
      src = data.streamUrl.includes("?") 
        ? `${data.streamUrl}&autoplay=true` 
        : `${data.streamUrl}?autoplay=true`;
    } else {
      const code = data.customer_code || "ohx74kd7koi6qp2a";
      src = `https://customer-${code}.cloudflarestream.com/${data.token}/iframe?autoplay=true`;
    }
  } else {
    const rawUrl = data.streamUrl || data.youtube_url;
    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      showError("ลิงก์การถ่ายทอดสดไม่ถูกต้อง กรุณาติดต่อผู้ดูแลระบบ");
      return;
    }
    src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
  }

  liveTitle.textContent = data.eventTitle || data.title || "Star Live Official";
  streamFrame.src = src;

  if (data.status === "rerun") {
    statusBadge.innerHTML = `รีรัน`;
    statusBadge.classList.add("event-card-badge-rerun");
  } else {
    statusBadge.innerHTML = `<span class="live-dot"></span> LIVE`;
  }

  topBar.style.display = "flex";

  codeScreen.classList.add("curtain-exit");
  setTimeout(() => {
    codeScreen.style.display = "none";
    playerScreen.style.display = "block";
  }, 480);
}
