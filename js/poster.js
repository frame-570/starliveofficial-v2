// ============================================================
// ระบบสร้างโปสเตอร์โปรโมทงาน (วาดด้วย canvas แล้วดาวน์โหลดเป็น PNG)
// ใช้: openPosterMaker(ev)  — ev = แถวงานจากตาราง events (มี event_days, ticket_packages)
// สีและพื้นหลังใช้ชุดเดียวกับเว็บ (stage / amber / crimson) ตัวหนังสือสีเหลืองและขาว
// ไม่มี QR และไอดีไลน์บนโปสเตอร์ (กันแพลตฟอร์มลบคลิป) ช่องทางติดต่อให้ใส่ในแคปชั่นแทน
// ============================================================

const W = 1080;
const H = 1200;

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
    logoCorner: saved.logoCorner || "left",
    showBrand: saved.showBrand !== false,
    theme: POSTER_THEMES.some((t) => t.id === saved.theme) ? saved.theme : "st",
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
// ---------- ธีมพื้นหลัง (เทศกาล) ----------
const POSTER_THEMES = [
  { id: "st", label: "ST THEMES" },
  { id: "halloween", label: "HALLOWEEN THEMES" },
  { id: "christmas", label: "CHRISTMAS THEMES" },
];
// ธีมเทศกาลเพิ่มพื้นที่ด้านล่างไว้ให้ลวดลาย (ฟักทอง / ต้นสน) โดยไม่ทับกล่องเนื้อหา
function themeExtra(theme) {
  return theme === "halloween" || theme === "christmas" ? 80 : 0;
}

