// ไอคอน SVG ที่ใช้ร่วมกันทั้งเว็บ (แทนอิโมจิ/สัญลักษณ์ตัวอักษร) — สีตาม currentColor
const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  pin: '<path d="M12 21s-6-5.6-6-10a6 6 0 1112 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  megaphone: '<path d="M3 10v4a1 1 0 001 1h3l8 4V5L7 9H4a1 1 0 00-1 1z"/><path d="M19 9a4 4 0 010 6"/>'
};

export function svgIcon(name, size = 18, strokeWidth = 2, style = "") {
  const st = style ? ` style="${style}"` : "";
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${st}>${PATHS[name] || ""}</svg>`;
}

// จุดสีทึบ (ใช้แทน 🟢) สีตาม currentColor
export function svgDot(size = 10) {
  return `<svg class="ico" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" style="vertical-align:middle;margin-right:5px"><circle cx="12" cy="12" r="10" fill="currentColor"/></svg>`;
}
