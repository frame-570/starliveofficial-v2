import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";
import { lineLogo } from "./icons.js";

renderHeaderAuth();

const session = await getSession();
if (!session) {
  window.location.href = `./login.html?redirect=${encodeURIComponent(window.location.href)}`;
} else {
  loadOrders(session.user);
}

let openchatUrl = "";
let openchatMessage = "";

const STATUS_LABEL = {
  pending_payment: "รอชำระเงิน",
  verifying: "กำลังตรวจสอบสลิป",
  paid: "ชำระเงินสำเร็จ",
  failed: "ตรวจสอบไม่สำเร็จ",
  cancelled: "ยกเลิก",
};

async function loadOrders(user) { 
  const loadingText = document.getElementById("loadingText");
  const emptyText = document.getElementById("emptyText");
  const orderList = document.getElementById("orderList");

  // ดึงเฉพาะข้อมูลออเดอร์ของ user นี้ และกรองเฉพาะสถานะ "paid" (ชำระเงินสำเร็จ) เท่านั้น
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, events(title, status, line_group_url), ticket_packages(num_days), ticket_package_day_options(label)")
    .eq('user_id', user.id)
    .eq('status', 'paid') // <-- เพิ่มเงื่อนไขกรองเฉพาะที่จ่ายเงินสำเร็จแล้ว
    .order("created_at", { ascending: false });

  // ลิงก์กลุ่ม LINE สำหรับงานไลฟ์สด (ตั้งค่าในหน้าแอดมิน)
  const { data: settingsList } = await supabase
    .from("app_settings")
    .select("line_openchat_url, line_openchat_message")
    .limit(1);
  openchatUrl = settingsList?.[0]?.line_openchat_url || "";
  openchatMessage = settingsList?.[0]?.line_openchat_message || "เข้าร่วมกลุ่ม LINE เพื่อรับข่าวสารและอัปเดตล่าสุดจากเรา";

  loadingText.style.display = "none";

  if (error) {
    emptyText.textContent = "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่";
    emptyText.style.display = "block";
    return;
  }

  if (!orders || orders.length === 0) {
    emptyText.style.display = "block";
    return;
  }

  orderList.innerHTML = orders.map(renderOrderCard).join("");

  orderList.querySelectorAll("[data-copy-code]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard?.writeText(btn.dataset.copyCode);
      const original = btn.textContent;
      btn.textContent = "คัดลอกแล้ว";
      setTimeout(() => (btn.textContent = original), 1500);
    });
  });
}

// สลิปแบบเต็มของออเดอร์ที่ชำระแล้ว (รายละเอียดเดียวกับหน้าชำระเงินสำเร็จ แต่ไม่มีคำแนะนำวิธีเข้าประวัติการสั่งซื้อ)
function renderPaidSlip(order) {
  const isRerun = order.events?.status === "rerun";
  const groupUrl = order.events?.line_group_url || openchatUrl;
  const canJoinGroup = !!groupUrl && !isRerun;
  const fmtDate = (v) => new Date(v).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const paidAt = order.paid_at ? new Date(order.paid_at).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" }) : "";
  const row = (label, value, extra = "") =>
    `<div style="display:flex; justify-content:space-between; gap:12px; ${extra}"><span class="muted" style="flex-shrink:0;">${label}</span><span style="text-align:right;">${value}</span></div>`;
  const details = [
    row("เลขที่คำสั่งซื้อ", escapeHtml(order.order_number)),
    row("งาน", escapeHtml(order.events?.title || "-")),
    row("ประเภท", isRerun ? "รับชมรีรัน" : "ไลฟ์สด + รีรัน"),
    row("แพ็กเกจ", `${order.ticket_packages?.num_days || "-"} วัน (${escapeHtml(order.ticket_package_day_options?.label || "-")})`),
    paidAt ? row("ชำระเมื่อ", escapeHtml(paidAt)) : "",
    order.access_code_expires_at ? row("ดูได้ถึงวันที่", escapeHtml(fmtDate(order.access_code_expires_at))) : "",
    row("ยอดชำระ", `${Number(order.amount).toLocaleString("th-TH")}฿`, "font-weight:700; color:var(--amber);"),
  ].join("");

  return `
    <article class="pass-card" style="width:100%; margin:0; text-align:center;">
      <div class="verify-icon verify-icon-success" style="margin:0 auto;"><svg class="ico" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h2 class="display" style="font-size:17px; margin:14px 0 18px;">ชำระเงินสำเร็จ</h2>
      <div style="text-align:left; font-size:13.5px; line-height:2;">${details}</div>
      <div style="height:1px; background:var(--line,#2c2745); margin:16px 0 0;"></div>
      <p class="muted" style="font-size:12.5px; margin:18px 0 6px;">รหัสเข้าชม (เก็บไว้ให้ดี)</p>
      <div class="access-code-display">${escapeHtml(order.access_code)}</div>
      <button type="button" class="icon-btn ghost" style="margin-top:10px;" data-copy-code="${escapeHtml(order.access_code)}">คัดลอกรหัส</button>
      <div style="display:flex; margin-top:22px;">
        <a href="./watch.html?code=${encodeURIComponent(order.access_code)}" class="btn-marquee" style="flex:1; margin:0; text-decoration:none;">เข้าชมทันที</a>
      </div>
      ${
        canJoinGroup
          ? `<div style="margin-top:18px;">
        <p class="muted" style="font-size:13px; line-height:1.7; margin:0 0 10px; white-space:pre-line; text-align:left;">${escapeHtml(openchatMessage)}</p>
        <a href="${escapeHtml(groupUrl)}" target="_blank" rel="noopener" class="btn-line">${lineLogo(24)}<span>เข้าร่วมกลุ่ม LINE</span></a>
      </div>`
          : ""
      }
    </article>
  `;
}

