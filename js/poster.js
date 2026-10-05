// ============================================================
// ระบบสร้างโปสเตอร์โปรโมทงาน (วาดด้วย canvas แล้วดาวน์โหลดเป็น PNG)
// ใช้: openPosterMaker(ev)  — ev = แถวงานจากตาราง events (มี event_days, ticket_packages)
// สีและพื้นหลังใช้ชุดเดียวกับเว็บ (stage / amber / crimson) ตัวหนังสือสีเหลืองและขาว
// ไม่มี QR และไอดีไลน์บนโปสเตอร์ (กันแพลตฟอร์มลบคลิป) ช่องทางติดต่อให้ใส่ในแคปชั่นแทน
// ============================================================

const W = 1080;
const H = 1780;

const C = {
  stage: "#08070d",
  surface: "#131120",
  surface2: "#1b1730",
  line: "#2c2745",
  amber: "#f2b705",
  amberLight: "#ffd24a",
  crimson: "#e8384f",
  text: "#f5f2ea",
};

const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

const LS_KEY = "starlive_poster_settings_v1";

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || {};
  } catch {
    return {};
  }
}
function saveSettings(patch) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ ...loadSettings(), ...patch }));
  } catch {
    // เก็บไม่ได้ (เช่น พื้นที่เต็ม) ข้ามไป
  }
}

// ---------- ข้อมูลตั้งต้นจากงาน ----------
function formatThaiDates(days) {
  const parsed = (days || [])
    .map((d) => String(d.event_date || "").split("-").map(Number))
    .filter((p) => p.length === 3 && p.every((n) => !isNaN(n)))
    .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  if (!parsed.length) return "";

  const first = parsed[0];
  const last = parsed[parsed.length - 1];
  const full = (p) => `${p[2]} ${THAI_MONTHS[p[1] - 1]} ${p[0]}`;

  if (parsed.length === 1) return full(first);

  if (first[0] === last[0] && first[1] === last[1]) {
    const nums = parsed.map((p) => p[2]);
    const contiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
    const dayPart = contiguous ? `${nums[0]} - ${nums[nums.length - 1]}` : nums.join(", ");
    return `${dayPart} ${THAI_MONTHS[first[1] - 1]} ${first[0]}`;
  }
  return `${full(first)} - ${full(last)}`;
}

function defaultsFromEvent(ev) {
  const saved = loadSettings();
  const prices = (ev.ticket_packages || []).map((p) => Number(p.price)).filter((n) => !isNaN(n));
  const minPrice = prices.length ? Math.min(...prices) : "";
  const manyPrices = new Set(prices).size > 1;
  const months = ev.rerun_duration_months || 6;
  return {
    subtitle: saved.subtitle || "เปิดหารจอไลฟ์สตรีม",
    title: ev.title || "",
    dateText: formatThaiDates(ev.event_days),
    timeText: saved.timeText || "14:00 น.",
    priceLabel: manyPrices ? "ราคาเริ่มต้น" : "ราคาเพียง",
    price: minPrice === "" ? "" : String(minPrice),
    priceCaption: `ชมสด+รีรัน(นาน${months}เดือน)+E-Photo`,
    months,
    detailsTitle: saved.detailsTitle || "สิ่งที่ลูกค้าจะได้รับ",
    details: [
      "ชมสดตามวันที่เลือก",
      "รับชมผ่านลิงก์",
      "แถม E-Photo",
      "ภาพคมชัด 1080p",
      `รีรันย้อนหลังนาน ${months} เดือน`,
    ].join("\n"),
  };
}

// ---------- ตัวช่วยวาด ----------
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setFont(ctx, weight, size, family = "Prompt") {
  ctx.font = `${weight} ${size}px ${family}, "Noto Sans Thai", sans-serif`;
}

function fitSize(ctx, text, maxW, start, min, weight, family = "Prompt") {
  let s = start;
  setFont(ctx, weight, s, family);
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    setFont(ctx, weight, s, family);
  }
  return s;
}

