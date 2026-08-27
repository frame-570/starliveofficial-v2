import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";
// แก้ไขการ import promptpay-qr ชนิด ES Module ให้สมบูรณ์
import promptpayQr from "https://cdn.jsdelivr.net/npm/promptpay-qr@0.5.0/+esm";
import QRCode from "https://esm.sh/qrcode@1.5.3";

renderHeaderAuth();

const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");

const loadingText = document.getElementById("loadingText");
const notFoundText = document.getElementById("notFoundText");
const paymentCard = document.getElementById("paymentCard");
const alreadyPaidCard = document.getElementById("alreadyPaidCard");

let currentOrder = null;
let selectedFile = null;
let openchatSettings = null;
let paymentSettings = null;
let currentPromptpayPayload = null;

const session = await getSession();
if (!session) {
  window.location.href = `./login.html?redirect=${encodeURIComponent(window.location.href)}`;
} else if (!orderId) {
  showNotFound("ไม่พบคำสั่งซื้อ");
} else {
  init();
}

async function init() {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, events(title, viewing_duration_months), ticket_packages(num_days), ticket_package_day_options(label)")
    .eq("id", orderId)
    .maybeSingle();

  loadingText.style.display = "none";

  if (error || !order) {
    showNotFound("ไม่พบคำสั่งซื้อ หรือคุณไม่มีสิทธิ์เข้าถึง");
    return;
  }

  currentOrder = order;

  if (order.status === "paid") {
    alreadyPaidCard.style.display = "block";
    document.getElementById("alreadyPaidCode").textContent = order.access_code || "-";
    return;
  }

  await renderPaymentCard(order);
}

function showNotFound(msg) {
  loadingText.style.display = "none";
  notFoundText.textContent = msg;
  notFoundText.style.display = "block";
}

async function renderPaymentCard(order) {
  paymentCard.style.display = "block";

  document.getElementById("orderNumberLabel").textContent = `เลขที่คำสั่งซื้อ ${order.order_number}`;
  document.getElementById("eventTitleLabel").textContent = order.events?.title || "";
  document.getElementById("amountLabel").textContent = `${Number(order.amount).toLocaleString("th-TH")}฿`;

  // ดึงแถวแรกของ app_settings โดยไม่ต้องเจาะจง id = 1
  const { data: settingsList } = await supabase
    .from("app_settings")
    .select("promptpay_id, promptpay_name, promptpay_logo_url, shop_name, line_oa_url, line_openchat_url, line_openchat_message")
    .limit(1);

  const settings = settingsList?.[0];
  openchatSettings = settings;
  paymentSettings = settings;

  const lineOaLink = document.getElementById("lineOaLink");
  if (settings?.line_oa_url) lineOaLink.href = settings.line_oa_url;

  if (!settings?.promptpay_id) {
    document.getElementById("promptpayNameLabel").textContent = "ยังไม่ได้ตั้งค่าเลขพร้อมเพย์ กรุณาติดต่อแอดมิน";
    document.getElementById("submitSlipBtn").disabled = true;
    return;
  }

  document.getElementById("promptpayNameLabel").textContent = settings.promptpay_name || "";

  // สร้าง QR Code จาก payload พร้อมเพย์ (สำหรับแสดงบนหน้าเว็บ — คงเดิมทุกอย่าง)
  const payload = promptpayQr(settings.promptpay_id, { amount: Number(order.amount) });
  currentPromptpayPayload = payload;
  const qrDataUrl = await QRCode.toDataURL(payload, { width: 280, margin: 1 });
  document.getElementById("qrImage").src = qrDataUrl;
}

// ---------- แนบสลิป ----------
const slipDropzone = document.getElementById("slipDropzone");
const slipInput = document.getElementById("slipInput");
const slipPreview = document.getElementById("slipPreview");
const slipDropzoneText = document.getElementById("slipDropzoneText");
const slipError = document.getElementById("slipError");
const submitSlipBtn = document.getElementById("submitSlipBtn");

slipDropzone.addEventListener("click", () => slipInput.click());

slipInput.addEventListener("change", () => {
  slipError.textContent = "";
  const file = slipInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    slipError.textContent = "กรุณาเลือกไฟล์รูปภาพเท่านั้น";
    return;
  }
  if (file.size > 4 * 1024 * 1024) {
    slipError.textContent = "ไฟล์รูปมีขนาดใหญ่เกิน 4MB";
    return;
  }

  selectedFile = file;
  slipPreview.src = URL.createObjectURL(file);
  slipPreview.style.display = "block";
  slipDropzoneText.textContent = "แตะเพื่อเปลี่ยนรูป";
  submitSlipBtn.disabled = false;
});

