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
    .select("promptpay_id, promptpay_name, line_oa_url")
    .limit(1);

  const settings = settingsList?.[0];

  const lineOaLink = document.getElementById("lineOaLink");
  if (settings?.line_oa_url) lineOaLink.href = settings.line_oa_url;

  if (!settings?.promptpay_id) {
    document.getElementById("promptpayNameLabel").textContent = "ยังไม่ได้ตั้งค่าเลขพร้อมเพย์ กรุณาติดต่อแอดมิน";
    document.getElementById("submitSlipBtn").disabled = true;
    return;
  }

  document.getElementById("promptpayNameLabel").textContent = settings.promptpay_name || "";

  // สร้าง QR Code จาก payload พร้อมเพย์
  const payload = promptpayQr(settings.promptpay_id, { amount: Number(order.amount) });
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
const stepSuccess = document.getElementById("verifyStepSuccess");
const stepFailed = document.getElementById("verifyStepFailed");

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
  stepSuccess.style.display = "none";
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
  stepChecking.style.display = "none";
  stepFailed.style.display = "none";
  stepSuccess.style.display = "block";

  document.getElementById("successOrderDetails").innerHTML = `
    <div style="display:flex; justify-content:space-between;"><span class="muted">เลขที่คำสั่งซื้อ</span><span>${escapeHtml(result.order_number)}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">งาน</span><span>${escapeHtml(currentOrder.events?.title || "-")}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">แพ็กเกจ</span><span>${currentOrder.ticket_packages?.num_days || "-"} วัน (${escapeHtml(currentOrder.ticket_package_day_options?.label || "-")})</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--amber);"><span>ยอดชำระ</span><span>${Number(currentOrder.amount).toLocaleString("th-TH")}฿</span></div>
  `;
  document.getElementById("successAccessCode").textContent = result.access_code;
}

function showFail(reason) {
  stepChecking.style.display = "none";
  stepSuccess.style.display = "none";
  stepFailed.style.display = "block";
  document.getElementById("failReasonText").textContent = reason;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
