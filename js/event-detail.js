import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";
import { SUPABASE_ANON_KEY, FUNCTIONS_URL } from "./config.js";
import { svgIcon } from "./icons.js";
import { saveGuestOrder, getGuestContact, saveGuestContact, guestNoticeHtml } from "./guest.js";

renderHeaderAuth();

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

const loadingText = document.getElementById("loadingText");
const notFoundText = document.getElementById("notFoundText");
const shell = document.getElementById("eventDetailShell");

let currentEvent = null;
let selectedPackage = null;
let selectedDayOptionId = null;
let appliedDiscount = null; // { code, discountedAmount, discountAmount, discountLabel }
let currentSession = await getSession(); // ใช้เช็กว่าล็อกอินหรือยัง (ไม่ล็อกอินก็สั่งซื้อและใช้โค้ดส่วนลดได้แบบแขก)

// พาไปหน้าเข้าสู่ระบบ แล้วกลับมาที่หน้างานเดิม พร้อมจำโค้ดส่วนลดที่พิมพ์ค้างไว้
function gotoLogin(code) {
  const target = new URL(window.location.href);
  target.searchParams.delete("guest");
  if (code) target.searchParams.set("code", code);
  // จำแพ็กเกจ/วันที่เลือกไว้ จะได้กลับมาที่เดิมโดยไม่ต้องเลือกใหม่ (ทั้งตอนล็อกอินและตอนเลือกสั่งซื้อแบบไม่สมัครสมาชิก)
  if (selectedPackage) target.searchParams.set("pkg", selectedPackage.id);
  if (selectedDayOptionId) target.searchParams.set("opt", selectedDayOptionId);
  const redirect = target.pathname + target.search;
  window.location.href = `./login.html?redirect=${encodeURIComponent(redirect)}`;
}

// แสดงข้อความเตือนใต้ช่องโค้ดส่วนลด เมื่อยังไม่ได้ล็อกอิน
function showLoginHintIfNeeded() {
  // เดิมบังคับล็อกอินก่อนใช้โค้ด/ชำระเงิน — ตอนนี้แขกสั่งซื้อและใช้โค้ดได้ จึงไม่ต้องเตือนอะไร
}

if (!eventId) {
  showNotFound();
} else {
  loadEvent();
}

async function loadEvent() {
  const { data, error } = await supabase
    .from("events")
    .select("*, event_days(*), ticket_packages(*, ticket_package_day_options(*))")
    .eq("id", eventId)
    .maybeSingle();

  loadingText.style.display = "none";

  if (error || !data) {
    showNotFound();
    return;
  }

  currentEvent = data;
  renderEvent(data);
  shell.style.display = "block";

  // กลับมาจากหน้าล็อกอินพร้อมโค้ดที่พิมพ์ค้างไว้ -> เติมให้และกดใช้โค้ดให้อัตโนมัติ
  const pendingCode = params.get("code");
  const discountInput = document.getElementById("discountCodeInput");
  if (pendingCode && discountInput) {
    discountInput.value = pendingCode.toUpperCase();
  }

  // กลับมาจากหน้าเข้าสู่ระบบ: คืนแพ็กเกจ/วันที่ที่เลือกไว้
  const pkgParam = params.get("pkg");
  if (pkgParam) {
    document.querySelector(`.package-tab[data-package-id="${CSS.escape(pkgParam)}"]`)?.click();
    const optParam = params.get("opt");
    if (optParam) document.querySelector(`.day-card-item[data-day-id="${CSS.escape(optParam)}"]`)?.click();
  }
  // โค้ดส่วนลดที่พิมพ์ค้างไว้ต้องกดใช้หลังคืนแพ็กเกจแล้ว (การเลือกแพ็กเกจจะล้างโค้ด)
  if (pendingCode && discountInput) {
    document.getElementById("applyDiscountBtn")?.click();
  }

  // เลือก "สั่งซื้อโดยไม่สมัครสมาชิก" จากหน้าเข้าสู่ระบบ -> เปิดหน้าต่างกรอกชื่อให้ทันที
  if (params.get("guest") === "1" && !currentSession) {
    const url = new URL(window.location.href);
    url.searchParams.delete("guest");
    history.replaceState(null, "", url.pathname + url.search);
    const applyBtn = document.getElementById("applyDiscountBtn");
    for (let i = 0; i < 40 && applyBtn?.disabled; i++) await new Promise((r) => setTimeout(r, 100));
    if (selectedPackage && (selectedDayOptionId || document.getElementById("payBtn")?.disabled === false)) openGuestDialog();
  }

  showLoginHintIfNeeded();
}

