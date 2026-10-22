import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";
// แก้ไขการ import promptpay-qr ชนิด ES Module ให้สมบูรณ์
import promptpayQr from "https://cdn.jsdelivr.net/npm/promptpay-qr@0.5.0/+esm";
import QRCode from "https://esm.sh/qrcode@1.5.3";
import { svgIcon, lineLogo } from "./icons.js";

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
    .select("*, events(title, status, viewing_duration_months, rerun_special_notes, line_group_url), ticket_packages(num_days), ticket_package_day_options(label)")
    .eq("id", orderId)
    .maybeSingle();

  loadingText.style.display = "none";

  if (error || !order) {
    showNotFound("ไม่พบคำสั่งซื้อ หรือคุณไม่มีสิทธิ์เข้าถึง");
    return;
  }

  currentOrder = order;
  await ensureSettings();

  if (order.status === "paid") {
    // เปิดออเดอร์ที่จ่ายแล้วซ้ำ (รีเฟรช/กลับมาดู): แสดงสลิปเต็มแบบเดียวกับตอนชำระเสร็จ
    await showSuccess({ order_number: order.order_number, access_code: order.access_code || "-" }, { reopened: true });
    return;
  }

  // ยอด 0 บาท (ใช้โค้ดลดเต็มจำนวน): ไม่ต้องจ่าย ข้ามหน้า QR/แนบสลิป แล้วออกรหัสเข้าชมทันที
  if (Number(order.amount) <= 0) {
    await claimFreeOrder();
    return;
  }

  await renderPaymentCard(order);
}

