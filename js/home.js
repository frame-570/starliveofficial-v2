import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth } from "./auth.js";

renderHeaderAuth();
loadEvents();

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function formatDateRange(dates) {
  if (!dates.length) return "";
  const sorted = [...dates].sort();
  const days = sorted.map((d) => new Date(d).getDate());
  const lastDate = new Date(sorted[sorted.length - 1]);
  const month = THAI_MONTHS[lastDate.getMonth()];
  return `${days.join("-")} ${month}`;
}

async function loadEvents() {
  const grid = document.getElementById("eventGrid");
  const empty = document.getElementById("eventEmpty");
  const loading = document.getElementById("eventLoading");

  const { data: events, error } = await supabase
    .from("events")
    .select("*, event_days(event_date), ticket_packages(price)");

  loading.style.display = "none";

  if (error) {
    empty.textContent = "โหลดรายการงานไม่สำเร็จ กรุณาลองใหม่";
    empty.style.display = "block";
    return;
  }

  if (!events || events.length === 0) {
    empty.style.display = "block";
    return;
  }

  // เรียงจากวันจัดงานล่าสุด (วันสุดท้ายของงาน) ไปเก่าสุด ไม่ใช่วันที่สร้างในระบบ
  // งานที่ยังไม่กำหนดวันเลย ให้ตกไปอยู่ท้ายสุด
  const sortedEvents = [...events].sort((a, b) => getLastEventDate(b) - getLastEventDate(a));

  grid.innerHTML = sortedEvents.map(renderCard).join("");

  grid.querySelectorAll("[data-event-id]").forEach((el) => {
    el.addEventListener("click", () => {
      window.location.href = `./event-detail.html?id=${el.dataset.eventId}`;
    });
  });
}

function getLastEventDate(event) {
  const dates = (event.event_days || [])
    .map((d) => new Date(d.event_date).getTime())
    .filter((t) => !isNaN(t));
  return dates.length ? Math.max(...dates) : -Infinity;
}

function renderCard(event) {
  const dateLabel = formatDateRange((event.event_days || []).map((d) => d.event_date));
  const prices = (event.ticket_packages || []).map((p) => Number(p.price)).filter((n) => !isNaN(n));
  const minPrice = prices.length ? Math.min(...prices) : null;
  const priceLabel = minPrice !== null ? `เริ่มต้น ${minPrice.toLocaleString("th-TH")}฿` : "เร็วๆ นี้";
  const banner = event.banner_url || "";
  const isLive = event.status === "live";
  const isRerun = event.status === "rerun";

  return `
    <article class="event-card" data-event-id="${escapeHtml(event.id)}">
      <div class="event-card-banner" style="${banner ? `background-image:url('${escapeHtml(banner)}')` : ""}">
        ${!banner ? `<div class="event-card-banner-fallback">${escapeHtml(event.title)}</div>` : ""}
        ${isLive ? `<span class="live-badge event-card-badge"><span class="live-dot"></span> LIVE</span>` : ""}
        ${isRerun ? `<span class="event-card-badge event-card-badge-rerun">รีรัน</span>` : ""}
      </div>
      <div class="event-card-body">
        <h3 class="display event-card-title">${escapeHtml(event.title)}</h3>
        <div class="event-card-meta">
          <span class="event-card-date">${escapeHtml(dateLabel)}</span>
          <span class="event-card-price">${escapeHtml(priceLabel)}</span>
        </div>
      </div>
    </article>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