function showNotFound() {
  loadingText.style.display = "none";
  notFoundText.style.display = "block";
}

function renderEvent(event) {
  document.title = `${event.title} — Star Live Official`;

  const banner = document.getElementById("eventBanner");
  if (event.banner_url) {
    banner.style.backgroundImage = `url('${event.banner_url}')`;
  } else {
    banner.classList.add("event-detail-banner-fallback");
    banner.textContent = event.title;
  }

  document.getElementById("eventTitle").textContent = event.title;
  document.getElementById("eventDescription").textContent = event.description || "";

  const dates = (event.event_days || [])
    .slice()
    .sort((a, b) => a.day_number - b.day_number)
    .map((d) => new Date(d.event_date).getDate());
  const lastDay = (event.event_days || [])[event.event_days.length - 1];
  const monthLabel = lastDay ? THAI_MONTHS[new Date(lastDay.event_date).getMonth()] : "";
  document.getElementById("eventDates").textContent = dates.length
    ? `จัดวันที่ ${dates.join("-")} ${monthLabel}`
    : "";

  renderPackageTabs(event.ticket_packages || []);
}

// วันที่ปิดการขายแล้ว: ตัวเลือกวันที่มีวันนั้นปนอยู่จะไม่แสดง และแพ็กเกจที่เหลือตัวเลือกไม่ครบจะถูกซ่อน
function applySalesClosed(packages) {
  const days = currentEvent?.event_days || [];
  const closedNums = new Set(days.filter((d) => d.sales_closed).map((d) => Number(d.day_number)));
  if (closedNums.size === 0) return { packages, closedCount: 0 };
  const result = [];
  for (const pkg of packages) {
    const opts = (pkg.ticket_package_day_options || []).filter((o) => !(o.day_numbers || []).some((n) => closedNums.has(Number(n))));
    if (opts.length > 0) result.push({ ...pkg, ticket_package_day_options: opts });
  }
  return { packages: result, closedCount: closedNums.size };
}

function renderPackageTabs(rawPackages) {
  const wrap = document.getElementById("packageTabs");
  const { packages, closedCount } = applySalesClosed(rawPackages);
  const sorted = [...packages].sort((a, b) => a.num_days - b.num_days);

  if (sorted.length === 0) {
    wrap.innerHTML =
      closedCount > 0
        ? `<p class="muted" style="font-size:13.5px;">ปิดการขายแล้ว (เต็มแล้ว)</p>`
        : `<p class="muted" style="font-size:13.5px;">งานนี้ยังไม่เปิดขายบัตร</p>`;
    selectedPackage = null;
    selectedDayOptionId = null;
    return;
  }

  wrap.innerHTML = sorted
    .map(
      (pkg) => `
      <button type="button" class="day-option-btn package-tab" data-package-id="${pkg.id}">
        ${pkg.num_days} วัน — ${Number(pkg.price).toLocaleString("th-TH")}฿
      </button>`
    )
    .join("");

  if (closedCount > 0) {
    wrap.insertAdjacentHTML("beforeend", `<p class="muted" style="font-size:12.5px; margin:8px 0 0; width:100%;">บางวันปิดการขายแล้ว (เต็มแล้ว) จึงไม่แสดงให้เลือก</p>`);
  }

  wrap.querySelectorAll(".package-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      wrap.querySelectorAll(".package-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const pkg = sorted.find((p) => p.id === btn.dataset.packageId);
      selectPackage(pkg);
    });
  });

  // เลือกแพ็กเกจแรกให้อัตโนมัติ
  if (sorted.length > 0) {
    const firstTab = wrap.querySelector(".package-tab");
    if (firstTab) firstTab.click();
  }
}