async function claimFreeOrder() {
  const freeCard = document.getElementById("freeCard");
  const freeText = document.getElementById("freeStatusText");
  const retryBtn = document.getElementById("freeRetryBtn");
  freeCard.style.display = "block";
  retryBtn.style.display = "none";
  freeText.textContent = "ยอดชำระ 0 บาท กำลังยืนยันสิทธิ์รับชมให้คุณ...";

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    const { data: result, error: fnError } = await supabase.functions.invoke("claim-free-order", {
      body: { orderId: currentOrder.id },
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (fnError || !result?.success) {
      throw new Error(result?.error || "ยืนยันสิทธิ์ไม่สำเร็จ");
    }
    freeCard.style.display = "none";
    showSuccess(result);
  } catch (err) {
    freeText.textContent = (err && err.message) || "ยืนยันสิทธิ์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
    retryBtn.style.display = "inline-block";
  }
}
document.getElementById("freeRetryBtn")?.addEventListener("click", claimFreeOrder);

// ดึงแถวแรกของ app_settings ครั้งเดียว ใช้ทั้งหน้าชำระเงิน หน้ารหัสเข้าชม และปุ่มเข้ากลุ่ม
async function ensureSettings() {
  if (paymentSettings) return paymentSettings;
  const { data: settingsList } = await supabase
    .from("app_settings")
    .select("promptpay_id, promptpay_name, promptpay_logo_url, shop_name, line_oa_url, line_openchat_url, line_openchat_message")
    .limit(1);
  const settings = settingsList?.[0];
  openchatSettings = settings;
  paymentSettings = settings;
  return settings;
}

// ปุ่มเข้ากลุ่ม LINE (เฉพาะงานไลฟ์สด) อยู่ล่างสุดของหน้ารหัสเข้าชม แทนป๊อปอัพเดิม
// กลุ่ม LINE ของงานนั้นก่อน ถ้าไม่ได้ตั้งไว้ใช้กลุ่มรวมจากหน้าตั้งค่า
function groupUrl() {
  return currentOrder?.events?.line_group_url || openchatSettings?.line_openchat_url || "";
}

function renderJoinGroupBlock(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const url = groupUrl();
  if (!url || currentOrder?.events?.status === "rerun") {
    box.style.display = "none";
    return;
  }
  const msg = openchatSettings?.line_openchat_message || "เข้าร่วมกลุ่ม LINE เพื่อรับข่าวสารและอัปเดตล่าสุดจากเรา";
  box.innerHTML = `
    <p class="muted" style="font-size:13px; line-height:1.7; margin:0 0 10px; white-space:pre-line; text-align:left;">${escapeHtml(msg)}</p>
    <a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="btn-line">${lineLogo(24)}<span>เข้าร่วมกลุ่ม LINE</span></a>
  `;
  box.style.display = "block";
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

  const settings = await ensureSettings();

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
  // โชว์ QR พร้อมโลโก้พร้อมเพย์ตรงกลาง เหมือนรูปที่กด "บันทึกรูป QR"
  document.getElementById("qrImage").src = await buildQrWithLogo(payload, 360);
}

// QR ระดับแก้ไขข้อผิดพลาดสูง (H) + โลโก้พร้อมเพย์กึ่งกลาง (ถ้าแอดมินอัปโหลดไว้) ใช้ทั้งหน้าเว็บและรูปที่บันทึก
async function buildQrWithLogo(payload, size) {
  const plain = await QRCode.toDataURL(payload, { width: size, margin: 1, errorCorrectionLevel: "H" });
  const logoUrl = paymentSettings?.promptpay_logo_url;
  if (!logoUrl) return plain;
  try {
    const [qrImg, logoImg] = await Promise.all([loadImage(plain), loadImage(logoUrl)]);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(qrImg, 0, 0, size, size);
    const box = Math.round(size * 0.224); // สัดส่วนเดียวกับรูปที่บันทึก (76/340)
    ctx.drawImage(logoImg, (size - box) / 2, (size - box) / 2, box, box);
    return canvas.toDataURL("image/png");
  } catch {
    // โหลดโลโก้ไม่ได้ (เช่น CORS) ก็แสดง QR เปล่าไปก่อน ดีกว่าให้หน้าชำระเงินพัง
    return plain;
  }
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

async function showSuccess(result, { reopened = false } = {}) {
  // ปิดป๊อปอัพตรวจสลิป แล้วสลับไปแสดงหน้ารหัสเข้าชมแบบหน้าปกติ (ไม่ใช่ป๊อปอัพ)
  verifyOverlay.style.display = "none";
  paymentCard.style.display = "none";
  successCard.style.display = "block";

  const isRerun = currentOrder.events?.status === "rerun";
  const paidAt = new Date(reopened && currentOrder.paid_at ? currentOrder.paid_at : Date.now()).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });

  // ดึงวันหมดอายุของรหัสจากฐานข้อมูล (ถ้าได้) เพื่อบอกลูกค้าว่าดูได้ถึงเมื่อไหร่
  let expiresLabel = "";
  try {
    const { data: fresh } = await supabase
      .from("orders")
      .select("access_code_expires_at")
      .eq("id", currentOrder.id)
      .maybeSingle();
    if (fresh?.access_code_expires_at) {
      expiresLabel = new Date(fresh.access_code_expires_at).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  } catch {
    // ไม่ได้ก็ข้ามไป ไม่ให้หน้าสำเร็จพัง
  }

  const row = (label, value, extra = "") =>
    `<div style="display:flex; justify-content:space-between; gap:12px; ${extra}"><span class="muted" style="flex-shrink:0;">${label}</span><span style="text-align:right;">${value}</span></div>`;

  document.getElementById("successOrderDetails").innerHTML = [
    row("เลขที่คำสั่งซื้อ", escapeHtml(result.order_number)),
    row("งาน", escapeHtml(currentOrder.events?.title || "-")),
    row("ประเภท", isRerun ? "รับชมรีรัน" : "ไลฟ์สด + รีรัน"),
    row(
      "แพ็กเกจ",
      `${currentOrder.ticket_packages?.num_days || "-"} วัน (${escapeHtml(currentOrder.ticket_package_day_options?.label || "-")})`
    ),
    row("ชำระเมื่อ", escapeHtml(paidAt)),
    expiresLabel ? row("ดูได้ถึงวันที่", escapeHtml(expiresLabel)) : "",
    row("ยอดชำระ", `${Number(currentOrder.amount).toLocaleString("th-TH")}฿`, "font-weight:700; color:var(--amber);"),
  ].join("");

  document.getElementById("successAccessCode").textContent = result.access_code;

  // ปุ่มเข้าชมทันที: พาไปหน้าดูพร้อมรหัสที่กรอกไว้แล้ว (เหมือนในหน้าประวัติการสั่งซื้อ)
  const watchBtn = document.getElementById("watchNowBtn");
  if (watchBtn) watchBtn.href = `./watch.html?code=${encodeURIComponent(result.access_code)}`;

  renderJoinGroupBlock("successJoinGroup");
  if (!reopened) maybeShowOpenchatPopup();
}

// ============================================================
// Popup รายละเอียดพิเศษสำหรับงานรีรัน (งานไลฟ์สดใช้ปุ่มเข้ากลุ่มในหน้ารหัสแทน)
// ============================================================
function maybeShowOpenchatPopup() {
  const overlay = document.getElementById("openchatOverlay");
  const icon = document.getElementById("openchatIcon");
  const title = document.getElementById("openchatTitle");
  const messageText = document.getElementById("openchatMessageText");
  const joinLink = document.getElementById("openchatJoinLink");
  const skipBtn = document.getElementById("openchatSkipBtn");

  const isRerun = currentOrder.events?.status === "rerun";

  if (isRerun) {
    // งานที่กลายเป็นรีรันแล้ว: ไม่ชวนเข้า LINE OpenChat อีก แต่โชว์รายละเอียดพิเศษของงานนั้นแทน (ถ้าแอดมินตั้งไว้)
    const notes = currentOrder.events?.rerun_special_notes?.trim();
    if (!notes) return; // ไม่มีรายละเอียดพิเศษ ก็ไม่ต้องเด้งป๊อปอัพอะไรเลย

    icon.style.background = "linear-gradient(135deg,#f2b705,#a67d05)";
    icon.innerHTML = svgIcon("pin", 28, 2);
    title.textContent = "รายละเอียด";
    messageText.textContent = notes;
    joinLink.style.display = "none";
    skipBtn.textContent = "รับทราบ";
    skipBtn.style.width = "100%";

    const closeOverlay = () => {
      overlay.style.display = "none";
    };
    skipBtn.onclick = closeOverlay;
    overlay.onclick = (e) => {
      if (e.target === overlay) closeOverlay();
    };

    setTimeout(() => {
      overlay.style.display = "flex";
    }, 600);
    return;
  }

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
