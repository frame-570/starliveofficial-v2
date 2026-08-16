import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth } from "./auth.js";

renderHeaderAuth();
loadEvents();
loadFooterSocial();

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

async function loadFooterSocial() {
  const wrap = document.getElementById("footerSocial");
  if (!wrap) return;

  const { data } = await supabase
    .from("app_settings")
    .select("line_oa_url, tiktok_url")
    .eq("id", 1)
    .maybeSingle();

  const icons = [];

  if (data?.tiktok_url) {
    icons.push(`
      <a href="${escapeHtml(data.tiktok_url)}" target="_blank" rel="noopener" class="site-footer-icon" aria-label="TikTok">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48Z"/></svg>
      </a>
    `);
  }

  if (data?.line_oa_url) {
    icons.push(`
      <a href="${escapeHtml(data.line_oa_url)}" target="_blank" rel="noopener" class="site-footer-icon" aria-label="LINE">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor"><path d="M12 2C6.48 2 2 5.94 2 10.8c0 4.36 3.58 8.01 8.42 8.71.33.07.77.22.88.5.1.26.07.66.03.92l-.14.86c-.04.26-.2 1 .88.55s5.8-3.42 7.92-5.85C21.4 14.05 22 12.5 22 10.8 22 5.94 17.52 2 12 2Zm-3.3 11.06H7.05a.4.4 0 0 1-.4-.4V8.32c0-.22.18-.4.4-.4s.4.18.4.4v3.94h1.25c.22 0 .4.18.4.4s-.18.4-.4.4Zm1.9-.4c0 .22-.18.4-.4.4s-.4-.18-.4-.4V8.32c0-.22.18-.4.4-.4s.4.18.4.4v4.34Zm4.68 0c0 .18-.11.33-.28.38a.4.4 0 0 1-.44-.14l-2.13-2.9v2.66c0 .22-.18.4-.4.4s-.4-.18-.4-.4V8.32c0-.18.11-.33.28-.38a.38.38 0 0 1 .44.13l2.13 2.9V8.32c0-.22.18-.4.4-.4s.4.18.4.4v4.34Zm3.09-2.57c.22 0 .4.18.4.4s-.18.4-.4.4h-1.65v1.37h1.65c.22 0 .4.18.4.4s-.18.4-.4.4h-2.05a.4.4 0 0 1-.4-.4V8.32c0-.22.18-.4.4-.4h2.05c.22 0 .4.18.4.4s-.18.4-.4.4h-1.65v1.37Z"/></svg>
      </a>
    `);
  }

  wrap.innerHTML = icons.join("");
}
