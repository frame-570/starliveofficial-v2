// ไอคอน SVG ที่ใช้ร่วมกันทั้งเว็บ (แทนอิโมจิ/สัญลักษณ์ตัวอักษร) — สีตาม currentColor
const PATHS = {
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  tag: '<path d="M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0L3 13V3h10l7.6 7.6a2 2 0 010 2.8z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  pin: '<path d="M12 21s-6-5.6-6-10a6 6 0 1112 0c0 4.4-6 10-6 10z"/><circle cx="12" cy="11" r="2.2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
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

// โลโก้สไตล์ LINE (สี่เหลี่ยมมนสีเขียว + ฟองคำพูดสีขาว) ใช้กับปุ่มเข้ากลุ่ม
export function lineLogo(size = 24) {
  return `<svg class="ico" viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><rect width="48" height="48" rx="11" fill="#06C755"/><path d="M24 10C14.6 10 7 16 7 23.4c0 6.6 6 12.1 14.2 13.2.6.1 1.3.4 1.5.9.2.5.1 1.2 0 1.7l-.2 1.3c-.1.4-.4 1.6 1.4.9s9.7-5.7 13.2-9.7c2.4-2.6 3.9-5.3 3.9-8.3C41 16 33.4 10 24 10z" fill="#fff"/><text x="24" y="27" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="800" font-size="9.5" fill="#06C755">LINE</text></svg>`;
}
