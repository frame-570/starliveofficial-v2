import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";

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

function renderPackageTabs(packages) {
  const wrap = document.getElementById("packageTabs");
  const sorted = [...packages].sort((a, b) => a.num_days - b.num_days);

  if (sorted.length === 0) {
    wrap.innerHTML = `<p class="muted" style="font-size:13.5px;">งานนี้ยังไม่เปิดขายบัตร</p>`;
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
          flex-shrink:0;">✓</span>
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
  totalEl.textContent = selectedPackage
    ? `${Number(selectedPackage.price).toLocaleString("th-TH")}฿`
    : "—";
}

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
  if (!session) {
    const redirect = `./login.html?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    window.location.href = redirect;
    return;
  }

  const payBtn = document.getElementById("payBtn");
  payBtn.disabled = true;
  payBtn.textContent = "กำลังสร้างออเดอร์...";

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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
