import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";

renderHeaderAuth();

const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");

const summaryEl = document.getElementById("orderSummary");
const errorEl = document.getElementById("orderError");

const session = await getSession();
if (!session) {
  window.location.href = `./login.html?redirect=${encodeURIComponent(window.location.href)}`;
} else if (!orderId) {
  errorEl.textContent = "ไม่พบคำสั่งซื้อ";
} else {
  loadOrder();
}

async function loadOrder() {
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, events(title), ticket_packages(num_days), ticket_package_day_options(label)")
    .eq("id", orderId)
    .maybeSingle();

  if (error || !order) {
    errorEl.textContent = "ไม่พบคำสั่งซื้อ หรือคุณไม่มีสิทธิ์เข้าถึง";
    return;
  }

  summaryEl.innerHTML = `
    <div style="display:flex; justify-content:space-between;"><span class="muted">เลขที่คำสั่งซื้อ</span><span>${escapeHtml(order.order_number)}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">งาน</span><span>${escapeHtml(order.events?.title || "-")}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">แพ็กเกจ</span><span>${order.ticket_packages?.num_days || "-"} วัน</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">รอบวันที่</span><span>${escapeHtml(order.ticket_package_day_options?.label || "-")}</span></div>
    <div style="display:flex; justify-content:space-between;"><span class="muted">สถานะ</span><span>${escapeHtml(order.status)}</span></div>
    <div style="display:flex; justify-content:space-between; font-weight:700; color:var(--amber);"><span>ยอดชำระ</span><span>${Number(order.amount).toLocaleString("th-TH")}฿</span></div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