function drawBat(ctx, x, y, s, rot, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(s, s);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -6);
  ctx.bezierCurveTo(10, -22, 34, -20, 50, -6);
  ctx.bezierCurveTo(44, -6, 40, 2, 36, 6);
  ctx.bezierCurveTo(32, 2, 26, 2, 22, 8);
  ctx.bezierCurveTo(18, 2, 10, 2, 0, 12);
  ctx.bezierCurveTo(-10, 2, -18, 2, -22, 8);
  ctx.bezierCurveTo(-26, 2, -32, 2, -36, 6);
  ctx.bezierCurveTo(-40, 2, -44, -6, -50, -6);
  ctx.bezierCurveTo(-34, -20, -10, -22, 0, -6);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-5, -6);
  ctx.lineTo(-4, -15);
  ctx.lineTo(0, -8);
  ctx.lineTo(4, -15);
  ctx.lineTo(5, -6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ใยแมงมุมมุมโปสเตอร์: (cx,cy) = มุม, a0..a1 = ช่วงมุม (เรเดียน)
function drawCobweb(ctx, cx, cy, radius, a0, a1, alpha) {
  const rays = 6;
  const rings = 5;
  ctx.save();
  ctx.strokeStyle = `rgba(235,225,255,${alpha})`;
  ctx.lineWidth = 1.6;
  const ang = (i) => a0 + ((a1 - a0) * i) / (rays - 1);
  for (let i = 0; i < rays; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang(i)) * radius, cy + Math.sin(ang(i)) * radius);
    ctx.stroke();
  }
  for (let k = 1; k <= rings; k++) {
    const r = (radius * k) / rings;
    for (let i = 0; i < rays - 1; i++) {
      const p1 = [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];
      const p2 = [cx + Math.cos(ang(i + 1)) * r, cy + Math.sin(ang(i + 1)) * r];
      const mid = (ang(i) + ang(i + 1)) / 2;
      const cr = r * 0.82;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.quadraticCurveTo(cx + Math.cos(mid) * cr, cy + Math.sin(mid) * cr, p2[0], p2[1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawPumpkin(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, -r * 0.1, r * 0.2, 0, -r * 0.1, r * 1.7);
  g.addColorStop(0, "rgba(255,140,20,0.38)");
  g.addColorStop(1, "rgba(255,140,20,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);

  const body = ctx.createLinearGradient(0, -r, 0, r * 0.9);
  body.addColorStop(0, "#ffa23a");
  body.addColorStop(1, "#d2520a");
  ctx.fillStyle = body;
  [[-r * 0.55, 0.62], [r * 0.55, 0.62], [0, 0.8]].forEach(([dx, k]) => {
    ctx.beginPath();
    ctx.ellipse(dx, 0, r * k, r * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = "#3f5f1f";
  ctx.beginPath();
  ctx.moveTo(-r * 0.12, -r * 0.76);
  ctx.lineTo(r * 0.1, -r * 1.06);
  ctx.lineTo(r * 0.24, -r * 0.76);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.shadowColor = "rgba(255,226,122,0.9)";
  ctx.shadowBlur = r * 0.35;
  ctx.fillStyle = "#ffe27a";
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sx * r * 0.18, -r * 0.1);
    ctx.lineTo(sx * r * 0.5, -r * 0.1);
    ctx.lineTo(sx * r * 0.34, -r * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, r * 0.18);
  ctx.lineTo(-r * 0.3, r * 0.4);
  ctx.lineTo(-r * 0.15, r * 0.22);
  ctx.lineTo(0, r * 0.42);
  ctx.lineTo(r * 0.15, r * 0.22);
  ctx.lineTo(r * 0.3, r * 0.4);
  ctx.lineTo(r * 0.5, r * 0.18);
  ctx.lineTo(r * 0.35, r * 0.5);
  ctx.lineTo(-r * 0.35, r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBgHalloween(ctx, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1c0a2c");
  bg.addColorStop(0.55, "#0d0514");
  bg.addColorStop(1, "#1d0b04");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ellipseGlow(ctx, W * 0.84, 150, 460, 420, "rgba(255,130,30,0.20)");
  ellipseGlow(ctx, W * 0.1, H * 0.55, 520, 520, "rgba(130,60,200,0.16)");
  ellipseGlow(ctx, W / 2, H + 40, 820, 420, "rgba(255,110,10,0.20)");

  // พระจันทร์เต็มดวง (จางๆ อยู่หลังเนื้อหา)
  ctx.save();
  ctx.globalAlpha = 0.34;
  const moon = ctx.createRadialGradient(W * 0.84 - 20, 140, 10, W * 0.84, 150, 100);
  moon.addColorStop(0, "#fff0c8");
  moon.addColorStop(1, "#ff9d3d");
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(W * 0.84, 150, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(160,70,0,0.35)";
  [[-30, -10, 14], [24, 26, 18], [30, -34, 9]].forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(W * 0.84 + dx, 150 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  // แท่งแสงสีม่วง-ส้ม
  for (const side of [-1, 1]) {
    ctx.save();
    const cx = side < 0 ? W * 0.28 : W * 0.72;
    ctx.translate(cx, 0);
    ctx.transform(1, 0, side * 0.14, 1, 0, 0);
    const g = ctx.createLinearGradient(0, -H * 0.1, 0, H * 0.75);
    g.addColorStop(0, side < 0 ? "rgba(160,90,255,0.12)" : "rgba(255,140,40,0.12)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, -H * 0.1, W * 0.4, H * 1.2);
    ctx.restore();
  }

  // ประกายส้ม/ม่วง
  const rnd = mulberry32(1031);
  for (let i = 0; i < 80; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    const r = 1 + rnd() * 2.2;
    const orange = rnd() > 0.5;
    ctx.fillStyle = orange ? `rgba(255,150,40,${0.25 + rnd() * 0.5})` : `rgba(190,140,255,${0.2 + rnd() * 0.45})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ใยแมงมุมมุมขวาบนและมุมซ้ายล่าง
  drawCobweb(ctx, W, 0, 230, Math.PI * 0.5, Math.PI, 0.22);
  drawCobweb(ctx, 0, H - 80, 190, -Math.PI * 0.5, 0, 0.16);

  // ค้างคาว
  const batColor = "rgba(92,42,130,0.95)";
  [
    [880, 330, 0.7, -0.25], [996, 120, 0.55, 0.3], [520, 62, 0.6, 0.1], [40, 880, 0.6, -0.2],
    [980, 905, 0.75, 0.2], [300, 880, 0.5, 0.35], [650, 920, 0.45, -0.3],
  ].forEach(([x, y, s, rot]) => {
    ctx.save();
    ctx.shadowColor = "rgba(190,110,255,0.55)";
    ctx.shadowBlur = 14;
    drawBat(ctx, x, y, s, rot, batColor);
    ctx.restore();
  });

  // พื้นหมอก + แถวฟักทองด้านล่าง
  const fog = ctx.createLinearGradient(0, H - 130, 0, H);
  fog.addColorStop(0, "rgba(255,120,20,0)");
  fog.addColorStop(1, "rgba(255,120,20,0.18)");
  ctx.fillStyle = fog;
  ctx.fillRect(0, H - 130, W, 130);
  [[90, 30, 36], [250, 26, 26], [430, 32, 30], [620, 28, 24], [790, 30, 34], [960, 24, 38]].forEach(([x, dy, r]) => {
    drawPumpkin(ctx, x, H - dy - r * 0.55, r);
  });
}

function drawSnowflake(ctx, x, y, r) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate((Math.PI / 3) * i);
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -r);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(-r * 0.28, -r * 0.8);
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.28, -r * 0.8);
    ctx.restore();
  }
  ctx.stroke();
  ctx.restore();
}

function drawFir(ctx, x, baseY, w, h, color, rnd, lights) {
  ctx.fillStyle = "#3b2414";
  ctx.fillRect(x - w * 0.06, baseY - h * 0.1, w * 0.12, h * 0.12);
  ctx.fillStyle = color;
  for (let i = 0; i < 3; i++) {
    const top = baseY - h + i * h * 0.22;
    const bottom = baseY - h * 0.1 - (2 - i) * h * 0.2;
    const half = w * (0.3 + i * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x - half, bottom);
    ctx.closePath();
    ctx.fill();
  }
  if (lights) {
    const cols = ["#ff4a5a", "#ffd24a", "#7fe0a0", "#7fc8ff"];
    for (let i = 0; i < 9; i++) {
      const ty = baseY - h * (0.2 + rnd() * 0.7);
      const span = (w * 0.5 * (ty - (baseY - h))) / h + 4;
      const tx = x + (rnd() * 2 - 1) * span * 0.8;
      ctx.save();
      ctx.shadowColor = cols[i % 4];
      ctx.shadowBlur = 8;
      ctx.fillStyle = cols[i % 4];
      ctx.beginPath();
      ctx.arc(tx, ty, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  // ดาวบนยอด
  ctx.save();
  ctx.shadowColor = "#ffd24a";
  ctx.shadowBlur = 10;
  sparkle(ctx, x, baseY - h - 2, w * 0.14, "#ffd24a", 10);
  ctx.restore();
}

function drawGift(ctx, x, y, s, body, ribbon) {
  ctx.fillStyle = body;
  ctx.fillRect(x - s / 2, y - s, s, s);
  ctx.fillStyle = ribbon;
  ctx.fillRect(x - s * 0.08, y - s, s * 0.16, s);
  ctx.fillRect(x - s / 2, y - s * 0.58, s, s * 0.16);
  ctx.beginPath();
  ctx.ellipse(x - s * 0.17, y - s * 1.07, s * 0.2, s * 0.12, -0.5, 0, Math.PI * 2);
  ctx.ellipse(x + s * 0.17, y - s * 1.07, s * 0.2, s * 0.12, 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBgChristmas(ctx, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0b2217");
  bg.addColorStop(0.6, "#07140e");
  bg.addColorStop(1, "#0b1c13");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  ellipseGlow(ctx, W / 2, 0, 760, 520, "rgba(255,210,74,0.16)");
  ellipseGlow(ctx, W * 0.08, H * 0.5, 460, 460, "rgba(220,50,60,0.14)");
  ellipseGlow(ctx, W * 0.95, H * 0.7, 480, 480, "rgba(60,190,110,0.12)");

  // แท่งแสงสีทอง-แดง
  for (const side of [-1, 1]) {
    ctx.save();
    const cx = side < 0 ? W * 0.28 : W * 0.72;
    ctx.translate(cx, 0);
    ctx.transform(1, 0, side * 0.14, 1, 0, 0);
    const g = ctx.createLinearGradient(0, -H * 0.1, 0, H * 0.75);
    g.addColorStop(0, side < 0 ? "rgba(255,90,90,0.11)" : "rgba(255,210,74,0.11)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(-W * 0.2, -H * 0.1, W * 0.4, H * 1.2);
    ctx.restore();
  }

  const rnd = mulberry32(1225);
  // โบเก้ไฟวงกลมใหญ่จางๆ
  const bokeh = ["rgba(255,90,100,0.10)", "rgba(255,210,74,0.10)", "rgba(110,230,160,0.09)"];
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = bokeh[i % 3];
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 18 + rnd() * 44, 0, Math.PI * 2);
    ctx.fill();
  }

  // หิมะตก
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 1 + rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 16; i++) {
    ctx.strokeStyle = `rgba(235,245,255,${0.14 + rnd() * 0.16})`;
    ctx.lineWidth = 1.8;
    drawSnowflake(ctx, rnd() * W, rnd() * (H - 120), 12 + rnd() * 16);
  }

  // สายไฟประดับด้านบน
  const wireY = (x) => 16 + 12 * Math.sin((x / W) * Math.PI * 6);
  ctx.strokeStyle = "rgba(20,70,40,0.95)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 10) (x === 0 ? ctx.moveTo(x, wireY(x)) : ctx.lineTo(x, wireY(x)));
  ctx.stroke();
  const bulbs = ["#ff4a5a", "#ffd24a", "#58d68d", "#6ec6ff"];
  for (let i = 0, x = 24; x < W; i++, x += 60) {
    const y = wireY(x) + 8;
    ctx.save();
    ctx.shadowColor = bulbs[i % 4];
    ctx.shadowBlur = 16;
    ctx.fillStyle = bulbs[i % 4];
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 6, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#1c4a2c";
    ctx.fillRect(x - 3, y - 5, 6, 5);
  }

  // พื้นหิมะ + ต้นสน + กล่องของขวัญด้านล่าง
  const snow = ctx.createLinearGradient(0, H - 70, 0, H);
  snow.addColorStop(0, "rgba(240,248,255,0.0)");
  snow.addColorStop(1, "rgba(240,248,255,0.55)");
  ctx.fillStyle = snow;
  ctx.fillRect(0, H - 70, W, 70);
  const trees = [[70, 74, 110], [210, 56, 80], [880, 56, 84], [1010, 74, 112]];
  trees.forEach(([x, w, h], i) => drawFir(ctx, x, H - 18, w, h, i % 2 ? "#0f4a2a" : "#0c3b22", rnd, true));
  drawGift(ctx, 330, H - 18, 34, "#d8334a", "#ffd24a");
  drawGift(ctx, 372, H - 18, 26, "#2f9e5e", "#ffffff");
  drawGift(ctx, 700, H - 18, 28, "#ffd24a", "#d8334a");
  drawGift(ctx, 742, H - 18, 36, "#d8334a", "#ffffff");
  ctx.fillStyle = "#f4f9ff";
  ctx.beginPath();
  ctx.ellipse(W / 2, H + 6, W * 0.56, 26, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ธีมเดิม = "ST THEMES"
function drawBgSt(ctx, H) {
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

function drawBackground(ctx, H, theme) {
  if (theme === "halloween") return drawBgHalloween(ctx, H);
  if (theme === "christmas") return drawBgChristmas(ctx, H);
  return drawBgSt(ctx, H);
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

function iconLink(ctx, cx, cy) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 4);
  ctx.strokeStyle = C.text;
  ctx.lineWidth = 9;
  ctx.lineCap = "round";
  rr(ctx, -58, -17, 66, 34, 17);
  ctx.stroke();
  rr(ctx, -8, -17, 66, 34, 17);
  ctx.stroke();
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
// กล่องโลโก้มุมบน: ชิดเส้นกรอบนอกของรูปงาน (ซ้าย x=46) หรือกรอบกล่องราคา (ขวา x=1022)
function logoRect(st, images) {
  if (!images.logo) return null;
  const bw = 150;
  const bh = 130;
  const k = Math.min(bw / images.logo.width, bh / images.logo.height);
  const w = images.logo.width * k;
  const h = images.logo.height * k;
  const x = st.logoCorner === "right" ? 566 + 456 - w : 60 - 14;
  const y = Math.max(18, 92 - h / 2);
  return { x, y, w, h };
}

// คำนวณความสูงโปสเตอร์ตามจำนวนบรรทัดของชื่องาน (ชื่อ 3 บรรทัดจะได้ไม่ดันกล่องล่างล้นขอบ)
function neededHeight(st) {
  const m = document.createElement("canvas").getContext("2d");
  const rw = 456;
  let size = 64;
  let n = 1;
  let lines = [];
  for (; size >= 36; size -= 2) {
    setFont(m, 800, size);
    lines = wrapLines(m, st.title || "", rw);
    if (lines.length <= 3) break;
  }
  n = Math.min(3, Math.max(1, lines.length));
  const lh = Math.round(size * 1.22);
  let y = 190 + 80 + 28 + n * lh + 26;
  if (st.dateText) y += 92;
  if (st.timeText) y += 92;
  y += 6 + 224;
  const fy = Math.max(y + 56, 949);
  return Math.max(H, fy + 200 + 51) + themeExtra(st.theme);
}

function drawPoster(canvas, st, images) {
  const Hc = neededHeight(st);
  canvas.width = W;
  canvas.height = Hc;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, Hc);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  drawBackground(ctx, Hc, st.theme);

  // หัว: ชื่อร้านสีเหลือง + ดาว (ย่อขนาดอัตโนมัติถ้าโลโก้ใหญ่จนชิด)
  const lr = logoRect(st, images);
  if (st.showBrand) {
    let bsize = 56;
    if (lr) {
      if ("letterSpacing" in ctx) ctx.letterSpacing = "3px";
      setFont(ctx, 800, 56);
      const tw56 = ctx.measureText("STARLIVE OFFICIAL").width;
      if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
      const edge = st.logoCorner === "right" ? W / 2 - (lr.x - 14 - W / 2) : lr.x + lr.w + 14;
      const half = W / 2 - edge;
      bsize = Math.max(34, Math.min(56, Math.floor(half / (tw56 / 112 + 1.8))));
    }
    drawBrand(ctx, 95, bsize);
  }

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
  // แสดงราคาแบบ 139.- (ไม่ใช้คำว่า "บาท")
  const priceTxt = st.price ? Number(st.price).toLocaleString("th-TH") + ".-" : "-";
  let ps = 104;
  setFont(ctx, 800, ps);
  while (ps > 48 && ctx.measureText(priceTxt).width > rw - 40) {
    ps -= 4;
    setFont(ctx, 800, ps);
  }
  const numW = ctx.measureText(priceTxt).width;
  const startX = rx + (rw - numW) / 2;
  const baseY = y + 152;
  ctx.save();
  ctx.shadowColor = "rgba(242,183,5,0.45)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = C.amberLight;
  ctx.fillText(priceTxt, startX, baseY);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = C.text;
  fitSize(ctx, st.priceCaption || "", rw - 50, 30, 20, 600);
  ctx.fillText(st.priceCaption || "", rx + rw / 2, y + boxH - 24);
  y += boxH;

  // ----- แถวไอคอนจุดเด่น 3 กล่อง -----
  const fy = Math.max(y + 56, 949);
  const fw = 300;
  const fh = 200;
  const feats = [
    { icon: iconFHD, label: "ความชัด 1080p" },
    { icon: iconDevices, label: "ดูได้ทุกอุปกรณ์" },
    { icon: iconLink, label: "รับชมผ่านลิงก์" },
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

  // ----- โลโก้ร้าน (มุมบน) -----
  if (lr) ctx.drawImage(images.logo, lr.x, lr.y, lr.w, lr.h);
}

// ---------- โหลดรูป ----------
// ตัดขอบโปร่งใสรอบโลโก้ออก ให้โลโก้ใหญ่เต็มช่องมุมโปสเตอร์ คืนค่าเป็น dataURL (PNG)
function trimTransparent(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  const cx = c.getContext("2d");
  cx.drawImage(img, 0, 0);
  const { data } = cx.getImageData(0, 0, c.width, c.height);
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (data[(y * c.width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return c.toDataURL("image/png");
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const o = document.createElement("canvas");
  o.width = w;
  o.height = h;
  o.getContext("2d").drawImage(c, minX, minY, w, h, 0, 0, w, h);
  return o.toDataURL("image/png");
}

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
  saveSettings({ qrDataUrl: undefined, lineId: undefined, lineNote: undefined, detailsTitle: undefined });
  const images = { poster: null, logo: null };

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
          <div>
            <label class="field-label">ธีมพื้นหลัง</label>
            <select id="pmTheme" class="field-input">
              ${POSTER_THEMES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("")}
            </select>
          </div>
          <label style="display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer;">
            <input type="checkbox" id="pmShowBrand" /> แสดงชื่อร้านด้านบน (รวมดาวซ้าย-ขวา)
          </label>
          <div>
            <label class="field-label">โลโก้ร้าน <span class="muted" style="font-size:11px;">(PNG พื้นโปร่งใส เลือกครั้งเดียว ระบบจำไว้ให้)</span></label>
            <input id="pmLogoFile" type="file" accept="image/png,image/*" class="field-input" />
            <div style="display:flex; gap:10px; margin-top:6px; align-items:center;">
              <select id="pmLogoCorner" class="field-input" style="max-width:150px;">
                <option value="left">มุมบนซ้าย</option>
                <option value="right">มุมบนขวา</option>
              </select>
              <button type="button" id="pmLogoClear" class="icon-btn ghost" style="padding:8px 14px;">ลบโลโก้</button>
            </div>
          </div>
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
  $("pmLogoCorner").value = st.logoCorner;
  $("pmShowBrand").checked = st.showBrand;
  $("pmTheme").value = st.theme;

  let raf = 0;
  const render = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => drawPoster(canvas, st, images));
  };

  const bind = (id, key, persistKey) => {
    $(id).addEventListener(id === "pmLogoCorner" ? "change" : "input", (e) => {
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
  bind("pmLogoCorner", "logoCorner", "logoCorner");

  $("pmTheme").addEventListener("change", (e) => {
    st.theme = e.target.value;
    saveSettings({ theme: st.theme });
    render();
  });
  $("pmShowBrand").addEventListener("change", (e) => {
    st.showBrand = e.target.checked;
    saveSettings({ showBrand: st.showBrand });
    render();
  });

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

  // โลโก้ร้าน: ตัดขอบโปร่งใสออก แล้วจำไว้ในเครื่อง
  const setLogo = async (dataUrl) => {
    images.logo = await loadImage(dataUrl, false);
  };
  const saved = loadSettings();
  if (saved.logoDataUrl) {
    try {
      await setLogo(saved.logoDataUrl);
    } catch {
      saveSettings({ logoDataUrl: undefined });
    }
  }
  $("pmLogoFile").addEventListener("change", async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const { img } = await readFileAsImage(f, 800);
      const trimmed = trimTransparent(img);
      await setLogo(trimmed);
      saveSettings({ logoDataUrl: trimmed });
      msg.textContent = "";
      render();
    } catch {
      msg.textContent = "อ่านไฟล์โลโก้ไม่สำเร็จ";
    }
  });
  $("pmLogoClear").addEventListener("click", () => {
    images.logo = null;
    saveSettings({ logoDataUrl: undefined });
    $("pmLogoFile").value = "";
    render();
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
