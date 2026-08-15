import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";

renderHeaderAuth();

const session = await getSession();
if (!session) {
  window.location.href = `./login.html?redirect=${encodeURIComponent(window.location.href)}`;
} else {
  loadOrders(session.user);
}

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
    .select("*, events(title), ticket_packages(num_days), ticket_package_day_options(label)")
    .eq('user_id', user.id)
    .eq('status', 'paid') // <-- เพิ่มเงื่อนไขกรองเฉพาะที่จ่ายเงินสำเร็จแล้ว
    .order("created_at", { ascending: false });

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

function renderOrderCard(order) {
  const statusLabel = STATUS_LABEL[order.status] || order.status;
  const isPaid = order.status === "paid";
  const isPending = order.status === "pending_payment";
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
