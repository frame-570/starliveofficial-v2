import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";
import { lineLogo } from "./icons.js";
import { getGuestOrders, guestCall, guestNoticeHtml } from "./guest.js";
import { getMember, clearMember, memberCall, adoptOrders, maskCode } from "./member.js";
import { openMemberDialog } from "./member-ui.js";

renderHeaderAuth();

const session = await getSession();
if (!session) {
  // ไม่ได้ล็อกอิน: ถ้าเครื่องนี้เคยสั่งซื้อแบบไม่สมัครสมาชิก ให้แสดงประวัติที่เก็บไว้ในเครื่อง ไม่งั้นพาไปเข้าสู่ระบบ
  if (getMember()) loadMemberOrders();
  else if (getGuestOrders().length) loadGuestOrders();
  else window.location.href = `./login.html?redirect=${encodeURIComponent(window.location.href)}`;
} else {
  loadOrders(session.user);
}

let openchatUrl = "";
let openchatMessage = "";

// ประวัติของรหัสประจำตัว (ST + 6 ตัว): ดึงจากเซิร์ฟเวอร์ ใช้ได้ทุกเครื่องที่ใส่รหัส
async function loadMemberOrders() {
  const loadingText = document.getElementById("loadingText");
  const emptyText = document.getElementById("emptyText");
  const orderList = document.getElementById("orderList");
  const member = getMember();

  let result;
  try {
    result = await memberCall({ action: "me", token: member.token });
  } catch (e) {
    if (e.status === 401) {
      // เซสชันหมดอายุ / รหัสถูกเปลี่ยนหรือถูกระงับ -> ให้ใส่รหัสใหม่
      clearMember();
      loadingText.style.display = "none";
      emptyText.innerHTML = `เซสชันรหัสประจำตัวหมดอายุ หรือรหัสถูกเปลี่ยนแล้ว<br><button type="button" id="reMemberBtn" class="btn-marquee" style="margin:14px auto 0; width:auto; padding:10px 22px;">ใส่รหัสประจำตัวอีกครั้ง</button>`;
      emptyText.style.display = "block";
      document.getElementById("reMemberBtn").onclick = () => openMemberDialog({ startView: "login", onDone: () => window.location.reload() });
      return;
    }
    loadingText.style.display = "none";
    emptyText.textContent = "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่";
    emptyText.style.display = "block";
    return;
  }
  adoptOrders(result.orders);
  openchatUrl = result.settings?.line_openchat_url || "";
  openchatMessage = result.settings?.line_openchat_message || "";

  // การ์ดรหัสประจำตัว
  const card = document.createElement("div");
  card.style.marginBottom = "14px";
  card.innerHTML = `<div style="background:rgba(242,183,5,0.1); border:1px solid rgba(242,183,5,0.45); border-radius:12px; padding:12px 14px; font-size:13px; line-height:1.7;">
    <strong style="color:var(--amber,#f2b705);">รหัสประจำตัวของ ${escapeHtml(result.member.name)}</strong>
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-top:6px;">
      <span id="memberCodeText" style="font-weight:800; letter-spacing:2px; font-size:17px;">${escapeHtml(maskCode(result.member.code))}</span>
      <button type="button" id="memberShowBtn" class="icon-btn ghost" style="padding:4px 10px;">แสดง</button>
      <button type="button" id="memberLogoutBtn" class="icon-btn ghost" style="padding:4px 10px;">ออกจากระบบ</button>
    </div>
    <span class="muted" style="font-size:12px;">ใช้ดูทุกงานที่ซื้อได้ทุกเครื่อง เก็บเป็นความลับ ลืมหรือหลุดให้ทักแอดมินเพื่อเปลี่ยนรหัส</span>
  </div>`;
  loadingText.parentElement.insertBefore(card, loadingText);
  let shown = false;
  card.querySelector("#memberShowBtn").onclick = (e) => {
    shown = !shown;
    card.querySelector("#memberCodeText").textContent = shown ? result.member.code : maskCode(result.member.code);
    e.currentTarget.textContent = shown ? "ซ่อน" : "แสดง";
  };
  card.querySelector("#memberLogoutBtn").onclick = async () => {
    try { await memberCall({ action: "logout", token: member.token }); } catch {}
    clearMember();
    window.location.href = "./index.html";
  };

  loadingText.style.display = "none";
  const orders = (result.orders || []).filter((o) => o.status !== "cancelled");
  if (!orders.length) {
    emptyText.style.display = "block";
    return;
  }
  orderList.innerHTML = orders.map(renderOrderCard).join("");
  bindCopyButtons(orderList);
}

