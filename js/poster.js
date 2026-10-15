// ============================================================
// ระบบสร้างโปสเตอร์โปรโมทงาน (วาดด้วย canvas แล้วดาวน์โหลดเป็น PNG)
// ใช้: openPosterMaker(ev)  — ev = แถวงานจากตาราง events (มี event_days, ticket_packages)
// สีและพื้นหลังใช้ชุดเดียวกับเว็บ (stage / amber / crimson) ตัวหนังสือสีเหลืองและขาว
// ไม่มี QR และไอดีไลน์บนโปสเตอร์ (กันแพลตฟอร์มลบคลิป) ช่องทางติดต่อให้ใส่ในแคปชั่นแทน
// ============================================================

const W = 1080;
const H = 1200;
// โปสเตอร์วิดีโอ: กรอบวางคลิปด้านบนขนาด 16:9 (กว้างเต็ม 1080 → สูง 608)
const FRAME_H = Math.round((W * 9) / 16);

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
    logoCorner: ["left", "right", "none"].includes(saved.logoCorner) ? saved.logoCorner : "left",
    showBrand: saved.showBrand !== false,
    theme: POSTER_THEMES.some((t) => t.id === saved.theme) ? saved.theme : "st",
    mode: saved.mode === "video" ? "video" : "image",
    videoColor: /^#[0-9a-fA-F]{6}$/.test(saved.videoColor || "") ? saved.videoColor : "#7c3aed",
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
  { id: "loikrathong", label: "LOI KRATHONG THEMES" },
  { id: "winter", label: "WINTER WONDERLAND THEMES" },
  { id: "christmas", label: "CHRISTMAS THEMES" },
  { id: "newyear", label: "NEW YEAR COUNTDOWN THEMES" },
];
// ธีมเทศกาลเพิ่มพื้นที่ด้านล่างไว้ให้ลวดลาย (ฟักทอง / ต้นสน) โดยไม่ทับกล่องเนื้อหา
function themeExtra(theme) {
  return POSTER_THEMES.some((t) => t.id === theme && t.id !== "st") ? 80 : 0;
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

// ---------- ธีมลอยกระทง ----------
function drawLantern(ctx, x, y, s, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 2.6);
  g.addColorStop(0, "rgba(255,170,50,0.45)");
  g.addColorStop(1, "rgba(255,170,50,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-s * 2.7, -s * 2.7, s * 5.4, s * 5.4);
  const body = ctx.createLinearGradient(0, -s, 0, s);
  body.addColorStop(0, "#ffe6ab");
  body.addColorStop(0.5, "#ffab45");
  body.addColorStop(1, "#e0701a");
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-s * 0.55, -s);
  ctx.quadraticCurveTo(0, -s * 1.3, s * 0.55, -s);
  ctx.lineTo(s * 0.8, s * 0.9);
  ctx.lineTo(-s * 0.8, s * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(140,60,10,0.45)";
  ctx.lineWidth = Math.max(1, s * 0.06);
  for (const k of [-0.35, 0, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(k * s * 0.7, -s * 1.02);
    ctx.lineTo(k * s * 1.1, s * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = "#7a3a0a";
  ctx.fillRect(-s * 0.8, s * 0.9, s * 1.6, s * 0.14);
  ctx.fillStyle = "rgba(255,248,200,0.9)";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.55, s * 0.26, s * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawKrathong(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, -s * 0.3, s * 0.1, 0, -s * 0.3, s * 2.4);
  g.addColorStop(0, "rgba(255,190,80,0.40)");
  g.addColorStop(1, "rgba(255,190,80,0)");
  ctx.fillStyle = g;
  ctx.fillRect(-s * 2.5, -s * 2.8, s * 5, s * 5);
  ctx.fillStyle = "#2f7d46";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.35, s * 1.15, s * 0.36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3d9a58";
  ctx.beginPath();
  ctx.ellipse(0, s * 0.3, s * 0.95, s * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();
  [-70, -45, -22, 0, 22, 45, 70].forEach((a, i) => {
    ctx.save();
    ctx.translate(0, s * 0.3);
    ctx.rotate((a * Math.PI) / 180);
    ctx.fillStyle = i % 2 ? "#ffc4dc" : "#ff94c0";
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.55, s * 0.2, s * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.fillStyle = "#fff1d6";
  ctx.fillRect(-s * 0.06, -s * 0.12, s * 0.12, s * 0.44);
  ctx.save();
  ctx.shadowColor = "#ffd24a";
  ctx.shadowBlur = s * 0.6;
  ctx.fillStyle = "#ffd24a";
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.26, s * 0.09, s * 0.19, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBgLoiKrathong(ctx, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#0a1033");
  bg.addColorStop(0.55, "#16205a");
  bg.addColorStop(1, "#0a2a3c");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rnd = mulberry32(1115);
  // ดาว
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,244,214,${0.2 + rnd() * 0.55})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H * 0.7, 0.8 + rnd() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }
  // พระจันทร์เต็มดวง
  ellipseGlow(ctx, W * 0.16, 150, 420, 400, "rgba(255,214,120,0.22)");
  ctx.save();
  ctx.globalAlpha = 0.4;
  const moon = ctx.createRadialGradient(W * 0.16 - 18, 135, 8, W * 0.16, 150, 96);
  moon.addColorStop(0, "#fffbe6");
  moon.addColorStop(1, "#ffd27a");
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(W * 0.16, 150, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ellipseGlow(ctx, W / 2, H + 40, 860, 380, "rgba(255,170,60,0.22)");

  // โคมลอย
  [
    [150, 330, 15, 0.8], [980, 260, 20, 0.85], [60, 560, 11, 0.6], [1030, 520, 13, 0.7],
    [500, 140, 9, 0.5], [880, 70, 12, 0.7], [250, 70, 10, 0.6], [100, 820, 17, 0.8],
    [1010, 800, 15, 0.75], [560, 905, 9, 0.5], [800, 940, 11, 0.55], [330, 925, 12, 0.6],
  ].forEach(([x, y, s, a]) => drawLantern(ctx, x, y, s, a));

  // แม่น้ำด้านล่าง + เงาสะท้อน
  const river = ctx.createLinearGradient(0, H - 120, 0, H);
  river.addColorStop(0, "rgba(10,60,80,0)");
  river.addColorStop(1, "rgba(8,50,70,0.85)");
  ctx.fillStyle = river;
  ctx.fillRect(0, H - 120, W, 120);
  ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    const y = H - 100 + (i % 6) * 17;
    const x0 = rnd() * W;
    ctx.strokeStyle = `rgba(255,205,120,${0.12 + rnd() * 0.22})`;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.quadraticCurveTo(x0 + 30, y - 6, x0 + 60, y);
    ctx.quadraticCurveTo(x0 + 90, y + 6, x0 + 120, y);
    ctx.stroke();
  }
  [[110, 40, 26], [300, 58, 20], [520, 34, 24], [730, 56, 21], [930, 38, 27]].forEach(([x, dy, s]) => drawKrathong(ctx, x, H - dy, s));
}

// ---------- ธีม Winter Wonderland ----------
function drawSnowPine(ctx, x, baseY, w, h) {
  ctx.fillStyle = "#0b2c46";
  for (let i = 0; i < 3; i++) {
    const top = baseY - h + i * h * 0.24;
    const bottom = baseY - h * 0.08 - (2 - i) * h * 0.2;
    const half = w * (0.3 + i * 0.2);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half, bottom);
    ctx.lineTo(x - half, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(235,246,255,0.92)";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x + half * 0.62, top + (bottom - top) * 0.62);
    ctx.lineTo(x - half * 0.62, top + (bottom - top) * 0.62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#0b2c46";
  }
}

function drawBgWinter(ctx, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#06102a");
  bg.addColorStop(0.5, "#0e2a54");
  bg.addColorStop(1, "#17456f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const rnd = mulberry32(1201);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(220,240,255,${0.2 + rnd() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H * 0.6, 0.8 + rnd() * 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  // แสงเหนือ (ออโรร่า)
  const bands = [
    ["80,255,200", 70, 120, 0.0], ["120,170,255", 140, 90, 1.4], ["190,120,255", 210, 70, 2.6],
  ];
  bands.forEach(([rgb, y0, hh, ph]) => {
    const g = ctx.createLinearGradient(0, y0 - hh, 0, y0 + hh);
    g.addColorStop(0, `rgba(${rgb},0)`);
    g.addColorStop(0.45, `rgba(${rgb},0.22)`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, y0 + 40 * Math.sin(ph));
    for (let x = 0; x <= W; x += 20) {
      ctx.lineTo(x, y0 + 46 * Math.sin(x / 150 + ph) + 20 * Math.sin(x / 60 + ph * 2));
    }
    for (let x = W; x >= 0; x -= 20) {
      ctx.lineTo(x, y0 + hh + 36 * Math.sin(x / 170 + ph + 1));
    }
    ctx.closePath();
    ctx.fill();
  });

  ellipseGlow(ctx, W / 2, H + 60, 820, 420, "rgba(190,230,255,0.22)");

  // ภูเขาหิมะ
  const peaks = (rawPts, color, snow) => {
    // ย่อความสูงภูเขาให้อยู่ใต้กล่องไอคอน ไม่ทะลุขึ้นมาในกล่อง
    const pts = rawPts.map(([x, y]) => [x, H - (H - y) * 0.34]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    if (snow) {
      ctx.fillStyle = snow;
      for (let i = 1; i < pts.length - 1; i++) {
        const [x, y] = pts[i];
        if (y < pts[i - 1][1] && y < pts[i + 1][1]) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 22, y + 22);
          ctx.lineTo(x + 8, y + 19);
          ctx.lineTo(x, y + 28);
          ctx.lineTo(x - 10, y + 19);
          ctx.lineTo(x - 23, y + 23);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  };
  peaks(
    [[0, H - 190], [150, H - 300], [300, H - 200], [470, H - 330], [640, H - 210], [820, H - 310], [960, H - 220], [1080, H - 290]],
    "rgba(26,70,112,0.75)", "rgba(220,238,255,0.55)"
  );
  peaks(
    [[0, H - 120], [180, H - 190], [360, H - 110], [560, H - 200], [760, H - 115], [940, H - 185], [1080, H - 120]],
    "#103a60", "rgba(235,246,255,0.8)"
  );

  // เกล็ดหิมะ
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.6})`;
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, 1 + rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(210,236,255,${0.14 + rnd() * 0.2})`;
    ctx.lineWidth = 1.8;
    drawSnowflake(ctx, rnd() * W, rnd() * (H - 140), 14 + rnd() * 22);
  }

  // พื้นหิมะ + ต้นสนมีหิมะ
  const ground = ctx.createLinearGradient(0, H - 60, 0, H);
  ground.addColorStop(0, "rgba(235,246,255,0)");
  ground.addColorStop(1, "rgba(235,246,255,0.75)");
  ctx.fillStyle = ground;
  ctx.fillRect(0, H - 60, W, 60);
  [[60, 70, 110], [180, 52, 80], [900, 54, 86], [1015, 72, 112]].forEach(([x, w, h]) => drawSnowPine(ctx, x, H - 16, w, h));
  ctx.fillStyle = "#eaf5ff";
  ctx.beginPath();
  ctx.ellipse(W / 2, H + 8, W * 0.58, 26, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ---------- ธีม New Year Countdown ----------
function drawFirework(ctx, x, y, r, rgb) {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  g.addColorStop(0, `rgba(${rgb},0.30)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.lineCap = "round";
  const rays = 22;
  for (let i = 0; i < rays; i++) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / rays);
    const lg = ctx.createLinearGradient(0, -r * 0.3, 0, -r);
    lg.addColorStop(0, `rgba(${rgb},0)`);
    lg.addColorStop(1, `rgba(${rgb},0.85)`);
    ctx.strokeStyle = lg;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.3);
    ctx.lineTo(0, -r * 0.9);
    ctx.stroke();
    ctx.fillStyle = `rgba(${rgb},0.95)`;
    ctx.beginPath();
    ctx.arc(0, -r, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}

function drawBgNewYear(ctx, H) {
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#04030d");
  bg.addColorStop(0.6, "#120830");
  bg.addColorStop(1, "#1e0b3a");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ellipseGlow(ctx, W / 2, 0, 760, 520, "rgba(255,210,74,0.14)");
  ellipseGlow(ctx, W / 2, H + 40, 860, 420, "rgba(255,90,170,0.18)");

  const rnd = mulberry32(2027);

  // นาฬิกานับถอยหลังขนาดใหญ่จางๆ ด้านหลัง (เข็มชี้ใกล้เที่ยงคืน)
  ctx.save();
  ctx.translate(W / 2, H * 0.46);
  ctx.strokeStyle = "rgba(255,210,74,0.12)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, 440, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 410, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (Math.PI * 2 * i) / 60;
    const long = i % 5 === 0;
    ctx.lineWidth = long ? 5 : 2;
    ctx.strokeStyle = `rgba(255,210,74,${long ? 0.16 : 0.09})`;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * (long ? 372 : 392), -Math.cos(a) * (long ? 372 : 392));
    ctx.lineTo(Math.sin(a) * 404, -Math.cos(a) * 404);
    ctx.stroke();
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,210,74,0.09)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(-0.08) * 250, -Math.cos(-0.08) * 250);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,210,74,0.08)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.sin(-0.02) * 340, -Math.cos(-0.02) * 340);
  ctx.stroke();
  ctx.restore();

  // พลุ
  [
    [150, 250, 120, "255,210,74"], [930, 210, 110, "255,100,170"], [1062, 660, 72, "90,210,255"],
    [60, 640, 80, "190,120,255"], [900, 900, 85, "255,100,170"], [200, 920, 80, "90,210,255"],
  ].forEach(([x, y, r, rgb]) => drawFirework(ctx, x, y, r, rgb));

  // กระดาษโปรย
  const cols = ["255,210,74", "255,100,170", "90,210,255", "255,255,255", "170,120,255"];
  for (let i = 0; i < 110; i++) {
    ctx.save();
    ctx.translate(rnd() * W, rnd() * H);
    ctx.rotate(rnd() * Math.PI);
    ctx.fillStyle = `rgba(${cols[i % cols.length]},${0.35 + rnd() * 0.5})`;
    ctx.fillRect(-4, -2, 8 + rnd() * 6, 4);
    ctx.restore();
  }
  for (let i = 0; i < 40; i++) {
    sparkle(ctx, rnd() * W, rnd() * H, 4 + rnd() * 6, i % 2 ? "#ffd24a" : "#ffffff", 8);
  }

  // เส้นขอบฟ้าเมืองด้านล่าง
  ctx.fillStyle = "#0a0620";
  let x = 0;
  while (x < W) {
    const bw = 40 + rnd() * 50;
    const bh = 40 + rnd() * 70;
    ctx.fillRect(x, H - bh, bw, bh);
    ctx.fillStyle = "rgba(255,210,74,0.65)";
    for (let wy = H - bh + 8; wy < H - 8; wy += 14) {
      for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
        if (rnd() > 0.55) ctx.fillRect(wx, wy, 5, 6);
      }
    }
    ctx.fillStyle = "#0a0620";
    x += bw + 2;
  }
}

function drawGhost(ctx, x, y, s, alpha = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.globalAlpha = alpha;
  ctx.shadowColor = "rgba(255,255,255,0.75)";
  ctx.shadowBlur = 26;
  const g = ctx.createLinearGradient(0, -62, 0, 60);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#e4def5");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(-34, 46);
  ctx.lineTo(-34, -10);
  ctx.bezierCurveTo(-34, -50, -18, -62, 0, -62);
  ctx.bezierCurveTo(18, -62, 34, -50, 34, -10);
  ctx.lineTo(34, 46);
  for (let i = 0; i < 3; i++) {
    const x0 = 34 - i * (68 / 3);
    const x1 = 34 - (i + 1) * (68 / 3);
    ctx.quadraticCurveTo((x0 + x1) / 2, 70, x1, 46);
  }
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#2a1a40";
  ctx.beginPath();
  ctx.ellipse(-12, -20, 5.5, 8.5, 0, 0, Math.PI * 2);
  ctx.ellipse(12, -20, 5.5, 8.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, 5.5, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,150,170,0.55)";
  ctx.beginPath();
  ctx.ellipse(-22, -6, 5, 3, 0, 0, Math.PI * 2);
  ctx.ellipse(22, -6, 5, 3, 0, 0, Math.PI * 2);
  ctx.fill();
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

  // ผีสีขาวลอยอยู่ระหว่างฟักทอง และตามขอบข้าง
  [[340, H - 70, 0.82, 0.95], [705, H - 74, 0.76, 0.95], [26, 650, 0.6, 0.6], [1054, 600, 0.62, 0.6], [1050, 840, 0.5, 0.5]].forEach(
    ([gx, gy, gs, ga]) => drawGhost(ctx, gx, gy, gs, ga)
  );
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
  if (theme === "loikrathong") return drawBgLoiKrathong(ctx, H);
  if (theme === "winter") return drawBgWinter(ctx, H);
  if (theme === "christmas") return drawBgChristmas(ctx, H);
  if (theme === "newyear") return drawBgNewYear(ctx, H);
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
  // เลือก "ไม่ใส่โลโก้" = ไม่วาดโลโก้ แต่ยังเก็บไฟล์โลโก้ไว้ ไม่ต้องอัปโหลดใหม่
  if (!images.logo || st.logoCorner === "none") return null;
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

// ---------- โปสเตอร์วิดีโอ ----------
// ขนาดโปสเตอร์เท่าแนวตั้งเดิม (1080×1200) ด้านบนเป็นกรอบสี 16:9 (1080×608) ไว้วางคลิป
// ใต้กรอบ: ป้ายหัวเรื่องกลางโปสเตอร์ แล้วแบ่งซ้าย (ชื่องาน/วันที่/เวลา) ขวา (กล่องราคา)
function drawVideoPoster(canvas, st, images) {
  const Hc = H + themeExtra(st.theme);
  canvas.width = W;
  canvas.height = Hc;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, Hc);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  drawBackground(ctx, Hc, st.theme);

  // ----- กรอบ 16:9 ด้านบน: สีที่เลือก -----
  const fh = FRAME_H;
  ctx.fillStyle = st.videoColor || "#7c3aed";
  ctx.fillRect(0, 0, W, fh);
  const sh = ctx.createLinearGradient(0, fh, 0, fh + 28);
  sh.addColorStop(0, "rgba(0,0,0,0.35)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = sh;
  ctx.fillRect(0, fh, W, 28);
  ctx.fillStyle = C.amber;
  ctx.fillRect(0, fh - 3, W, 5);

  // โลโก้ร้าน (ตำแหน่งเดิมมุมบน)
  const lr = logoRect(st, images);
  if (lr) ctx.drawImage(images.logo, lr.x, lr.y, lr.w, lr.h);

  // ----- ป้าย "เปิดหารจอไลฟ์สตรีม" กึ่งกลาง ใต้กรอบ -----
  const pillW = 580;
  const pillH = 72;
  const pillX = (W - pillW) / 2;
  const pillY = fh + 18;
  rr(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fillStyle = "rgba(19,17,32,0.62)";
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = C.amber;
  ctx.stroke();
  ctx.fillStyle = C.amber;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  fitSize(ctx, st.subtitle || "", pillW - 56, 38, 22, 600);
  ctx.fillText(st.subtitle || "", W / 2, pillY + pillH / 2 + 3);
  ctx.textBaseline = "alphabetic";

  // ----- พื้นที่รายละเอียดใต้ป้าย -----
  const topLimit = pillY + pillH + 22;
  const bottomLimit = Hc - (st.theme && st.theme !== "st" ? 140 : 36);
  const region = bottomLimit - topLimit;

  // ซ้าย: ชื่องาน + วันที่ + เวลาเริ่ม
  const lx = 50;
  const lw = 480;
  ctx.textAlign = "left";
  const rowsH = (st.dateText ? 92 : 0) + (st.timeText ? 92 : 0);
  const gap = rowsH ? 22 : 0;
  let size = 60;
  let lines = [];
  let lh = 0;
  for (; size >= 32; size -= 2) {
    setFont(ctx, 800, size);
    lines = wrapLines(ctx, st.title || "", lw);
    lh = Math.round(size * 1.2);
    const maxLines = size > 46 ? 2 : 3;
    if (lines.length <= maxLines && lines.length * lh + gap + rowsH <= region) break;
  }
  lines = lines.slice(0, 3);
  const blockH = lines.length * lh + gap + rowsH;
  let y = topLimit + Math.max(0, (region - blockH) / 2);
  ctx.fillStyle = C.text;
  setFont(ctx, 800, size);
  lines.forEach((ln, i) => ctx.fillText(ln, lx, y + size * 0.92 + i * lh));
  y += lines.length * lh + gap;

  if (st.dateText) {
    iconCalendar(ctx, lx + 4, y + 2, 64);
    ctx.fillStyle = C.text;
    setFont(ctx, 500, 24, "Sarabun");
    ctx.fillText("วันที่", lx + 92, y + 22);
    fitSize(ctx, st.dateText, lw - 92, 38, 22, 700);
    ctx.fillStyle = C.amberLight;
    ctx.fillText(st.dateText, lx + 92, y + 64);
    y += 92;
  }
  if (st.timeText) {
    iconClock(ctx, lx + 4, y + 2, 64);
    ctx.fillStyle = C.text;
    setFont(ctx, 500, 24, "Sarabun");
    ctx.fillText("เวลาเริ่ม", lx + 92, y + 22);
    fitSize(ctx, st.timeText, lw - 92, 38, 22, 700);
    ctx.fillStyle = C.amberLight;
    ctx.fillText(st.timeText, lx + 92, y + 64);
  }

  // ขวา: กล่องสี่เหลี่ยม = ราคา + จุดเด่น 3 อย่าง
  const bw = 470;
  const bx = W - 46 - bw;
  const boxH = Math.min(360, region);
  const by = topLimit + (region - boxH) / 2;
  panel(ctx, bx, by, bw, boxH, 14, "rgba(242,183,5,0.75)", 3, "rgba(19,17,32,0.72)");

  const featZone = 106;
  ctx.textAlign = "left";
  ctx.fillStyle = C.text;
  setFont(ctx, 500, 26, "Sarabun");
  const labelBase = by + 42;
  ctx.fillText(st.priceLabel || "ราคาเพียง", bx + 24, labelBase);

  const capBase = by + boxH - featZone - 14;
  const priceTxt = st.price ? Number(st.price).toLocaleString("th-TH") + ".-" : "-";
  let ps = Math.max(48, Math.min(104, (capBase - labelBase - 40) * 1.2));
  setFont(ctx, 800, ps);
  while (ps > 40 && ctx.measureText(priceTxt).width > bw - 50) {
    ps -= 4;
    setFont(ctx, 800, ps);
  }
  const priceBase = (labelBase + 6 + capBase - 28) / 2 + ps * 0.36;
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(242,183,5,0.45)";
  ctx.shadowBlur = 16;
  ctx.fillStyle = C.amberLight;
  ctx.fillText(priceTxt, bx + bw / 2, priceBase);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.fillStyle = C.text;
  fitSize(ctx, st.priceCaption || "", bw - 36, 26, 16, 600);
  ctx.fillText(st.priceCaption || "", bx + bw / 2, capBase);

  const dy = by + boxH - featZone;
  ctx.strokeStyle = "rgba(245,242,234,0.2)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx + 22, dy);
  ctx.lineTo(bx + bw - 22, dy);
  ctx.stroke();
  const feats = [
    { icon: iconFHD, label: "ความชัด 1080p" },
    { icon: iconDevices, label: "ดูได้ทุกอุปกรณ์" },
    { icon: iconLink, label: "รับชมผ่านลิงก์" },
  ];
  const cw = (bw - 24) / 3;
  feats.forEach((f, i) => {
    const cx = bx + 12 + cw * i + cw / 2;
    ctx.save();
    ctx.translate(cx, dy + 34);
    ctx.scale(0.42, 0.42);
    f.icon(ctx, 0, 0);
    ctx.restore();
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    fitSize(ctx, f.label, cw - 6, 20, 14, 600, "Sarabun");
    ctx.fillText(f.label, cx, by + boxH - 14);
  });
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
        <div style="display:flex; gap:8px; margin-bottom:12px;">
          <button type="button" id="pmModeImage" class="icon-btn" style="flex:1; padding:10px 8px;">โปสเตอร์ภาพ (แนวตั้ง)</button>
          <button type="button" id="pmModeVideo" class="icon-btn" style="flex:1; padding:10px 8px;">โปสเตอร์วิดีโอ (16:9)</button>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div id="pmVideoOpts" style="display:none;">
            <label class="field-label">สีครึ่งบนของโปสเตอร์ <span class="muted" style="font-size:11px;">(กรอบ 16:9 ไว้วางคลิป)</span></label>
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <input id="pmVideoColor" type="color" style="width:52px; height:38px; padding:0; border:1px solid var(--line,#2c2745); border-radius:8px; background:none; cursor:pointer;" />
              ${[["#00b140", "เขียว"], ["#0047bb", "น้ำเงิน"], ["#000000", "ดำ"], ["#ffffff", "ขาว"], ["#7c3aed", "ม่วง"], ["#e8384f", "แดง"]]
                .map(([c, n]) => `<button type="button" class="pm-swatch" data-color="${c}" title="${n}" style="width:30px; height:30px; border-radius:8px; border:2px solid var(--line,#2c2745); background:${c}; cursor:pointer;"></button>`)
                .join("")}
            </div>
          </div>
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
          <label id="pmBrandRow" style="display:flex; align-items:center; gap:8px; font-size:14px; cursor:pointer;">
            <input type="checkbox" id="pmShowBrand" /> แสดงชื่อร้านด้านบน (รวมดาวซ้าย-ขวา)
          </label>
          <div>
            <label class="field-label">โลโก้ร้าน <span class="muted" style="font-size:11px;">(PNG พื้นโปร่งใส เลือกครั้งเดียว ระบบจำไว้ให้)</span></label>
            <input id="pmLogoFile" type="file" accept="image/png,image/*" class="field-input" />
            <div style="display:flex; gap:10px; margin-top:6px; align-items:center;">
              <select id="pmLogoCorner" class="field-input" style="max-width:150px;">
                <option value="left">มุมบนซ้าย</option>
                <option value="right">มุมบนขวา</option>
                <option value="none">ไม่ใส่โลโก้</option>
              </select>
              <button type="button" id="pmLogoClear" class="icon-btn ghost" style="padding:8px 14px;">ลบโลโก้</button>
            </div>
          </div>
          <div id="pmPosterRow">
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
  $("pmVideoColor").value = st.videoColor;

  // สลับโหมด: โปสเตอร์ภาพแนวตั้ง / โปสเตอร์วิดีโอ 16:9
  const applyMode = () => {
    const video = st.mode === "video";
    $("pmVideoOpts").style.display = video ? "block" : "none";
    $("pmBrandRow").style.display = video ? "none" : "flex";
    $("pmPosterRow").style.display = video ? "none" : "block";
    $("pmModeImage").style.opacity = video ? "0.55" : "1";
    $("pmModeVideo").style.opacity = video ? "1" : "0.55";
    $("pmModeImage").style.outline = video ? "none" : "2px solid var(--amber,#f2b705)";
    $("pmModeVideo").style.outline = video ? "2px solid var(--amber,#f2b705)" : "none";
  };

  let raf = 0;
  const render = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() =>
      st.mode === "video" ? drawVideoPoster(canvas, st, images) : drawPoster(canvas, st, images)
    );
  };
  const setMode = (m) => {
    st.mode = m;
    saveSettings({ mode: m });
    applyMode();
    render();
  };
  $("pmModeImage").addEventListener("click", () => setMode("image"));
  $("pmModeVideo").addEventListener("click", () => setMode("video"));
  const setVideoColor = (c) => {
    st.videoColor = c;
    $("pmVideoColor").value = c;
    saveSettings({ videoColor: c });
    render();
  };
  $("pmVideoColor").addEventListener("input", (e) => setVideoColor(e.target.value));
  overlay.querySelectorAll(".pm-swatch").forEach((b) => b.addEventListener("click", () => setVideoColor(b.dataset.color)));
  applyMode();

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
        a.download = `starlive-${st.mode === "video" ? "video-" : ""}${safe}.png`;
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
