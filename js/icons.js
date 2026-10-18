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

// ============================================================
// ไอคอน/ภาพประกอบ SVG สำหรับระบบ "ออกแบบป้าย" (ริชเมนู + ช่องทางชำระเงิน)
// ทุกอันวาดบนพื้นที่ 100×100 ใช้สีเดียวตามที่ส่งเข้ามา (เส้นนีออน) เปลี่ยนสีช่องแล้วไอคอนเปลี่ยนตาม
// ============================================================
function starPoints(cx, cy, r) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (Math.PI * i) / 5;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

const SIGN_ICON_BUILDERS = {
  // รถเข็นสั่งซื้อ
  cart: (c) =>
    `<path d="M8 20h13l9 40h42l8-32H26"/><circle cx="38" cy="76" r="6"/><circle cx="66" cy="76" r="6"/><path d="M36 38h40M40 49h34M46 30v28M60 30v28"/><path d="M4 34h10M2 46h9" opacity=".8"/>`,
  // ฟองแชต + หูฟังแอดมิน
  support: (c) =>
    `<path d="M10 40a8 8 0 018-8h18a8 8 0 018 8v12a8 8 0 01-8 8H26l-10 9v-9a8 8 0 01-6-8z"/><circle cx="21" cy="46" r="2.4" fill="${c}"/><circle cx="28" cy="46" r="2.4" fill="${c}"/><circle cx="35" cy="46" r="2.4" fill="${c}"/><path d="M58 52v-6a18 18 0 0136 0v6"/><rect x="54" y="50" width="8" height="18" rx="3"/><rect x="90" y="50" width="8" height="18" rx="3" transform="translate(-4 0)"/><path d="M88 68c0 8-8 12-18 12"/>`,
  // ร้านค้า + ดาวรีวิว 5 ดวง
  review: (c) =>
    `<path d="M24 12h52l8 20H16z"/><path d="M16 32a8.5 8.5 0 0017 0a8.5 8.5 0 0017 0a8.5 8.5 0 0017 0a8.5 8.5 0 0017 0"/><path d="M21 40v24h58V40"/><path d="M42 64V50h16v14"/>` +
    [20, 35, 50, 65, 80].map((x) => `<polygon fill="${c}" stroke-width="2" points="${starPoints(x, 82, 8)}"/>`).join(""),
  // ปุ่มเล่นไลฟ์สตรีม
  live: (c) =>
    `<circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="29" opacity=".55"/><path d="M42 33l26 17-26 17z" fill="${c}"/>`,
  // ฟองแชตซ้อนกัน
  chat: (c) =>
    `<path d="M10 24a10 10 0 0110-10h38a10 10 0 0110 10v22a10 10 0 01-10 10H36L22 68V56h-2a10 10 0 01-10-10z"/><circle cx="26" cy="35" r="3" fill="${c}"/><circle cx="39" cy="35" r="3" fill="${c}"/><circle cx="52" cy="35" r="3" fill="${c}"/><path d="M76 38h6a10 10 0 0110 10v18a10 10 0 01-10 10h-1v10L68 76H54a10 10 0 01-9-6" opacity=".8"/>`,
  // กล่องของขวัญ + ป้ายเปอร์เซ็นต์
  gift: (c) =>
    `<rect x="14" y="42" width="66" height="42" rx="3"/><rect x="8" y="30" width="78" height="14" rx="3"/><path d="M47 30v54"/><path d="M47 30c-5-14-22-16-22-7s15 7 22 7zM47 30c5-14 22-16 22-7s-15 7-22 7z"/><circle cx="76" cy="74" r="16" fill="#0a0c16"/><circle cx="76" cy="74" r="16"/><circle cx="70" cy="68" r="2.8" fill="${c}" stroke-width="1"/><circle cx="82" cy="80" r="2.8" fill="${c}" stroke-width="1"/><path d="M83 66L69 82" stroke-width="3.5"/>`,
  // บัตร/ตั๋ว
  ticket: (c) =>
    `<path d="M8 30h84v14a8 8 0 000 16v14H8V60a8 8 0 000-16z"/><path d="M66 30v8M66 46v8M66 62v8" stroke-dasharray="1 0"/><path d="M22 46h30M22 58h22"/>`,
  // ดาว
  star: (c) =>
    `<polygon points="${starPoints(50, 52, 40)}"/><path d="M84 14v12M78 20h12M14 18v8M10 22h8" opacity=".8"/>`,
  // หัวใจ
  heart: (c) =>
    `<path d="M50 84S10 60 10 34a20 20 0 0140-6 20 20 0 0140 6c0 26-40 50-40 50z"/>`,
  // โทรโข่งประกาศ
  megaphone: (c) =>
    `<path d="M14 40v20a4 4 0 004 4h12l36 18V18L30 36H18a4 4 0 00-4 4z"/><path d="M80 38a16 16 0 010 24M88 28a30 30 0 010 44"/><path d="M30 64l6 20h10l-6-20"/>`,
};