function wrapLines(ctx, text, maxW) {
  const segs =
    typeof Intl !== "undefined" && Intl.Segmenter
      ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), (s) => s.segment)
      : Array.from(text);
  const lines = [];
  let cur = "";
  for (const seg of segs) {
    const test = cur + seg;
    if (ctx.measureText(test).width > maxW && cur) {
      lines.push(cur.trimEnd());
      cur = seg.trimStart();
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur.trimEnd());
  return lines;
}

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sparkle(ctx, x, y, r, color, glow = 0) {
  ctx.save();
  if (glow) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  const k = r * 0.14;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.quadraticCurveTo(x + k, y - k, x + r, y);
  ctx.quadraticCurveTo(x + k, y + k, x, y + r);
  ctx.quadraticCurveTo(x - k, y + k, x - r, y);
  ctx.quadraticCurveTo(x - k, y - k, x, y - r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function ellipseGlow(ctx, cx, cy, rx, ry, rgba) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, rgba);
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

// ---------- พื้นหลัง: สไตล์เดียวกับเว็บ (เวทีมืด + แสงสปอตไลต์สีเหลือง + แสงแดงด้านล่าง) ----------
function drawBackground(ctx) {
  ctx.fillStyle = C.stage;
  ctx.fillRect(0, 0, W, H);

  ellipseGlow(ctx, W / 2, 0, 700, 520, "rgba(242,183,5,0.16)");
  ellipseGlow(ctx, W / 2, H + 80, 760, 560, "rgba(232,56,79,0.12)");

  // แท่งแสงเอียงซ้าย-ขวา เหมือน .stage-bg
  for (const side of [-1, 1]) {
    ctx.save();
    const cx = side < 0 ? W * 0.08 + W * 0.2 : W * 0.92 - W * 0.2;
    ctx.translate(cx, 0);
    ctx.transform(1, 0, side * 0.14, 1, 0, 0);
    const g = ctx.createLinearGradient(0, -H * 0.1, 0, H * 0.75);
    g.addColorStop(0, "rgba(242,183,5,0.10)");
    g.addColorStop(1, "rgba(242,183,5,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, -H * 0.1, W * 0.4, H * 1.2);
    ctx.restore();
  }

  // ดาวเล็กๆ กระจาย
  const rnd = mulberry32(2026);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 1 + rnd() * 2.2;
    const warm = rnd() > 0.5;
    ctx.fillStyle = warm ? `rgba(242,183,5,${0.25 + rnd() * 0.5})` : `rgba(245,242,234,${0.2 + rnd() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const spots = [
    [1036, 140, 16], [26, 1010, 13], [1050, 1010, 12], [30, 1560, 13],
    [520, 1330, 12], [1040, 1560, 15], [26, 440, 11],
  ];
  spots.forEach(([x, y, r]) => sparkle(ctx, x, y, r, C.amberLight, 14));
}

function drawBrand(ctx, cy, size) {
  setFont(ctx, 800, size);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
  const text = "STARLIVE OFFICIAL";
  const tw = ctx.measureText(text).width;
  ctx.save();
  ctx.shadowColor = "rgba(242,183,5,0.55)";
  ctx.shadowBlur = 18;
  ctx.fillStyle = C.amber;
  ctx.fillText(text, W / 2, cy);
  ctx.restore();
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  sparkle(ctx, W / 2 - tw / 2 - size * 1.0, cy, size * 0.8, C.amberLight, 20);
  sparkle(ctx, W / 2 + tw / 2 + size * 1.0, cy, size * 0.8, C.amberLight, 20);
}

function panel(ctx, x, y, w, h, r, stroke, strokeW = 3, fill = "rgba(19,17,32,0.62)") {
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = strokeW;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function drawCover(ctx, img, x, y, w, h, r) {
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.clip();
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

// ---------- ไอคอน ----------
function iconCalendar(ctx, x, y, s) {
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.fillStyle = C.text;
  ctx.lineWidth = 4;
  rr(ctx, x, y + 8, s, s - 8, 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, y + 28);
  ctx.lineTo(x + s, y + 28);
  ctx.moveTo(x + 18, y);
  ctx.lineTo(x + 18, y + 16);
  ctx.moveTo(x + s - 18, y);
  ctx.lineTo(x + s - 18, y + 16);
  ctx.stroke();
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) ctx.fillRect(x + 12 + c * 16, y + 36 + r * 12, 9, 6);
  }
  ctx.restore();
}

function iconClock(ctx, x, y, s) {
  const cx = x + s / 2;
  const cy = y + s / 2;
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, s / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20);
  ctx.lineTo(cx, cy);
  ctx.lineTo(cx + 15, cy + 9);
  ctx.stroke();
  ctx.restore();
}

function iconFHD(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 5;
  rr(ctx, cx - 56, cy - 40, 112, 80, 12);
  ctx.stroke();
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setFont(ctx, 800, 46);
  ctx.fillText("FHD", cx, cy + 3);
  ctx.restore();
}

function iconDevices(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 4;
  ctx.lineCap = "round";
  rr(ctx, cx - 66, cy - 46, 96, 62, 6);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy + 16);
  ctx.lineTo(cx - 18, cy + 32);
  ctx.moveTo(cx - 38, cy + 32);
  ctx.lineTo(cx + 2, cy + 32);
  ctx.stroke();
  ctx.fillStyle = "#171428";
  rr(ctx, cx + 8, cy - 30, 58, 78, 8);
  ctx.fill();
  ctx.stroke();
  rr(ctx, cx - 42, cy - 2, 32, 52, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function iconReplay(ctx, cx, cy) {
  ctx.save();
  ctx.strokeStyle = C.text;
  ctx.fillStyle = C.text;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  const r = 40;
  const a0 = -Math.PI * 0.18;
  const a1 = a0 - Math.PI * 1.62;
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1, true);
  ctx.stroke();
  const px = cx + r * Math.cos(a1);
  const py = cy + r * Math.sin(a1);
  const tx = Math.sin(a1);
  const ty = -Math.cos(a1);
  const nx = Math.cos(a1);
  const ny = Math.sin(a1);
  ctx.beginPath();
  ctx.moveTo(px + tx * 20, py + ty * 20);
  ctx.lineTo(px + nx * 17, py + ny * 17);
  ctx.lineTo(px - nx * 17, py - ny * 17);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy - 16);
  ctx.lineTo(cx - 11, cy + 16);
  ctx.lineTo(cx + 17, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ตั๋วสีทอง มีรอยเว้าสองข้างและเส้นปรุ
function ticketPath(ctx, x, y, w, h, r, n) {
  const my = y + h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, my - n);
  ctx.arc(x + w, my, n, -Math.PI / 2, Math.PI / 2, true);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, my + n);
  ctx.arc(x, my, n, Math.PI / 2, -Math.PI / 2, true);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function iconTicket(ctx, cx, cy) {
  const w = 150;
  const h = 54;
  const x = cx - w / 2;
  const y = cy - h / 2;
  ctx.save();
  ctx.shadowColor = "rgba(242,183,5,0.5)";
  ctx.shadowBlur = 16;
  ticketPath(ctx, x, y, w, h, 9, 8);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, "#ffe27a");
  g.addColorStop(0.5, "#f2b705");
  g.addColorStop(1, "#c98f00");
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();

  // เส้นปรุ
  const dx = x + w * 0.74;
  ctx.save();
  ctx.strokeStyle = "rgba(60,40,0,0.55)";
  ctx.lineWidth = 2.5;
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.moveTo(dx, y + 6);
  ctx.lineTo(dx, y + h - 6);
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = "#2b1d00";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  setFont(ctx, 800, 22);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("TICKET", x + (dx - x) / 2 - 1, cy + 1);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  sparkle(ctx, dx + (x + w - dx) / 2, cy, 9, "#2b1d00");
  ctx.textBaseline = "alphabetic";
}

// ตัวอักษรเรียงตามส่วนโค้งด้านบนของวงกลม
function arcText(ctx, text, cx, cy, radius, px, spacing, color) {
  ctx.save();
  setFont(ctx, 700, px);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = Array.from(text);
  const ws = chars.map((c) => ctx.measureText(c).width);
  const total = ws.reduce((a, b) => a + b, 0) + spacing * (chars.length - 1);
  let ang = -Math.PI / 2 - total / radius / 2;
  chars.forEach((ch, i) => {
    const a = ang + ws[i] / 2 / radius;
    ctx.save();
    ctx.translate(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
    ang += (ws[i] + spacing) / radius;
  });
  ctx.restore();
}

// ป้ายวงกลม "รับจำนวนจำกัด / เต็มปิดรับทันที": ตราทอง วงแหวนซ้อน ขอบประจุด ตั๋วทอง
function drawLimitedBadge(ctx, cx, cy, R) {
  // แสงฟุ้งรอบวง
  const glow = ctx.createRadialGradient(cx, cy, R * 0.85, cx, cy, R * 1.3);
  glow.addColorStop(0, "rgba(242,183,5,0.30)");
  glow.addColorStop(1, "rgba(242,183,5,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.3, 0, Math.PI * 2);
  ctx.fill();

  // พื้นวง
  const disc = ctx.createRadialGradient(cx, cy - R * 0.25, 10, cx, cy, R);
  disc.addColorStop(0, "rgba(58,42,86,0.97)");
  disc.addColorStop(0.7, "rgba(24,19,44,0.97)");
  disc.addColorStop(1, "rgba(12,10,26,0.98)");
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = disc;
  ctx.fill();

  // วงแหวนทองด้านนอก
  ctx.save();
  const ring = ctx.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
  ring.addColorStop(0, "#fff0b0");
  ring.addColorStop(0.28, "#f2b705");
  ring.addColorStop(0.55, "#a67d05");
  ring.addColorStop(0.8, "#f2b705");
  ring.addColorStop(1, "#ffe27a");
  ctx.shadowColor = "rgba(242,183,5,0.6)";
  ctx.shadowBlur = 20;
  ctx.lineWidth = 9;
  ctx.strokeStyle = ring;
  ctx.beginPath();
  ctx.arc(cx, cy, R - 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // เส้นทองบางด้านใน
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(255,226,122,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, R - 17, 0, Math.PI * 2);
  ctx.stroke();

  // วงจุดไข่ปลา
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = "rgba(245,242,234,0.5)";
  ctx.setLineDash([0.1, 10]);
  ctx.beginPath();
  ctx.arc(cx, cy, R - 29, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ตัวอักษรโค้งด้านบน + ดาวคู่
  arcText(ctx, "LIMITED SEATS", cx, cy, R - 54, 20, 5, C.amberLight);

  // ข้อความหลัก
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  const maxW = 248;
  const size = fitSize(ctx, "เต็มปิดรับทันที", maxW, 44, 26, 800);
  ctx.save();
  ctx.fillStyle = C.text;
  setFont(ctx, 700, Math.min(size, 42));
  ctx.fillText("รับจำนวนจำกัด", cx, cy - 26);
  ctx.shadowColor = "rgba(242,183,5,0.55)";
  ctx.shadowBlur = 14;
  ctx.fillStyle = C.amberLight;
  setFont(ctx, 800, size);
  ctx.fillText("เต็มปิดรับทันที", cx, cy + 24);
  ctx.restore();

  iconTicket(ctx, cx, cy + 82);

  // ดาวบนวงแหวนซ้าย-ขวา
  sparkle(ctx, cx - R, cy, 13, C.amberLight, 14);
  sparkle(ctx, cx + R, cy, 13, C.amberLight, 14);
}

// ---------- วาดโปสเตอร์ทั้งใบ ----------
function drawPoster(canvas, st, images) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  drawBackground(ctx);

  // หัว: ชื่อร้านสีเหลือง + ดาว
  drawBrand(ctx, 95, 56);

  // ----- ซ้าย: รูปโปสเตอร์งาน -----
  const imgX = 60;
  const imgY = 190;
  const imgW = 460;
  const imgH = 613;
  panel(ctx, imgX - 14, imgY - 14, imgW + 28, imgH + 28, 30, "rgba(242,183,5,0.35)", 2, "rgba(27,23,48,0.7)");
  if (images.poster) {
    drawCover(ctx, images.poster, imgX, imgY, imgW, imgH, 20);
  } else {
    rr(ctx, imgX, imgY, imgW, imgH, 20);
    ctx.fillStyle = C.surface2;
    ctx.fill();
    ctx.fillStyle = "rgba(245,242,234,0.55)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    setFont(ctx, 600, 30, "Sarabun");
    ctx.fillText("เลือกรูปโปสเตอร์งาน", imgX + imgW / 2, imgY + imgH / 2);
    ctx.textBaseline = "alphabetic";
  }
  ctx.textAlign = "center";
  ctx.fillStyle = C.amber;
  setFont(ctx, 800, 34);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "2px";
  ctx.fillText("STARLIVE OFFICIAL", imgX + imgW / 2, imgY + imgH + 70);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";

  // ----- ขวา: รายละเอียดงาน -----
  const rx = 566;
  const rw = 456;
  let y = 190;

  // ป้ายหัวเรื่อง
  rr(ctx, rx, y, rw, 80, 40);
  ctx.fillStyle = "rgba(19,17,32,0.5)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.amber;
  ctx.stroke();
  ctx.fillStyle = C.amber;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitSize(ctx, st.subtitle, rw - 50, 40, 24, 600);
  ctx.fillText(st.subtitle, rx + rw / 2, y + 42);
  ctx.textBaseline = "alphabetic";
  y += 80 + 28;

  // ชื่องาน (ขาว) ตัดบรรทัดอัตโนมัติ สูงสุด 3 บรรทัด
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  let size = 64;
  let lines = [];
  for (; size >= 36; size -= 2) {
    setFont(ctx, 800, size);
    lines = wrapLines(ctx, st.title || "", rw);
    if (lines.length <= 3) break;
  }
  lines = lines.slice(0, 3);
  const lh = Math.round(size * 1.22);
  lines.forEach((ln, i) => ctx.fillText(ln, rx, y + size + i * lh));
  y += lines.length * lh + 26;

  // วันที่
  if (st.dateText) {
    iconCalendar(ctx, rx + 4, y + 2, 64);
    ctx.fillStyle = C.text;
    setFont(ctx, 500, 24, "Sarabun");
    ctx.fillText("วันที่", rx + 92, y + 22);
    fitSize(ctx, st.dateText, rw - 92, 40, 24, 700);
    ctx.fillStyle = C.amberLight;
    ctx.fillText(st.dateText, rx + 92, y + 64);
    y += 92;
  }

  // เวลาเริ่ม
  if (st.timeText) {
    iconClock(ctx, rx + 4, y + 2, 64);
    ctx.fillStyle = C.text;
    setFont(ctx, 500, 24, "Sarabun");
    ctx.fillText("เวลาเริ่ม", rx + 92, y + 22);
    fitSize(ctx, st.timeText, rw - 92, 40, 24, 700);
    ctx.fillStyle = C.amberLight;
    ctx.fillText(st.timeText, rx + 92, y + 64);
    y += 92;
  }

  // กล่องราคา
  y += 6;
  const boxH = 224;
  panel(ctx, rx, y, rw, boxH, 30, "rgba(242,183,5,0.7)", 3);
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  setFont(ctx, 500, 30, "Sarabun");
  ctx.fillText(st.priceLabel || "ราคาเพียง", rx + 28, y + 44);
  const priceTxt = st.price ? Number(st.price).toLocaleString("th-TH") : "-";
  const unit = " บาท";
  let ps = 96;
  setFont(ctx, 800, ps);
  const unitSize = () => Math.round(ps * 0.55);
  const measure = () => {
    setFont(ctx, 800, ps);
    const a = ctx.measureText(priceTxt).width;
    setFont(ctx, 600, unitSize());
    return a + ctx.measureText(unit).width;
  };
  while (ps > 48 && measure() > rw - 40) ps -= 4;
  setFont(ctx, 800, ps);
  const numW = ctx.measureText(priceTxt).width;
  setFont(ctx, 600, unitSize());
  const unitW = ctx.measureText(unit).width;
  const startX = rx + (rw - (numW + unitW)) / 2;
  const baseY = y + 152;
  ctx.save();
  ctx.shadowColor = "rgba(242,183,5,0.45)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = C.amberLight;
  setFont(ctx, 800, ps);
  ctx.fillText(priceTxt, startX, baseY);
  ctx.restore();
  ctx.fillStyle = C.text;
  setFont(ctx, 600, unitSize());
  ctx.fillText(unit, startX + numW, baseY);
  ctx.textAlign = "center";
  ctx.fillStyle = C.text;
  fitSize(ctx, st.priceCaption || "", rw - 50, 30, 20, 600);
  ctx.fillText(st.priceCaption || "", rx + rw / 2, y + boxH - 24);
  y += boxH;

  // ----- แถวไอคอนจุดเด่น 3 กล่อง -----
  const fy = Math.max(y + 56, imgY + imgH + 120);
  const fw = 300;
  const fh = 200;
  const feats = [
    { icon: iconFHD, label: "ความชัด 1080p" },
    { icon: iconDevices, label: "ดูได้ทุกอุปกรณ์" },
    { icon: iconReplay, label: `รีรันนาน ${st.months} เดือน` },
  ];
  feats.forEach((f, i) => {
    const fx = 60 + i * (fw + 30);
    panel(ctx, fx, fy, fw, fh, 26, "rgba(245,242,234,0.3)", 3);
    f.icon(ctx, fx + fw / 2, fy + 82);
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    fitSize(ctx, f.label, fw - 30, 28, 20, 600, "Sarabun");
    ctx.fillText(f.label, fx + fw / 2, fy + fh - 28);
  });

  // ----- รายละเอียดที่ลูกค้าจะได้รับ + วงกลมจำนวนจำกัด -----
  const cyTop = fy + fh + 56;
  const boxW = 380;
  const boxHt = 410;
  panel(ctx, 60, cyTop, boxW, boxHt, 28, "rgba(245,242,234,0.3)", 3);
  ctx.fillStyle = C.text;
  ctx.textAlign = "center";
  fitSize(ctx, st.detailsTitle, boxW - 40, 36, 24, 600);
  ctx.fillText(st.detailsTitle, 60 + boxW / 2, cyTop + 56);

  const d_items = String(st.details || "")
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 7);
  const d_markX = 60 + 30;
  const d_textX = d_markX + 34 + 12;
  const d_textW = 60 + boxW - 24 - d_textX;
  const d_areaTop = cyTop + 92;
  const d_areaH = boxHt - 92 - 26;
  let d_fs = 30;
  let d_rows = [];
  let d_lh = 0;
  let d_gap = 0;
  let d_total = 0;
  for (; ; d_fs -= 2) {
    setFont(ctx, 500, d_fs, "Sarabun");
    d_rows = d_items.map((t) => wrapLines(ctx, t, d_textW));
    d_lh = Math.round(d_fs * 1.3);
    d_gap = Math.round(d_fs * 0.55);
    d_total = d_rows.reduce((a, r) => a + r.length * d_lh, 0) + d_gap * Math.max(0, d_rows.length - 1);
    if (d_total <= d_areaH || d_fs <= 18) break;
  }
  let d_cy0 = d_areaTop + Math.max(0, (d_areaH - d_total) / 2);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  d_rows.forEach((d_lns) => {
    // เครื่องหมายถูกสีทอง
    const mx = d_markX + 17;
    const my = d_cy0 + d_fs * 0.55;
    ctx.save();
    ctx.shadowColor = "rgba(242,183,5,0.5)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = C.amber;
    ctx.beginPath();
    ctx.arc(mx, my, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#2b1d00";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(mx - 6.5, my + 0.5);
    ctx.lineTo(mx - 1.5, my + 5.5);
    ctx.lineTo(mx + 7, my - 5);
    ctx.stroke();
    ctx.restore();

    setFont(ctx, 500, d_fs, "Sarabun");
    ctx.fillStyle = C.text;
    d_lns.forEach((ln, i) => ctx.fillText(ln, d_textX, d_cy0 + d_fs + i * d_lh));
    d_cy0 += d_lns.length * d_lh + d_gap;
  });

  // วงกลมรับจำนวนจำกัด
  drawLimitedBadge(ctx, 740, cyTop + boxHt / 2, 162);

  // ท้าย: ชื่อร้าน
  drawBrand(ctx, H - 62, 48);
}

// ---------- โหลดรูป ----------
function loadImage(src, cors = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("load_failed"));
    img.src = src;
  });
}

function readFileAsImage(file, maxSide = 0) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = async () => {
      try {
        const img = await loadImage(reader.result, false);
        if (!maxSide || Math.max(img.width, img.height) <= maxSide) {
          resolve({ img, dataUrl: reader.result });
          return;
        }
        const k = maxSide / Math.max(img.width, img.height);
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const dataUrl = c.toDataURL("image/png");
        resolve({ img: await loadImage(dataUrl, false), dataUrl });
      } catch (e) {
        reject(e);
      }
    };
    reader.readAsDataURL(file);
  });
}

async function ensureFonts() {
  try {
    await Promise.all([
      document.fonts.load("800 40px Prompt", "STARLIVE ก"),
      document.fonts.load("700 40px Prompt", "ก"),
      document.fonts.load("600 40px Prompt", "ก"),
      document.fonts.load("500 24px Sarabun", "ก"),
      document.fonts.load("600 24px Sarabun", "ก"),
    ]);
    await document.fonts.ready;
  } catch {
    // ใช้ฟอนต์สำรองได้
  }
}

// ---------- หน้าต่างสร้างโปสเตอร์ ----------
export async function openPosterMaker(ev) {
  const st = defaultsFromEvent(ev);
  // ล้างค่า QR / ไอดีไลน์ที่เคยเก็บไว้ในเครื่องนี้
  saveSettings({ qrDataUrl: undefined, lineId: undefined, lineNote: undefined });
  const images = { poster: null };

  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.78); display:flex; align-items:flex-start; justify-content:center; overflow:auto; padding:20px 12px;";
  overlay.innerHTML = `
    <div style="background:var(--surface,#131120); border:1px solid var(--line,#2c2745); border-radius:18px; width:min(1120px,100%); padding:18px; display:flex; flex-wrap:wrap; gap:18px;">
      <div style="flex:1 1 320px; min-width:0; max-width:420px;">
        <h3 class="display" style="margin:0 0 12px;">สร้างโปสเตอร์งาน</h3>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div><label class="field-label">หัวข้อบนป้าย</label><input id="pmSubtitle" class="field-input" /></div>
          <div><label class="field-label">ชื่องาน</label><input id="pmTitle" class="field-input" /></div>
          <div><label class="field-label">วันที่</label><input id="pmDate" class="field-input" /></div>
          <div><label class="field-label">เวลาเริ่ม</label><input id="pmTime" class="field-input" /></div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <div><label class="field-label">ข้อความเหนือราคา</label><input id="pmPriceLabel" class="field-input" /></div>
            <div><label class="field-label">ราคา (บาท)</label><input id="pmPrice" type="number" min="0" class="field-input" /></div>
          </div>
          <div><label class="field-label">ข้อความใต้ราคา</label><input id="pmPriceCaption" class="field-input" /></div>
          <div><label class="field-label">หัวข้อกล่องรายละเอียด</label><input id="pmDetailsTitle" class="field-input" /></div>
          <div><label class="field-label">รายละเอียด <span class="muted" style="font-size:11px;">(1 บรรทัด = 1 ข้อ สูงสุด 7 ข้อ)</span></label><textarea id="pmDetails" class="field-input" rows="6"></textarea></div>
          <div>
            <label class="field-label">รูปโปสเตอร์งาน <span class="muted" style="font-size:11px;">(ใช้รูปของงานให้อัตโนมัติ เลือกไฟล์เพื่อเปลี่ยน)</span></label>
            <input id="pmPosterFile" type="file" accept="image/*" class="field-input" />
          </div>
          <p id="pmMsg" class="muted" style="font-size:12.5px; margin:0; min-height:18px;"></p>
        </div>
        <div style="display:flex; gap:10px; margin-top:12px; flex-wrap:wrap;">
          <button type="button" id="pmDownload" class="icon-btn" style="padding:10px 18px;">ดาวน์โหลดรูป PNG</button>
          <button type="button" id="pmClose" class="icon-btn ghost" style="padding:10px 18px;">ปิด</button>
        </div>
      </div>
      <div style="flex:2 1 340px; min-width:0; display:flex; justify-content:center; align-items:flex-start;">
        <canvas id="pmCanvas" style="width:100%; max-width:560px; height:auto; border-radius:12px; border:1px solid var(--line,#2c2745);"></canvas>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const $ = (id) => overlay.querySelector("#" + id);
  const canvas = $("pmCanvas");
  const msg = $("pmMsg");

  $("pmSubtitle").value = st.subtitle;
  $("pmTitle").value = st.title;
  $("pmDate").value = st.dateText;
  $("pmTime").value = st.timeText;
  $("pmPriceLabel").value = st.priceLabel;
  $("pmPrice").value = st.price;
  $("pmPriceCaption").value = st.priceCaption;
  $("pmDetailsTitle").value = st.detailsTitle;
  $("pmDetails").value = st.details;

  let raf = 0;
  const render = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawPoster(canvas, st, images));
  };

  const bind = (id, key, persistKey) => {
    $(id).addEventListener("input", (e) => {
      st[key] = e.target.value;
      if (persistKey) saveSettings({ [persistKey]: e.target.value });
      render();
    });
  };
  bind("pmSubtitle", "subtitle", "subtitle");
  bind("pmTitle", "title");
  bind("pmDate", "dateText");
  bind("pmTime", "timeText", "timeText");
  bind("pmPriceLabel", "priceLabel");
  bind("pmPrice", "price");
  bind("pmPriceCaption", "priceCaption");
  bind("pmDetailsTitle", "detailsTitle", "detailsTitle");
  bind("pmDetails", "details");

  const close = () => {
    cancelAnimationFrame(raf);
    overlay.remove();
  };
  $("pmClose").addEventListener("click", close);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  $("pmPosterFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { img } = await readFileAsImage(f);
      images.poster = img;
      msg.textContent = "";
      render();
    } catch {
      msg.textContent = "อ่านไฟล์รูปไม่สำเร็จ";
    }
  });

  $("pmDownload").addEventListener("click", () => {
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          msg.textContent = "สร้างไฟล์ไม่สำเร็จ ลองเลือกรูปโปสเตอร์จากเครื่องแล้วลองใหม่";
          return;
        }
        const a = document.createElement("a");
        const safe = (st.title || "poster").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 40) || "poster";
        a.href = URL.createObjectURL(blob);
        a.download = `starlive-${safe}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, "image/png");
    } catch {
      msg.textContent = "ดาวน์โหลดไม่สำเร็จ: รูปโปสเตอร์ถูกบล็อกจากเว็บอื่น กรุณาเลือกไฟล์รูปจากเครื่องแทน";
    }
  });

  // วาดครั้งแรก (ไม่มีรูป) แล้วค่อยโหลดฟอนต์/รูปมาวาดทับ
  await ensureFonts();
  render();

  // รูปโปสเตอร์ของงาน (เติม query กันเบราว์เซอร์ใช้แคชเก่าที่ไม่มี CORS)
  if (ev.banner_url) {
    try {
      const sep = ev.banner_url.includes("?") ? "&" : "?";
      images.poster = await loadImage(`${ev.banner_url}${sep}poster=1`, true);
      render();
    } catch {
      msg.textContent = "โหลดรูปโปสเตอร์ของงานไม่ได้ กรุณาเลือกไฟล์รูปจากเครื่องที่ช่อง \"รูปโปสเตอร์งาน\"";
    }
  } else {
    msg.textContent = "งานนี้ยังไม่มีรูปโปสเตอร์ กรุณาเลือกไฟล์รูปที่ช่อง \"รูปโปสเตอร์งาน\"";
  }
}