function selectPackage(pkg) {
  selectedPackage = pkg;
  selectedDayOptionId = null;
  resetDiscount(); // เปลี่ยนแพ็กเกจแล้วโค้ดเดิมต้องกดใช้ใหม่ (ยอดฐานเปลี่ยน)
  updateTotal();

  const rawOptions = pkg.ticket_package_day_options || [];
  const dayOptionWrap = document.getElementById("dayOptionWrap");
  const singleWrap = document.getElementById("singleDayOptionWrap");
  const grid = document.getElementById("dayOptionsGrid");

  // คำนวณว่าแพ็กเกจนี้ซื้อครอบคลุมทุกวันของงานหรือไม่
  const totalEventDays = currentEvent.event_days ? currentEvent.event_days.length : 1;
  const isFullPackage = pkg.num_days >= totalEventDays;

  // กรองตัวเลือกที่ชื่อซ้ำกันออก (ป้องกันปัญหาข้อมูลซ้ำในระบบ)
  const uniqueOptions = [];
  const seenLabels = new Set();
  for (const opt of rawOptions) {
    if (!seenLabels.has(opt.label)) {
      seenLabels.add(opt.label);
      uniqueOptions.push(opt);
    }
  }

  // เงื่อนไขการแสดงผลตัวเลือกวัน
  if (isFullPackage) {
    // 1. ถ้าซื้อเหมาหมดทุกวัน -> ซ่อนตัวเลือกวันทั้งหมดทันที
    dayOptionWrap.style.display = "none";
    singleWrap.style.display = "none";
    // เลือก day_option ตัวแรกให้อัตโนมัติหลังบ้านเพื่อเอา ID ไปสร้าง Order
    selectedDayOptionId = rawOptions.length > 0 ? rawOptions[0].id : null;
  } else if (uniqueOptions.length > 1) {
    // 2. ถ้าเป็นตั๋วรายวันและมีหลายวันให้เลือก -> แสดงการ์ดให้เลือก
    singleWrap.style.display = "none";
    dayOptionWrap.style.display = "block";
    renderDayOptionCards(uniqueOptions, grid);
  } else if (uniqueOptions.length === 1) {
    // 3. ถ้ามีตัวเลือกเดียว
    dayOptionWrap.style.display = "none";
    singleWrap.style.display = "block";
    document.getElementById("singleDayOptionLabel").textContent = uniqueOptions[0].label;
    selectedDayOptionId = uniqueOptions[0].id;
  } else {
    // 4. ไม่มีตัวเลือกวัน
    dayOptionWrap.style.display = "none";
    singleWrap.style.display = "none";
    selectedDayOptionId = null;
  }

  updatePayButton();
}

function renderDayOptionCards(options, container) {
  container.innerHTML = options
    .map(
      (o) => `
      <button type="button" class="day-option-btn day-card-item ${selectedDayOptionId === o.id ? "active" : ""}" data-day-id="${o.id}">
        <span style="font-weight:600;">${escapeHtml(o.label)}</span>
        <span class="check-icon" style="
          width:18px; 
          height:18px; 
          border-radius:50%; 
          border:1.5px solid ${selectedDayOptionId === o.id ? "var(--amber)" : "var(--muted)"}; 
          background:${selectedDayOptionId === o.id ? "var(--amber)" : "transparent"}; 
          color:${selectedDayOptionId === o.id ? "#1a1400" : "transparent"}; 
          display:inline-flex; 
          align-items:center; 
          justify-content:center; 
          font-size:11px; 
          font-weight:bold;
          flex-shrink:0;">${svgIcon("check", 12, 3.2)}</span>
      </button>`
    )
    .join("");

  container.querySelectorAll(".day-card-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedDayOptionId = btn.dataset.dayId;
      renderDayOptionCards(options, container);
      updatePayButton();
    });
  });
}

function updateTotal() {
  const totalEl = document.getElementById("totalPrice");
  if (!selectedPackage) {
    totalEl.textContent = "—";
    return;
  }
  if (appliedDiscount) {
    totalEl.innerHTML = `
      <span style="text-decoration:line-through; color:var(--muted); font-size:15px; margin-right:8px;">${Number(selectedPackage.price).toLocaleString("th-TH")}฿</span>
      ${Number(appliedDiscount.discountedAmount).toLocaleString("th-TH")}฿
    `;
  } else {
    totalEl.textContent = `${Number(selectedPackage.price).toLocaleString("th-TH")}฿`;
  }
}

// ---------- โค้ดส่วนลด ----------
function resetDiscount() {
  appliedDiscount = null;
  const resultText = document.getElementById("discountResultText");
  if (resultText) {
    resultText.textContent = "";
    resultText.classList.remove("error-text");
  }
  showLoginHintIfNeeded();
}

