// ธีมของหน้ารีวิว — ชุดเดียวกับระบบสร้างโปสเตอร์ (poster.js)
export const REVIEW_THEMES = [
  { id: "st", label: "ST THEMES" },
  { id: "halloween", label: "HALLOWEEN THEMES" },
  { id: "loikrathong", label: "LOI KRATHONG THEMES" },
  { id: "winter", label: "WINTER WONDERLAND THEMES" },
  { id: "christmas", label: "CHRISTMAS THEMES" },
  { id: "newyear", label: "NEW YEAR COUNTDOWN THEMES" },
];

export function normalizeTheme(id) {
  return REVIEW_THEMES.some((t) => t.id === id) ? id : "st";
}

export function starsSvg(rating, size = 22) {
  const full = Math.max(0, Math.min(5, Number(rating) || 0));
  let out = "";
  for (let i = 1; i <= 5; i++) {
    const filled = i <= full;
    out += `<svg class="rv-star ${filled ? "is-on" : ""}" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.95 6.1 6.7.9-4.9 4.65 1.2 6.65L12 17.6l-5.95 3.2 1.2-6.65-4.9-4.65 6.7-.9z" stroke-linejoin="round"/></svg>`;
  }
  return `<span class="rv-stars" role="img" aria-label="${full} จาก 5 ดาว">${out}</span>`;
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

export function formatThaiDate(iso) {
  return new Date(iso).toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
}