// รายการไอคอนให้ตัวออกแบบเลือก (id, ชื่อไทย)
export const SIGN_ICON_LIST = [
  { id: "cart", label: "รถเข็นสั่งซื้อ" },
  { id: "support", label: "แชต + แอดมิน" },
  { id: "review", label: "ร้านค้า + รีวิวดาว" },
  { id: "live", label: "ปุ่มเล่นไลฟ์" },
  { id: "chat", label: "ฟองแชต" },
  { id: "gift", label: "ของขวัญ/โปรโมชั่น" },
  { id: "ticket", label: "บัตรเข้างาน" },
  { id: "star", label: "ดาว" },
  { id: "heart", label: "หัวใจ" },
  { id: "megaphone", label: "ประกาศ" },
];

// คืนสตริง SVG ของไอคอนป้าย (สีเส้น = color)
export function signIconSvg(id, color = "#ffffff", size = 200, strokeWidth = 5) {
  const build = SIGN_ICON_BUILDERS[id] || SIGN_ICON_BUILDERS.star;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${build(color)}</svg>`;
}

// ภาพประกอบตกแต่งป้ายช่องทางชำระเงิน (SVG สีสันในตัว ใช้สีเน้น accent ที่ส่งเข้ามา)
export function signIllustrationSvg(name, accent = "#ffd84a") {
  if (name === "coin") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200"><defs><radialGradient id="cg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#fff8c9"/><stop offset=".45" stop-color="${accent}"/><stop offset="1" stop-color="#b07a00"/></radialGradient></defs><ellipse cx="100" cy="112" rx="70" ry="70" fill="#7a4f00" opacity=".35"/><circle cx="100" cy="100" r="72" fill="url(#cg)" stroke="#fff3a8" stroke-width="5"/><circle cx="100" cy="100" r="56" fill="none" stroke="#b07a00" stroke-width="5" opacity=".7"/><polygon points="${starPoints(100, 102, 34)}" fill="#fff6c4" stroke="#b07a00" stroke-width="4" stroke-linejoin="round"/><path d="M168 30v22M157 41h22M26 150v14M19 157h14" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>`;
  }
  if (name === "phone") {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260" width="200" height="260"><defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a2f63"/><stop offset="1" stop-color="#121533"/></linearGradient></defs><rect x="36" y="10" width="128" height="240" rx="24" fill="url(#pg)" stroke="#e8ecff" stroke-width="6"/><rect x="82" y="22" width="36" height="8" rx="4" fill="#e8ecff" opacity=".7"/><path d="M62 70v-14h14M138 70v-14h-14M62 150v14h14M138 150v14h-14" fill="none" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><rect x="78" y="82" width="18" height="18" rx="3" fill="#fff"/><rect x="104" y="82" width="18" height="18" rx="3" fill="#fff"/><rect x="78" y="108" width="18" height="18" rx="3" fill="#fff"/><rect x="104" y="114" width="8" height="8" fill="#fff"/><circle cx="100" cy="206" r="22" fill="${accent}"/><path d="M89 206l8 8 15-17" fill="none" stroke="#1a1400" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  return "";
}