document.getElementById("applyDiscountBtn").addEventListener("click", async () => {
  const input = document.getElementById("discountCodeInput");
  const resultText = document.getElementById("discountResultText");
  const applyBtn = document.getElementById("applyDiscountBtn");
  const code = input.value.trim().toUpperCase();

  resultText.classList.remove("error-text");
  resultText.textContent = "";

  if (!selectedPackage) {
    resultText.textContent = "กรุณาเลือกแพ็กเกจก่อน";
    resultText.classList.add("error-text");
    return;
  }
  if (!code) {
    resultText.textContent = "กรุณากรอกโค้ดส่วนลด";
    resultText.classList.add("error-text");
    return;
  }

  applyBtn.disabled = true;
  applyBtn.textContent = "กำลังตรวจสอบ...";

  let body;
  try {
    const res = await fetch(`${FUNCTIONS_URL}/validate-discount-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ code, amount: selectedPackage.price, eventId: currentEvent?.id }),
    });
    body = await res.json();
  } catch {
    applyBtn.disabled = false;
    applyBtn.textContent = "ใช้โค้ด";
    resultText.textContent = "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง";
    resultText.classList.add("error-text");
    return;
  }

  applyBtn.disabled = false;
  applyBtn.textContent = "ใช้โค้ด";

  if (!body.valid) {
    appliedDiscount = null;
    resultText.textContent = body.error || "โค้ดไม่ถูกต้อง";
    resultText.classList.add("error-text");
    updateTotal();
    return;
  }

  appliedDiscount = {
    code: body.code,
    discountedAmount: body.discountedAmount,
    discountAmount: Math.round((body.originalAmount - body.discountedAmount) * 100) / 100,
    discountLabel: body.discountLabel,
  };
  {
    const ic = document.createElement("span");
    ic.innerHTML = svgIcon("check", 14, 2.6, "vertical-align:-2px; margin-right:5px");
    resultText.replaceChildren(ic, document.createTextNode(`ใช้โค้ด ${body.code} สำเร็จ — ${body.discountLabel}`));
  }
  updateTotal();
});

function updatePayButton() {
  const payBtn = document.getElementById("payBtn");
  if (!payBtn) return;

  // ตรวจสอบเงื่อนไขการเปิดปุ่มชำระเงิน
  const totalEventDays = currentEvent?.event_days ? currentEvent.event_days.length : 1;
  const isFullPackage = selectedPackage && selectedPackage.num_days >= totalEventDays;

  if (isFullPackage) {
    // แพ็กเกจเหมา สามารถกดชำระเงินได้ทันที
    payBtn.disabled = !selectedPackage;
  } else {
    // แพ็กเกจรายวัน ต้องเลือกวันก่อน
    payBtn.disabled = !(selectedPackage && selectedDayOptionId);
  }
}

document.getElementById("payBtn").addEventListener("click", async () => {
  const errorEl = document.getElementById("purchaseError");
  errorEl.textContent = "";

  const session = await getSession();
  currentSession = session;
  if (!session) {
    // ยังไม่ล็อกอิน -> พาไปหน้าเข้าสู่ระบบ ซึ่งมีปุ่ม "สั่งซื้อโดยไม่สมัครสมาชิก" ให้ลูกค้าเลือกเอง
    // (ส่วนลดที่ใช้ไว้ถูกตัดออกก่อน แล้วจำโค้ดไว้ให้กดใช้ใหม่ตอนกลับมา)
    const pendingCode = appliedDiscount?.code || document.getElementById("discountCodeInput")?.value.trim().toUpperCase();
    gotoLogin(pendingCode);
    return;
  }

  const payBtn = document.getElementById("payBtn");
  payBtn.disabled = true;
  payBtn.textContent = "กำลังสร้างออเดอร์...";

  // ---------- มีโค้ดส่วนลดที่ใช้ผ่านแล้ว -> สร้างออเดอร์ผ่าน Edge Function (หักสิทธิ์โค้ดแบบปลอดภัย) ----------
  if (appliedDiscount) {
    let body;
    try {
      const res = await fetch(`${FUNCTIONS_URL}/create-order-with-discount`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          eventId: currentEvent.id,
          packageId: selectedPackage.id,
          dayOptionId: selectedDayOptionId,
          code: appliedDiscount.code,
        }),
      });
      body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error || "สร้างออเดอร์ไม่สำเร็จ");
    } catch (err) {
      payBtn.disabled = false;
      payBtn.textContent = "ชำระเงิน";
      errorEl.textContent = err.message || "สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่";
      return;
    }

    window.location.href = `./payment.html?order=${body.orderId}`;
    return;
  }

  // ---------- ไม่มีโค้ดส่วนลด -> สร้างออเดอร์แบบเดิม ----------
  const orderNumber = `ORD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      order_number: orderNumber,
      user_id: session.user.id,
      event_id: currentEvent.id,
      package_id: selectedPackage.id,
      day_option_id: selectedDayOptionId,
      amount: selectedPackage.price,
    })
    .select()
    .single();

  payBtn.disabled = false;
  payBtn.textContent = "ชำระเงิน";

  if (error) {
    errorEl.textContent = "สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่";
    return;
  }

  window.location.href = `./payment.html?order=${order.id}`;
});