const STATUS_LABEL = {
  pending_payment: "รอชำระเงิน",
  verifying: "กำลังตรวจสอบสลิป",
  paid: "ชำระเงินสำเร็จ",
  failed: "ตรวจสอบไม่สำเร็จ",
  cancelled: "ยกเลิก",
};

// ประวัติของแขก: อ่านรายการ {id, token} จาก localStorage แล้วให้ guest-order ส่งรายละเอียดกลับมา
async function loadGuestOrders() {
  const loadingText = document.getElementById("loadingText");
  const emptyText = document.getElementById("emptyText");
  const orderList = document.getElementById("orderList");

  const notice = document.createElement("div");
  notice.style.marginBottom = "14px";
  notice.innerHTML = guestNoticeHtml("หากเปลี่ยนเครื่องหรือล้างข้อมูลเบราว์เซอร์ ประวัติจะหายไป (รหัสเข้าชมยังใช้ได้ตามเดิม ควรคัดลอกเก็บไว้) หรือสมัครสมาชิกเพื่อเก็บประวัติไว้ในบัญชี");
  orderList.parentElement.insertBefore(notice, orderList);

  let result;
  try {
    result = await guestCall({
      action: "list",
      orders: getGuestOrders().map((o) => ({ orderId: o.id, guestToken: o.token })),
    });
  } catch {
    loadingText.style.display = "none";
    emptyText.textContent = "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่";
    emptyText.style.display = "block";
    return;
  }

  openchatUrl = result.settings?.line_openchat_url || "";
  openchatMessage = result.settings?.line_openchat_message || "เข้าร่วมกลุ่ม LINE เพื่อรับข่าวสารและอัปเดตล่าสุดจากเรา";
  loadingText.style.display = "none";

  const orders = (result.orders || []).filter((o) => o.status !== "cancelled");
  if (!orders.length) {
    emptyText.style.display = "block";
    return;
  }
  orderList.innerHTML = orders.map(renderOrderCard).join("");
  bindCopyButtons(orderList);
}

function bindCopyButtons(orderList) {
  orderList.querySelectorAll("[data-copy-code]").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigator.clipboard?.writeText(btn.dataset.copyCode);
      const original = btn.textContent;
      btn.textContent = "คัดลอกแล้ว";
      setTimeout(() => (btn.textContent = original), 1500);
    });
  });
}

async function loadOrders(user) { 
  const loadingText = document.getElementById("loadingText");
  const emptyText = document.getElementById("emptyText");
  const orderList = document.getElementById("orderList");

  // ดึงเฉพาะข้อมูลออเดอร์ของ user นี้ และกรองเฉพาะสถานะ "paid" (ชำระเงินสำเร็จ) เท่านั้น
  const { data: orders, error } = await supabase
    .from("orders")
    .select("*, events(title, status), ticket_packages(num_days), ticket_package_day_options(label)")
    .eq('user_id', user.id)
    .eq('status', 'paid') // <-- เพิ่มเงื่อนไขกรองเฉพาะที่จ่ายเงินสำเร็จแล้ว
    .order("created_at", { ascending: false });

  // ลิงก์กลุ่ม LINE สำหรับงานไลฟ์สด (ตั้งค่าในหน้าแอดมิน)
  const { data: settingsList } = await supabase
    .from("app_settings")
    .select("line_openchat_url")
    .limit(1);
  openchatUrl = settingsList?.[0]?.line_openchat_url || "";

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
  // ปุ่มเข้ากลุ่มมีเฉพาะงานไลฟ์สด (งานที่เป็นรีรันแล้วไม่มี)
  const canJoinGroup = isPaid && !!openchatUrl && order.events?.status !== "rerun";
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
            ? `<a href="${escapeHtml(openchatUrl)}" target="_blank" rel="noopener" class="btn-line" style="margin-top:10px;">${lineLogo(24)}<span>เข้าร่วมกลุ่ม LINE</span></a>`
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