function renderOrderCard(order) {
  if (order.status === "paid" && order.access_code) return renderPaidSlip(order);
  const statusLabel = STATUS_LABEL[order.status] || order.status;
  const isPaid = order.status === "paid";
  const isPending = order.status === "pending_payment";
  // ปุ่มเข้ากลุ่มมีเฉพาะงานไลฟ์สด (งานที่เป็นรีรันแล้วไม่มี)
  const groupUrl = order.events?.line_group_url || openchatUrl;
  const canJoinGroup = isPaid && !!groupUrl && order.events?.status !== "rerun";
  const expiresLabel = order.access_code_expires_at
    ? new Date(order.access_code_expires_at).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
    : "";

  return `
    <article class="pass-card" style="width:100%; margin:0;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px;">
        <div>
          <p class="muted" style="font-size:12px; margin:0 0 4px;">${escapeHtml(order.order_number)}</p>
          <h3 class="display" style="font-size:16px; margin:0 0 4px;">${escapeHtml(order.events?.title || "-")}</h3>
          <p class="muted" style="font-size:12.5px; margin:0;">
            ${order.ticket_packages?.num_days || "-"} วัน · ${escapeHtml(order.ticket_package_day_options?.label || "-")}
          </p>
        </div>
        <span class="event-card-badge-rerun status-pill status-${escapeHtml(order.status)}">${escapeHtml(statusLabel)}</span>
      </div>

      <div class="perforation"></div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:14px; margin-bottom:${isPaid || isPending ? "14px" : "0"};">
        <span class="muted">ยอดชำระ</span>
        <span style="color:var(--amber); font-weight:700;">${Number(order.amount).toLocaleString("th-TH")}฿</span>
      </div>

      ${
        isPaid
          ? `
        <div class="access-code-display" style="font-size:20px; padding:10px;">${escapeHtml(order.access_code)}</div>
        ${expiresLabel ? `<p class="muted" style="text-align:center; font-size:12px; margin:6px 0 0;">ดูได้ถึงวันที่ ${expiresLabel}</p>` : ""}
        <div style="display:flex; gap:10px; margin-top:12px;">
          <button type="button" class="icon-btn" style="flex:1;" data-copy-code="${escapeHtml(order.access_code)}">คัดลอกรหัส</button>
          <a href="./watch.html?code=${escapeHtml(order.access_code)}" class="btn-marquee" style="flex:1; margin:0; text-decoration:none; text-align:center;">เข้าชม</a>
        </div>
        ${
          canJoinGroup
            ? `<a href="${escapeHtml(groupUrl)}" target="_blank" rel="noopener" class="btn-line" style="margin-top:10px;">${lineLogo(24)}<span>เข้าร่วมกลุ่ม LINE</span></a>`
            : ""
        }
      `
          : ""
      }

      ${
        isPending
          ? `<a href="./payment.html?order=${escapeHtml(order.id)}" class="btn-marquee" style="margin:0; text-decoration:none; text-align:center;">ดำเนินการชำระเงิน</a>`
          : ""
      }

      ${
        order.status === "failed" && order.verification_reason
          ? `<p class="error-text" style="margin-top:8px;">${escapeHtml(order.verification_reason)}</p>`
          : ""
      }
    </article>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