// ---------- popup elements ----------
const verifyOverlay = document.getElementById("verifyOverlay");
const stepChecking = document.getElementById("verifyStepChecking");
const stepFailed = document.getElementById("verifyStepFailed");
const successCard = document.getElementById("successCard");

submitSlipBtn.addEventListener("click", submitSlip);
document.getElementById("retrySlipBtn").addEventListener("click", () => {
  verifyOverlay.style.display = "none";
});
document.getElementById("copyCodeBtn").addEventListener("click", () => {
  const code = document.getElementById("successAccessCode").textContent;
  navigator.clipboard?.writeText(code);
  const btn = document.getElementById("copyCodeBtn");
  const original = btn.textContent;
  btn.textContent = "คัดลอกแล้ว";
  setTimeout(() => (btn.textContent = original), 1500);
});

async function submitSlip() {
  if (!selectedFile || !currentOrder) return;

  verifyOverlay.style.display = "flex";
  stepChecking.style.display = "block";
  stepFailed.style.display = "none";
  submitSlipBtn.disabled = true;

  try {
    const ext = selectedFile.name.split(".").pop() || "jpg";
    const storagePath = `${session.user.id}/${currentOrder.id}-${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("payment-slips")
      .upload(storagePath, selectedFile, { upsert: false });

    if (uploadError) {
      showFail("อัปโหลดสลิปไม่สำเร็จ กรุณาลองใหม่");
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const { data: result, error: fnError } = await supabase.functions.invoke("verify-slip", {
      body: { orderId: currentOrder.id, storagePath },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });

    if (fnError) {
      showFail("ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    if (!result?.success) {
      showFail(result?.reason || "ตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      return;
    }

    showSuccess(result);
  } catch {
    showFail("เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
  } finally {
    submitSlipBtn.disabled = false;
  }
}

function showSuccess(result) {
  // ปิดป๊อปอัพตรวจสอบสลิป แล้วสลับไปแสดงหน้ารหัสเข้าชมแบบหน้าปกติ (ไม่ใช่ป๊อปอัพ)
  verifyOverlay.style.display = "none";
  paymentCard.style.display = "none";
  successCard.style.display = "block";

  document.getElementById("successOrderDetails").innerHTML = `
    <div style="display:flex; justify-content:space-between;"><span class="muted">เลขที่คำสั่งซื้อ</span><span>${escapeHtml(result.order_number)}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">งาน</span><span>${escapeHtml(currentOrder.events?.title || "-")}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">แพ็กเกจ</span><span>${currentOrder.ticket_packages?.num_days || "-"} วัน (${escapeHtml(currentOrder.ticket_package_day_options?.label || "-")})</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--amber);"><span>ยอดชำระ</span><span>${Number(currentOrder.amount).toLocaleString("th-TH")}฿</span></div>
  `;
  document.getElementById("successAccessCode").textContent = result.access_code;

  maybeShowOpenchatPopup();
}

// ============================================================
// Popup ชวนเข้า LINE OpenChat (แสดงหลังตรวจสลิปสำเร็จ)
// ============================================================
function maybeShowOpenchatPopup() {
  const url = openchatSettings?.line_openchat_url;
  if (!url) return; // แอดมินยังไม่ได้ตั้งค่าลิงก์ ไม่ต้องแสดงป๊อปอัพ

  const overlay = document.getElementById("openchatOverlay");
  const messageText = document.getElementById("openchatMessageText");
  const joinLink = document.getElementById("openchatJoinLink");
  const skipBtn = document.getElementById("openchatSkipBtn");

  messageText.textContent =
    openchatSettings?.line_openchat_message ||
    "เข้าร่วม LINE OpenChat เพื่อรับข่าวสารและอัปเดตล่าสุดจากเรา";
  joinLink.href = url;

  const closeOverlay = () => {
    overlay.style.display = "none";
  };

  skipBtn.onclick = closeOverlay;
  overlay.onclick = (e) => {
    if (e.target === overlay) closeOverlay();
  };
  joinLink.onclick = closeOverlay;

  // หน่วงเล็กน้อยให้ผู้ใช้เห็นหน้ารหัสเข้าชมก่อน ค่อยเด้งป๊อปอัพชวนเข้า LINE
  setTimeout(() => {
    overlay.style.display = "flex";
  }, 600);
}

function showFail(reason) {
  stepChecking.style.display = "none";
  stepFailed.style.display = "block";
  document.getElementById("failReasonText").textContent = reason;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ============================================================
// บันทึกรูป QR (เลย์เอาต์ใหม่: พื้นหลังเว็บ + ชื่อร้าน/ยอดชำระสีเหลือง + โลโก้พร้อมเพย์กลาง QR)
// เฉพาะรูปที่ดาวน์โหลดเท่านั้น — QR ที่แสดงบนหน้าเว็บด้านบนไม่เปลี่ยนแปลง
// ============================================================
const saveQrBtn = document.getElementById("saveQrBtn");

saveQrBtn?.addEventListener("click", async () => {
  if (!currentPromptpayPayload || !currentOrder) return;

  saveQrBtn.disabled = true;
  const originalText = saveQrBtn.textContent;
  saveQrBtn.textContent = "กำลังสร้างรูป...";

  try {
    const blob = await buildQrDownloadImage();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `promptpay-${currentOrder.order_number || "qr"}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    slipError.textContent = "สร้างรูป QR ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  } finally {
    saveQrBtn.disabled = false;
    saveQrBtn.textContent = originalText;
  }
});

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function buildQrDownloadImage() {
  await document.fonts.ready; // กัน canvas วาดตัวอักษรก่อน web font โหลดเสร็จ

  const BG = "#08070d";
  const AMBER = "#f2b705";
  const MUTED = "#9791ab";

  const width = 480;
  const height = 640;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // พื้นหลัง
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, width, height);

  // ชื่อร้าน (บนสุด)
  const shopName = paymentSettings?.shop_name || paymentSettings?.promptpay_name || "STAR LIVE OFFICIAL";
  ctx.fillStyle = AMBER;
  ctx.textAlign = "center";
  ctx.font = "700 26px 'Prompt', sans-serif";
  ctx.fillText(shopName, width / 2, 56);

  // ยอดชำระ
  const amountLabel = `${Number(currentOrder.amount).toLocaleString("th-TH")}฿`;
  ctx.font = "800 44px 'Prompt', sans-serif";
  ctx.fillText(amountLabel, width / 2, 112);

  // ชื่อบัญชีพร้อมเพย์ (ถ้ามี)
  if (paymentSettings?.promptpay_name) {
    ctx.fillStyle = MUTED;
    ctx.font = "500 15px 'Sarabun', sans-serif";
    ctx.fillText(paymentSettings.promptpay_name, width / 2, 140);
  }

  // สร้าง QR ระดับแก้ไขข้อผิดพลาดสูง (H) แยกต่างหาก เพื่อให้สแกนได้แม้มีโลโก้บัง
  const qrSize = 340;
  const qrDataUrl = await QRCode.toDataURL(currentPromptpayPayload, {
    width: qrSize,
    margin: 1,
    errorCorrectionLevel: "H",
  });
  const qrImg = await loadImage(qrDataUrl);

  const qrX = (width - qrSize) / 2;
  const qrY = 168;

  // กรอบขาวรองใต้ QR ให้ดูสะอาดตา
  ctx.fillStyle = "#ffffff";
  drawRoundedRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 16);
  ctx.fill();
  ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

  // โลโก้พร้อมเพย์ตรงกลาง QR (ถ้าแอดมินอัปโหลดไว้) — วาดตรงๆ ตามความโปร่งใสของไฟล์จริง ไม่เติมพื้นหลังทับ
  if (paymentSettings?.promptpay_logo_url) {
    try {
      const logoImg = await loadImage(paymentSettings.promptpay_logo_url);
      const logoBoxSize = 76;
      const logoX = width / 2 - logoBoxSize / 2;
      const logoY = qrY + qrSize / 2 - logoBoxSize / 2;

      ctx.drawImage(logoImg, logoX, logoY, logoBoxSize, logoBoxSize);
    } catch {
      // โหลดโลโก้ไม่สำเร็จ (เช่น CORS) ก็ปล่อยผ่าน ให้ได้ QR เปล่าไปก่อนดีกว่าทำให้ทั้งฟังก์ชันพัง
    }
  }

  // ข้อความท้ายภาพ
  ctx.fillStyle = MUTED;
  ctx.font = "400 13px 'Sarabun', sans-serif";
  ctx.fillText("สแกนเพื่อชำระเงินผ่านแอปธนาคาร", width / 2, qrY + qrSize + 46);

  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