// ============================================================
// สั่งซื้อโดยไม่สมัครสมาชิก (แขก)
// ============================================================
function openGuestDialog() {
  document.getElementById("guestOverlay")?.remove();
  const saved = getGuestContact();
  const overlay = document.createElement("div");
  overlay.id = "guestOverlay";
  overlay.className = "modal-overlay";
  overlay.style.cssText = "display:flex; z-index:100001;";
  overlay.innerHTML = `
    <div class="admin-card modal-card" style="text-align:left; max-width:420px;">
      <h2 class="display" style="font-size:18px; margin:0 0 12px; text-align:center;">สั่งซื้อโดยไม่สมัครสมาชิก</h2>
      <div style="margin-bottom:14px;">${guestNoticeHtml()}</div>
      <label class="field-label" for="guestName">ชื่อ <span class="muted" style="font-size:11px;">(ไว้ให้แอดมินตรวจสอบสลิป)</span></label>
      <input id="guestName" class="field-input" maxlength="60" autocomplete="name" value="${escapeHtml(saved.name || "")}" style="margin-bottom:10px;" />
      <label class="field-label" for="guestLine">LINE ID <span class="muted" style="font-size:11px;">(ไม่บังคับ ไว้ให้แอดมินติดต่อกลับ)</span></label>
      <input id="guestLine" class="field-input" maxlength="40" value="${escapeHtml(saved.line || "")}" style="margin-bottom:6px;" />
      <p id="guestError" class="error-text" style="min-height:18px; margin:6px 0 10px; font-size:13px;"></p>
      <div style="display:flex; flex-direction:column; gap:10px;">
        <button type="button" id="guestGoBtn" class="btn-marquee" style="margin:0;">ดำเนินการสั่งซื้อ</button>
        <button type="button" id="guestLoginBtn" class="icon-btn ghost">เข้าสู่ระบบ / สมัครสมาชิกแทน</button>
        <button type="button" id="guestCancelBtn" class="icon-btn ghost">ยกเลิก</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });
  document.getElementById("guestCancelBtn").addEventListener("click", close);
  document.getElementById("guestLoginBtn").addEventListener("click", () => {
    // ไปเข้าสู่ระบบ: ตัดส่วนลดออกก่อน แล้วจำโค้ดไว้ให้กรอกใหม่ตอนกลับมา (เหมือนเดิม)
    const pendingCode = appliedDiscount?.code || document.getElementById("discountCodeInput")?.value.trim().toUpperCase();
    gotoLogin(pendingCode);
  });
  document.getElementById("guestGoBtn").addEventListener("click", () => submitGuestOrder(overlay));
  document.getElementById("guestName").focus();
}

async function submitGuestOrder(overlay) {
  const errEl = document.getElementById("guestError");
  const goBtn = document.getElementById("guestGoBtn");
  const name = document.getElementById("guestName").value.trim();
  const line = document.getElementById("guestLine").value.trim();
  errEl.textContent = "";
  if (!name) {
    errEl.textContent = "กรุณากรอกชื่อ";
    return;
  }

  goBtn.disabled = true;
  goBtn.textContent = "กำลังสร้างออเดอร์...";
  try {
    const res = await fetch(`${FUNCTIONS_URL}/create-order-with-discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({
        eventId: currentEvent.id,
        packageId: selectedPackage.id,
        dayOptionId: selectedDayOptionId,
        code: appliedDiscount?.code || "",
        guestName: name,
        guestLine: line,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.success || !body.guestToken) throw new Error(body.error || "สร้างออเดอร์ไม่สำเร็จ");

    saveGuestContact(name, line);
    saveGuestOrder({
      id: body.orderId,
      token: body.guestToken,
      order_number: body.orderNumber,
      title: currentEvent.title,
      amount: body.amount,
    });
    window.location.href = `./payment.html?order=${body.orderId}`;
  } catch (err) {
    goBtn.disabled = false;
    goBtn.textContent = "ดำเนินการสั่งซื้อ";
    errEl.textContent = err.message || "สร้างออเดอร์ไม่สำเร็จ กรุณาลองใหม่";
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
