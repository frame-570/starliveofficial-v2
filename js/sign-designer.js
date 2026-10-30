// ============================================================
// ระบบ "ออกแบบป้าย" (หน้าแอดมินร้านไลฟ์)
//   - ริชเมนู: ป้าย 6 ช่องสำหรับ LINE Official (3 คอลัมน์ × 2 แถว) แก้ข้อความ/สี/ไอคอนทีละช่อง
//   - ช่องทางชำระเงิน: ป้ายสำหรับส่งในไลน์ มีช่องอัปโหลดคิวอาร์ + ชื่อบัญชี
//   ทั้งสองแบบเลือกธีมพื้นหลังได้ 6 ธีมเดียวกับระบบสร้างโปสเตอร์ และไอคอน/ภาพประกอบเป็น SVG ใน icons.js
// ============================================================
import { POSTER_THEMES, drawBackground } from "./poster.js";
import { SIGN_ICON_LIST, signIconSvg, signIllustrationSvg } from "./icons.js";
import { adminSupabase as supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

const RM_W = 2500; // ขนาดมาตรฐานริชเมนูใหญ่ของ LINE
const RM_H = 1686;
const PAY_W = 1080;
const PAY_H = 1360;
const LS_RM = "starlive_sign_richmenu_v1";
const LS_PAY = "starlive_sign_pay_v1";

// สีเน้นตั้งต้นของป้ายชำระเงิน ตามธีม
const THEME_ACCENT = {
  st: "#ffd84a",
  halloween: "#ff9a3c",
  loikrathong: "#ffe08a",
  winter: "#9fd8ff",
  christmas: "#ff7a86",
  newyear: "#ffd24a",
};

// ค่าตั้งต้นของริชเมนู 6 ช่อง (ตามดีไซน์ร้าน)
const DEFAULT_CELLS = [
  { title: "สั่งซื้อ 24 ชม.", sub: "ระบบอัตโนมัติ", color: "#f2b705", icon: "cart" },
  { title: "ทดลองรับชม", sub: "สอบถามเพิ่มเติม", color: "#27c5ff", icon: "support" },
  { title: "รีวิวร้าน", sub: "รีวิวจากลูกค้าจริง", color: "#b44dff", icon: "review" },
  { title: "หารไลฟ์สตรีม", sub: "รับชมคอนเสิร์ตสด", color: "#ff3b4a", icon: "live" },
  { title: "ติดต่อแอดมิน", sub: "สอบถามเพิ่มเติม", color: "#3d8bff", icon: "chat" },
  { title: "โปรโมชั่นช่วงนี้", sub: "รับข้อเสนอสุดพิเศษ", color: "#ff4fd8", icon: "gift" },
];

// สีสำเร็จรูปสำหรับเลือกเร็ว (โทนนีออนที่เข้ากับธีมป้าย)
const COLOR_PRESETS = [
  "#ff3b4a", "#ff6a3d", "#ff9a3c", "#f2b705", "#ffd84a", "#b6ff3b", "#46c882", "#1de9b6",
  "#27c5ff", "#3d8bff", "#7a5cff", "#b44dff", "#ff4fd8", "#ff7a9c", "#ffffff", "#9aa3b5",
];

// ---------- โปสเตอร์รวม (หลายงานในแผ่นเดียว) ----------
const MP_W = 1080;
const MP_DETAIL_MAX = 4;
const MP_H = 1528; // สัดส่วนใกล้ A4 ตามแบบที่ร่างไว้
const MP_MAX = 8;
const LS_MP = "starlive_sign_multi_v1";
const THAI_MONTHS_FULL = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];

let inited = false;
let mode = "richmenu";
let rm = loadLS(LS_RM, null) || { theme: "st", size: "large", cells: DEFAULT_CELLS.map((c) => ({ ...c })) };
let pay = loadLS(LS_PAY, null) || { theme: "st", accent: THEME_ACCENT.st, line1: "ช่องทาง", line2: "ชำระเงิน", name: "", qr: "" };
let mp = loadLS(LS_MP, null) || {
  theme: "st",
  title: "STARLIVE OFFICIAL",
  subtitle: "",
  footer: "STARLIVE OFFICIAL",
  lineId: "",
  logo: "",
  detailImg: "",
  details: "สั่งซื้อผ่านเว็บ 24 ชม. ระบบอัตโนมัติ\nรับชมได้ทั้งถ่ายทอดสดและรีรัน",
  picks: [],
};
let mpEvents = []; // รายการงานจากฐานข้อมูล
let mpLoaded = false;
let qrImage = null;
let renderToken = 0;
let saveTimer = 0;

// ------------------------------------------------------------
// ตัวช่วยทั่วไป
// ------------------------------------------------------------
function loadLS(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function saveLSSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(LS_RM, JSON.stringify(rm));
    } catch {}
    try {
      localStorage.setItem(LS_MP, JSON.stringify(mp));
    } catch {}
    try {
      localStorage.setItem(LS_PAY, JSON.stringify(pay));
    } catch {
      // คิวอาร์ใหญ่เกินที่เก็บในเครื่องได้ -> เก็บส่วนอื่นไว้ ไม่เก็บรูป
      try {
        localStorage.setItem(LS_PAY, JSON.stringify({ ...pay, qr: "" }));
      } catch {}
    }
  }, 400);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function hexToRgb(hex) {
  const h = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "888888";
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function mix(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const lighten = (c, t) => mix(c, "#ffffff", t);
const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

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
// ลดขนาดตัวอักษรให้พอดีความกว้าง
function fitFont(ctx, text, weight, maxW, start, min, family = "Prompt") {
  let s = start;
  setFont(ctx, weight, s, family);
  while (s > min && ctx.measureText(text).width > maxW) {
    s -= 2;
    setFont(ctx, weight, s, family);
  }
  return s;
}

const imgCache = new Map();
function svgImage(svg) {
  if (!imgCache.has(svg)) {
    imgCache.set(
      svg,
      new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = reject;
        im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      })
    );
  }
  return imgCache.get(svg);
}

// วาดพื้นหลังธีม (ชุดเดียวกับโปสเตอร์) ให้เต็มพื้นที่ W×H
function paintTheme(ctx, W, H, theme) {
  const s = W / 1080;
  const offH = Math.ceil(H / s);
  const off = document.createElement("canvas");
  off.width = 1080;
  off.height = offH;
  drawBackground(off.getContext("2d"), offH, theme);
  ctx.drawImage(off, 0, 0, 1080 * s, offH * s);
}

// ------------------------------------------------------------
// วาดริชเมนู
// ------------------------------------------------------------
async function ensureFonts(text) {
  try {
    await Promise.all([
      document.fonts.load("800 40px Prompt", text || "ก"),
      document.fonts.load("600 40px Prompt", text || "ก"),
    ]);
  } catch {}
}

async function renderRichMenu(canvas, outW, outH) {
  const token = ++renderToken;
  await ensureFonts(rm.cells.map((c) => (c.title || "") + (c.sub || "")).join(""));
  const icons = await Promise.all(rm.cells.map((c) => svgImage(signIconSvg(c.icon, lighten(c.color, 0.2), 512, 5))));
  if (token !== renderToken) return false;

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(outW / RM_W, outH / RM_H);
  ctx.textBaseline = "alphabetic";

  paintTheme(ctx, RM_W, RM_H, rm.theme);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(0, 0, RM_W, RM_H);

  const margin = 80;
  const gap = 46;
  const cw = (RM_W - margin * 2 - gap * 2) / 3;
  const ch = (RM_H - margin * 2 - gap) / 2;

  rm.cells.forEach((c, i) => {
    const x = margin + (i % 3) * (cw + gap);
    const y = margin + Math.floor(i / 3) * (ch + gap);
    drawCell(ctx, x, y, cw, ch, c, icons[i]);
  });
  ctx.restore();
  return true;
}

function drawCell(ctx, x, y, w, h, c, iconImg) {
  const accent = c.color;
  const R = 58;

  // พื้นช่อง: กระจกเข้มอมสีของช่อง
  ctx.save();
  rr(ctx, x, y, w, h, R);
  // สีพื้นในกรอบ: เปิด/ปิดได้ (ปิด = กรอบโปร่งใส เห็นสีธีมล้วน เหลือแค่ขอบนีออน)
  if (rm.fill !== false) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, mix(accent, "#0a0f24", 0.42));
    g.addColorStop(1, mix(accent, "#0a0f24", 0.58));
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.clip();
    const glow = ctx.createRadialGradient(x + w / 2, y + h * 0.35, 20, x + w / 2, y + h * 0.35, w * 0.8);
    glow.addColorStop(0, rgba(accent, 0.22));
    glow.addColorStop(1, rgba(accent, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, w, h);
    // เงาแสงเฉียงบนช่อง
    const sheen = ctx.createLinearGradient(x, y, x + w, y + h * 0.5);
    sheen.addColorStop(0, "rgba(255,255,255,0.10)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();

  // ขอบนีออน
  ctx.save();
  rr(ctx, x, y, w, h, R);
  ctx.shadowColor = accent;
  ctx.shadowBlur = 38;
  ctx.lineWidth = 8;
  ctx.strokeStyle = accent;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  rr(ctx, x + 5, y + 5, w - 10, h - 10, R - 5);
  ctx.lineWidth = 3;
  ctx.strokeStyle = lighten(accent, 0.55);
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.restore();

  const cx = x + w / 2;

  // ไอคอน SVG
  if (iconImg) {
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 30;
    ctx.drawImage(iconImg, cx - 118, y + 62, 236, 236);
    ctx.restore();
  }

  // หัวข้อ
  ctx.save();
  ctx.textAlign = "center";
  const title = c.title || "";
  const ts = fitFont(ctx, title, 800, w - 90, 118, 56);
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(title, cx, y + 440);
  ctx.restore();

  // ข้อความรอง
  ctx.save();
  ctx.textAlign = "center";
  const sub = c.sub || "";
  fitFont(ctx, sub, 600, w - 110, 56, 32);
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillText(sub, cx, y + 520);
  ctx.restore();

  // ปุ่มลูกศรกลม
  const by = y + h - 96;
  ctx.save();
  ctx.lineWidth = 6;
  ctx.strokeStyle = "#ffffff";
  ctx.shadowColor = accent;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(cx, by, 48, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx - 10, by - 20);
  ctx.lineTo(cx + 14, by);
  ctx.lineTo(cx - 10, by + 20);
  ctx.stroke();
  ctx.restore();
}

// ------------------------------------------------------------
// วาดป้ายช่องทางชำระเงิน
// ------------------------------------------------------------
function fancyText(ctx, text, cx, baseline, size, accent) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, cx, baseline);
  ctx.restore();
}

async function renderPay(canvas, outW, outH) {
  const token = ++renderToken;
  await ensureFonts((pay.line1 || "") + (pay.line2 || "") + (pay.name || ""));
  const accent = pay.accent;
  const [coin, phone] = await Promise.all([
    svgImage(signIllustrationSvg("coin", accent).replace('width="200" height="200"', 'width="512" height="512"')),
    svgImage(signIllustrationSvg("phone", accent).replace('width="200" height="260"', 'width="400" height="520"')),
  ]);
  if (token !== renderToken) return false;

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(outW / PAY_W, outH / PAY_H);
  ctx.textBaseline = "alphabetic";

  drawBackground(ctx, PAY_H, pay.theme);
  ctx.fillStyle = "rgba(0,0,0,0.06)";
  ctx.fillRect(0, 0, PAY_W, PAY_H);

  // ป้ายชื่อร้านด้านบน
  ctx.save();
  const brand = "STARLIVE OFFICIAL";
  setFont(ctx, 700, 34);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "4px";
  const bw = ctx.measureText(brand).width + 90;
  rr(ctx, (PAY_W - bw) / 2, 52, bw, 70, 35);
  ctx.fillStyle = "rgba(255,255,255,0.93)";
  ctx.shadowColor = rgba(accent, 0.7);
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#1c2a6b";
  ctx.textAlign = "center";
  ctx.fillText(brand, PAY_W / 2 + 2, 99);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.restore();

  // เหรียญตกแต่ง (อยู่หลังตัวหนังสือ)
  ctx.save();
  ctx.translate(900, 215);
  ctx.rotate(0.28);
  ctx.shadowColor = rgba(accent, 0.8);
  ctx.shadowBlur = 30;
  ctx.drawImage(coin, -105, -105, 210, 210);
  ctx.restore();

  // หัวข้อ
  const l1 = pay.line1 || "";
  const l2 = pay.line2 || "";
  const s1 = fitFont(ctx, l1, 800, 760, 122, 54);
  fancyText(ctx, l1, PAY_W / 2, 258, s1, accent);
  const s2 = fitFont(ctx, l2, 800, 940, 204, 80);
  fancyText(ctx, l2, PAY_W / 2, 258 + s2 * 0.92 + 16, s2, accent);

  // การ์ดคิวอาร์
  const qs = 560;
  const qx = (PAY_W - qs) / 2;
  const qy = 500;
  ctx.save();
  rr(ctx, qx, qy, qs, qs, 56);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  ctx.fill();
  ctx.restore();
  if (qrImage) {
    const pad = 38;
    const inner = qs - pad * 2;
    const k = Math.min(inner / qrImage.width, inner / qrImage.height);
    const w = qrImage.width * k;
    const h = qrImage.height * k;
    ctx.drawImage(qrImage, qx + (qs - w) / 2, qy + (qs - h) / 2, w, h);
  } else {
    ctx.save();
    ctx.setLineDash([16, 12]);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#b9bfdc";
    rr(ctx, qx + 40, qy + 40, qs - 80, qs - 80, 28);
    ctx.stroke();
    ctx.fillStyle = "#8a90b5";
    ctx.textAlign = "center";
    setFont(ctx, 600, 38);
    ctx.fillText("อัปโหลดคิวอาร์โค้ด", PAY_W / 2, qy + qs / 2 + 12);
    ctx.restore();
  }

  // ชื่อบัญชี
  const ph = 108;
  const py = qy + qs + 34;
  const pw = 640;
  ctx.save();
  rr(ctx, (PAY_W - pw) / 2, py, pw, ph, ph / 2);
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 8;
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.textAlign = "center";
  const nm = pay.name || "ชื่อบัญชี";
  fitFont(ctx, nm, 800, pw - 90, 56, 30);
  ctx.fillStyle = pay.name ? mix(accent, "#1c1f5a", 0.84) : "#a4a9c9";
  ctx.fillText(nm, PAY_W / 2, py + ph / 2 + 19);
  ctx.restore();

  // ภาพประกอบมือถือสแกน
  ctx.save();
  ctx.translate(120, 840);
  ctx.rotate(-0.1);
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 24;
  ctx.drawImage(phone, -100, -130, 200, 260);
  ctx.restore();

  ctx.restore();
  return true;
}

// ------------------------------------------------------------
// วาดโปสเตอร์รวม: ซ้าย = โปสเตอร์งาน, ขวา = ราคา, รายละเอียดอยู่ด้านล่าง (สูงสุด 8 งาน)
// ------------------------------------------------------------
const mpImgCache = new Map();
function loadPosterImage(url) {
  if (!url) return Promise.resolve(null);
  if (!mpImgCache.has(url)) {
    mpImgCache.set(
      url,
      new Promise((resolve) => {
        const im = new Image();
        im.crossOrigin = "anonymous"; // ถ้าเซิร์ฟเวอร์ไม่อนุญาต จะ error แล้วใช้กรอบแทน (ไม่ทำให้ไฟล์ดาวน์โหลดพัง)
        im.onload = () => resolve(im);
        im.onerror = () => resolve(null);
        im.src = url;
      })
    );
  }
  return mpImgCache.get(url);
}

function mpEventDateLabel(ev) {
  const dates = (ev.event_days || []).map((d) => d.event_date).filter(Boolean).sort();
  if (!dates.length) return "";
  const nums = dates.map((d) => new Date(d).getDate());
  const last = new Date(dates[dates.length - 1]);
  return `${nums.join("-")} ${THAI_MONTHS_FULL[last.getMonth()]}`;
}

function mpAutoPriceLines(ev) {
  return [...(ev.ticket_packages || [])]
    .sort((a, b) => a.num_days - b.num_days)
    .map((p) => `${p.num_days} วัน ${Number(p.price).toLocaleString("th-TH")}฿`);
}

function mpPriceLines(ev, pick) {
  const raw = pick.priceText !== undefined ? pick.priceText : mpAutoPriceLines(ev).join("\n");
  return String(raw)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function parsePriceLine(line) {
  const m = line.match(/^(.*?)\s*([\d,]+(?:\.\d+)?\s*฿|ฟรี)$/);
  return m ? { label: m[1].trim(), price: m[2].replace(/\s+/g, "") } : { label: "", price: line };
}

function mpResolvedPicks() {
  return mp.picks
    .map((p) => ({ pick: p, ev: mpEvents.find((e) => String(e.id) === String(p.id)) }))
    .filter((x) => x.ev)
    .slice(0, MP_MAX);
}

function drawCover(ctx, img, x, y, w, h) {
  const k = Math.max(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, x + (w - dw) / 2, y, dw, dh); // ชิดบน (โปสเตอร์ส่วนมากหัวข้ออยู่บน)
}

function fileToDataUrl(file, maxDim, mime, quality) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, maxDim / Math.max(im.width, im.height));
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(im.width * k));
        c.height = Math.max(1, Math.round(im.height * k));
        c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL(mime, quality));
      };
      im.onerror = reject;
      im.src = fr.result;
    };
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function drawContain(ctx, img, x, y, w, h) {
  const k = Math.min(w / img.width, h / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

// ตัดข้อความเป็นบรรทัดตามคำ (ภาษาไทยใช้ตัวตัดคำของเบราว์เซอร์) คำเดียวที่ยาวเกินค่อยหั่นตามตัวอักษร
function mpWrapWords(ctx, text, maxW) {
  let words;
  try {
    words = Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), (x) => x.segment);
  } catch {
    words = text.split(/(\s+)/);
  }
  const out = [];
  let cur = "";
  const push = () => {
    if (cur.trim()) out.push(cur.trim());
    cur = "";
  };
  for (const w of words) {
    if (ctx.measureText(cur + w).width <= maxW) {
      cur += w;
      continue;
    }
    push();
    if (ctx.measureText(w.trim()).width <= maxW) {
      cur = w.trimStart();
    } else {
      for (const ch of Array.from(w)) {
        if (ctx.measureText(cur + ch).width > maxW && cur) push();
        cur += ch;
      }
    }
  }
  push();
  return out;
}

// เลือกไอคอน svg ให้แต่ละบรรทัดรายละเอียดตามคำในบรรทัด (ไม่เจอคำ = วนตามลำดับ)
function mpRowIcon(text, k) {
  const t = String(text);
  if (/line|ไลน์|แอด|สอบถาม|ติดต่อ/i.test(t)) return "support";
  if (/สั่งซื้อ|ซื้อ|ชำระ|จ่าย|ราคา/.test(t)) return "cart";
  if (/ถ่ายทอด|ไลฟ์|รีรัน|รับชม|ดู/.test(t)) return "live";
  if (/บัตร|รหัส|เครื่อง|เข้างาน/.test(t)) return "ticket";
  if (/โปร|ส่วนลด|แถม|ของขวัญ/.test(t)) return "gift";
  if (/รีวิว|ดาว/.test(t)) return "star";
  return ["star", "heart", "megaphone", "chat"][k % 4];
}
function mpDetailRows() {
  const rows = String(mp.details || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MP_DETAIL_MAX)
    .map((t, k) => ({ t, icon: mpRowIcon(t, k) }));
  const id = String(mp.lineId || "").trim();
  if (id) rows.push({ t: `LINE ID: ${id}`, icon: "chat", strong: true });
  return rows;
}

async function renderMulti(canvas, outW, outH) {
  const token = ++renderToken;
  const rowsData = mpDetailRows();
  await ensureFonts(mp.title + mp.subtitle + mp.details + mp.lineId + mpResolvedPicks().map((x) => x.ev.title).join(""));
  try {
    await Promise.all([document.fonts.load("600 30px Mali", "ก"), document.fonts.load("700 30px Mali", "ก")]);
  } catch {}
  const items = mpResolvedPicks();
  const accent0 = THEME_ACCENT[mp.theme] || "#ffd84a";
  const [images, logoImg, detailImg, rowIcons, artIcon] = await Promise.all([
    Promise.all(items.map((x) => loadPosterImage(x.ev.banner_url))),
    loadPosterImage(mp.logo),
    loadPosterImage(mp.detailImg),
    Promise.all(rowsData.map((r) => svgImage(signIconSvg(r.icon, "#ffffff", 128, 6)))),
    svgImage(signIconSvg("live", lighten(accent0, 0.55), 512, 4)),
  ]);
  if (token !== renderToken) return false;

  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.scale(outW / MP_W, outH / MP_H);
  ctx.textBaseline = "alphabetic";

  const accent = THEME_ACCENT[mp.theme] || "#ffd84a";
  paintTheme(ctx, MP_W, MP_H, mp.theme);
  ctx.fillStyle = "rgba(0,0,0,0.1)";
  ctx.fillRect(0, 0, MP_W, MP_H);

  // ---------- หัวโปสเตอร์: โลโก้ร้านมุมซ้ายบน + ชื่อกลาง ----------
  if (logoImg) {
    const box = 172;
    const k = Math.min(box / logoImg.width, box / logoImg.height);
    const lw = logoImg.width * k;
    const lh = logoImg.height * k;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 16;
    ctx.drawImage(logoImg, 36, 16 + (box - lh) / 2, lw, lh);
    ctx.restore();
  }
  const title = mp.title || "";
  const titleMax = logoImg ? 680 : 960;
  const ts = fitFont(ctx, title, 800, titleMax, 76, 40);
  fancyText(ctx, title, MP_W / 2 + (logoImg ? 100 : 0), 105, ts, accent);
  if (mp.subtitle) {
    ctx.save();
    ctx.textAlign = "center";
    fitFont(ctx, mp.subtitle, 600, titleMax, 36, 22);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(mp.subtitle, MP_W / 2 + (logoImg ? 100 : 0), 152);
    ctx.restore();
  }

  // ---------- ตารางงาน: 2 คอลัมน์ ซ้าย = โปสเตอร์ (จัตุรัส) ขวา = ราคา ----------
  const top = 190;
  const bottom = 1148;
  const n = items.length;
  if (n === 0) {
    ctx.save();
    ctx.textAlign = "center";
    setFont(ctx, 600, 38);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("เลือกงานที่จะใส่ในโปสเตอร์ (สูงสุด 8 งาน)", MP_W / 2, (top + bottom) / 2);
    ctx.restore();
  }
  const rows = Math.max(1, Math.ceil(n / 2));
  const gapY = 18;
  const gapX = 28;
  const colW = (MP_W - 80 - gapX) / 2;
  const cellH = Math.min(262, (bottom - top - gapY * (rows - 1)) / rows);
  const gridH = cellH * rows + gapY * (rows - 1);
  const startY = top + (bottom - top - gridH) / 2;

  items.forEach(({ pick, ev }, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const cx = 40 + col * (colW + gapX);
    const cy = startY + row * (cellH + gapY);

    // โปสเตอร์ทรงจัตุรัส
    const s = cellH;
    ctx.save();
    rr(ctx, cx, cy, s, s, 22);
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#0a0f24";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.clip();
    const img = images[i];
    if (img) {
      drawCover(ctx, img, cx, cy, s, s);
    } else {
      const g = ctx.createLinearGradient(cx, cy, cx + s, cy + s);
      g.addColorStop(0, mix(accent, "#0a0f24", 0.55));
      g.addColorStop(1, mix(accent, "#0a0f24", 0.8));
      ctx.fillStyle = g;
      ctx.fillRect(cx, cy, s, s);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "center";
      fitFont(ctx, ev.title || "", 700, s - 24, 28, 14);
      ctx.fillText(ev.title || "", cx + s / 2, cy + s / 2 + 8);
    }
    ctx.restore();
    ctx.save();
    rr(ctx, cx, cy, s, s, 22);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.stroke();
    ctx.restore();

    // ราคาอยู่ขวาของโปสเตอร์ เรียงเป็นบรรทัด
    const lines = mpPriceLines(ev, pick);
    const px = cx + s + 14;
    const pw = colW - s - 14;
    // ชื่องาน: ชิดบนเท่าขอบบนของโปสเตอร์ สูงสุด 2 บรรทัด
    let titleH = 0;
    if (pw > 60 && ev.title) {
      // ตัดบรรทัดตามคำ (ไม่หั่นกลางคำ) ถ้ายังเกิน 2 บรรทัดให้ลดขนาดตัวอักษรลง
      let tsz = 28;
      let tl = [];
      for (; tsz >= 20; tsz -= 2) {
        setFont(ctx, 700, tsz);
        tl = mpWrapWords(ctx, String(ev.title), pw);
        if (tl.length <= 2) break;
      }
      if (tl.length > 2) {
        tl.length = 2;
        let last = tl[1];
        while (last.length > 1 && ctx.measureText(last + "…").width > pw) last = last.slice(0, -1);
        tl[1] = last + "…";
      }
      ctx.save();
      ctx.textAlign = "left";
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "#ffffff";
      tl.forEach((t, k) => ctx.fillText(t, px, cy + tsz * 0.95 + k * tsz * 1.25));
      ctx.restore();
      titleH = tl.length * tsz * 1.25 + 10;
    }
    if (lines.length && pw > 60) {
      const lg = 8;
      const lh = Math.min(52, (s - titleH - lg * (lines.length - 1)) / lines.length);
      const by = cy + titleH;
      lines.forEach((line, k) => {
        const { label, price } = parsePriceLine(line);
        const ly = by + k * (lh + lg);
        ctx.save();
        rr(ctx, px, ly, pw, lh, 16);
        ctx.fillStyle = "rgba(10,12,30,0.6)";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = rgba(accent, 0.85);
        ctx.stroke();
        const base = ly + lh / 2 + lh * 0.17;
        if (label) {
          ctx.textAlign = "left";
          setFont(ctx, 600, Math.round(lh * 0.38));
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          const lw = ctx.measureText(label).width;
          ctx.fillText(label, px + 14, base);
          ctx.textAlign = "right";
          fitFont(ctx, price, 800, pw - lw - 44, Math.round(lh * 0.56), 14);
          ctx.fillStyle = lighten(accent, 0.55);
          ctx.fillText(price, px + pw - 14, base);
        } else {
          ctx.textAlign = "center";
          fitFont(ctx, price, 800, pw - 24, Math.round(lh * 0.56), 14);
          ctx.fillStyle = lighten(accent, 0.55);
          ctx.fillText(price, px + pw / 2, base);
        }
        ctx.restore();
      });
    }
  });

  // ---------- กรอบรายละเอียดด้านล่าง ----------
  const dy = 1170;
  const dh = 272;
  ctx.save();
  rr(ctx, 40, dy, 1000, dh, 34);
  ctx.fillStyle = "rgba(10,12,30,0.62)";
  ctx.shadowColor = "rgba(0,0,0,0.4)";
  ctx.shadowBlur = 22;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = rgba(accent, 0.85);
  ctx.stroke();
  ctx.restore();

  // ซ้ายของกรอบ: รูปที่อัปโหลด หรือถ้าไม่มี = ภาพ svg ตกแต่ง
  const ib = dh - 48;
  const ax = 64;
  const ay = dy + 24;
  if (detailImg) {
    ctx.save();
    rr(ctx, ax, ay, ib, ib, 26);
    ctx.clip();
    const k = Math.max(ib / detailImg.width, ib / detailImg.height);
    ctx.drawImage(detailImg, ax + (ib - detailImg.width * k) / 2, ay + (ib - detailImg.height * k) / 2, detailImg.width * k, detailImg.height * k);
    ctx.restore();
    ctx.save();
    rr(ctx, ax, ay, ib, ib, 26);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.save();
    const g = ctx.createRadialGradient(ax + ib * 0.4, ay + ib * 0.35, 10, ax + ib / 2, ay + ib / 2, ib * 0.62);
    g.addColorStop(0, rgba(accent, 0.55));
    g.addColorStop(1, rgba(accent, 0.12));
    rr(ctx, ax, ay, ib, ib, 26);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(accent, 0.9);
    ctx.stroke();
    ctx.shadowColor = rgba(accent, 0.9);
    ctx.shadowBlur = 22;
    const isz = ib * 0.66;
    ctx.drawImage(artIcon, ax + (ib - isz) / 2, ay + (ib - isz) / 2, isz, isz);
    ctx.restore();
  }

  // ขวา: แถวรายละเอียด ไอคอนกลมซ้าย + ข้อความ
  if (rowsData.length) {
    const tx0 = ax + ib + 30;
    const rowsH = dh - 36;
    const lh = Math.min(60, rowsH / rowsData.length);
    const total = lh * rowsData.length;
    const y0 = dy + (dh - total) / 2;
    const ic = Math.min(52, lh - 4);
    rowsData.forEach((d, k) => {
      const cy = y0 + k * lh + lh / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(tx0 + ic / 2, cy, ic / 2, 0, Math.PI * 2);
      const gg = ctx.createLinearGradient(tx0, cy - ic / 2, tx0 + ic, cy + ic / 2);
      gg.addColorStop(0, lighten(accent, 0.1));
      gg.addColorStop(1, mix(accent, "#000000", 0.35));
      ctx.fillStyle = gg;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.75)";
      ctx.stroke();
      const isz2 = ic * 0.72;
      ctx.drawImage(rowIcons[k], tx0 + (ic - isz2) / 2, cy - isz2 / 2, isz2, isz2);
      ctx.restore();

      ctx.save();
      ctx.textAlign = "left";
      const tx = tx0 + ic + 16;
      const tw = 1016 - tx;
      const weight = d.strong ? 700 : 600;
      fitFont(ctx, d.t, weight, tw, Math.round(lh * (d.strong ? 0.66 : 0.56)), 16, "Mali");
      ctx.shadowColor = "rgba(0,0,0,0.35)";
      ctx.shadowBlur = 6;
      ctx.fillStyle = d.strong ? lighten(accent, 0.6) : "#ffffff";
      ctx.fillText(d.t, tx, cy + lh * 0.2);
      ctx.restore();
    });
  }

  // ท้ายโปสเตอร์
  ctx.save();
  ctx.textAlign = "center";
  setFont(ctx, 700, 34);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "5px";
  ctx.shadowColor = rgba(accent, 0.8);
  ctx.shadowBlur = 16;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(mp.footer ?? "STARLIVE OFFICIAL", MP_W / 2 + 2, 1492);
  ctx.restore();

  ctx.restore();
  return true;
}

// ------------------------------------------------------------
// ดาวน์โหลด
// ------------------------------------------------------------
const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

async function jpegUnder(canvas, maxBytes) {
  let q = 0.95;
  let blob = await toBlob(canvas, "image/jpeg", q);
  while (blob && blob.size > maxBytes && q > 0.4) {
    q -= 0.07;
    blob = await toBlob(canvas, "image/jpeg", q);
  }
  return { blob, q };
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

const fmtSize = (n) => (n >= 1048576 ? (n / 1048576).toFixed(2) + " MB" : Math.round(n / 1024) + " KB");

async function download(kind) {
  const status = $("signStatus");
  status.style.color = "";
  status.textContent = "กำลังสร้างไฟล์...";
  const full = document.createElement("canvas");
  let ok;
  let base;
  if (mode === "richmenu") {
    const small = rm.size === "small";
    ok = await renderRichMenu(full, small ? 1200 : RM_W, small ? 810 : RM_H);
    base = "starlive-richmenu";
  } else if (mode === "multi") {
    ok = await renderMulti(full, MP_W, MP_H);
    base = "starlive-multi-poster";
  } else {
    ok = await renderPay(full, PAY_W, PAY_H);
    base = "starlive-payment";
  }
  if (!ok) return;
  if (kind === "png") {
    const blob = await toBlob(full, "image/png");
    saveBlob(blob, `${base}.png`);
    const over = mode === "richmenu" && blob.size > 1000000;
    status.textContent = `ดาวน์โหลด PNG แล้ว (${fmtSize(blob.size)})` + (over ? " — เกิน 1MB ที่ LINE กำหนดสำหรับริชเมนู ให้ใช้ปุ่ม JPG แทน" : "");
    status.style.color = over ? "var(--amber)" : "";
  } else {
    const { blob, q } = await jpegUnder(full, mode === "richmenu" ? 1000000 : 4000000);
    saveBlob(blob, `${base}.jpg`);
    const okSize = mode !== "richmenu" || blob.size <= 1000000;
    status.textContent = `ดาวน์โหลด JPG แล้ว (${fmtSize(blob.size)}, คุณภาพ ${Math.round(q * 100)}%)` + (mode === "richmenu" ? (okSize ? " — ผ่านเกณฑ์ LINE ไม่เกิน 1MB" : " — ยังเกิน 1MB ลองลดความซับซ้อนของสี/ธีม") : "");
    status.style.color = okSize ? "#46c882" : "var(--crimson)";
  }
}

// ------------------------------------------------------------
// หน้าจอ (UI)
// ------------------------------------------------------------
function buildUI(root) {
  const themeOptions = POSTER_THEMES.map((t) => `<option value="${t.id}">${t.label}</option>`).join("");
  const iconOptions = SIGN_ICON_LIST.map((i) => `<option value="${i.id}">${i.label}</option>`).join("");

  const cellEditors = rm.cells
    .map(
      (c, i) => `
      <div class="sign-cell-card" data-cell="${i}">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
          <strong style="font-size:13px;">ช่อง ${i + 1}</strong>
          <button type="button" class="sign-cell-swatch" title="เลือกสีช่อง" aria-label="เลือกสีช่อง ${i + 1}" style="width:44px; height:30px; padding:0; border:2px solid rgba(255,255,255,0.55); border-radius:8px; cursor:pointer; background:${esc(c.color)};"></button>
          <input type="color" class="sign-cell-color" value="${esc(c.color)}" tabindex="-1" aria-hidden="true" style="position:absolute; width:0; height:0; opacity:0; pointer-events:none;" />
        </div>
        <input class="field-input sign-cell-title" value="${esc(c.title)}" placeholder="หัวข้อ" maxlength="24" style="margin-bottom:6px;" />
        <input class="field-input sign-cell-sub" value="${esc(c.sub)}" placeholder="ข้อความรอง" maxlength="30" style="margin-bottom:6px;" />
        <select class="field-input sign-cell-icon">${iconOptions}</select>
      </div>`
    )
    .join("");

  root.innerHTML = `
    <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;" id="signSubTabs">
      <button type="button" class="icon-btn sign-sub active" data-sub="richmenu">ริชเมนู</button>
      <button type="button" class="icon-btn ghost sign-sub" data-sub="pay">ช่องทางชำระเงิน</button>
      <button type="button" class="icon-btn ghost sign-sub" data-sub="multi">โปสเตอร์รวม</button>
    </div>

    <div style="display:flex; gap:18px; flex-wrap:wrap; align-items:flex-start;">
      <div style="flex:1 1 340px; min-width:300px; max-width:520px;">

        <!-- ริชเมนู -->
        <div id="signPanelRich" class="admin-card" style="padding:16px;">
          <h3 class="display" style="margin:0 0 4px;">ริชเมนู (6 ช่อง)</h3>
          <p class="muted" style="font-size:12.5px; margin:0 0 12px; line-height:1.6;">ป้ายเมนูสำหรับ LINE Official แบ่ง 3×2 ช่อง แก้ข้อความ สี และไอคอนของแต่ละช่องได้</p>
          <label class="field-label" for="signRmTheme">ธีมพื้นหลัง</label>
          <select id="signRmTheme" class="field-input" style="margin-bottom:10px;">${themeOptions}</select>
          <label class="field-label" for="signRmSize">ขนาดไฟล์</label>
          <select id="signRmSize" class="field-input" style="margin-bottom:14px;">
            <option value="large">ใหญ่ 2500×1686 (มาตรฐานริชเมนู LINE)</option>
            <option value="small">เล็ก 1200×810</option>
          </select>
          <button type="button" id="signRmAllSame" class="icon-btn ghost" style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span id="signRmAllSwatch" style="width:18px; height:18px; border-radius:50%; border:2px solid rgba(255,255,255,0.6); display:inline-block;"></span>
            <span>ใช้สีเดียวกันทั้งหมด <span class="muted" style="font-size:12px;">(ใช้สีที่เลือกล่าสุด)</span></span>
          </button>
          <label style="display:flex; align-items:center; gap:8px; margin-bottom:14px; cursor:pointer; font-size:13.5px;">
            <input type="checkbox" id="signRmFill" />
            <span>มีสีพื้นในกรอบ <span class="muted" style="font-size:12px;">(ปิด = กรอบโปร่งใส เห็นสีธีมเต็มๆ เหลือแค่ขอบ)</span></span>
          </label>
          <div style="display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:10px;">${cellEditors}</div>
          <button type="button" id="signRmReset" class="icon-btn ghost" style="margin-top:12px;">คืนค่าเริ่มต้นของริชเมนู</button>
        </div>

        <!-- ช่องทางชำระเงิน -->
        <div id="signPanelPay" class="admin-card" style="padding:16px; display:none;">
          <h3 class="display" style="margin:0 0 4px;">ป้ายช่องทางชำระเงิน</h3>
          <p class="muted" style="font-size:12.5px; margin:0 0 12px; line-height:1.6;">ป้ายสำหรับส่งในไลน์ อัปโหลดคิวอาร์และใส่ชื่อบัญชี</p>
          <label class="field-label" for="signPayTheme">ธีมพื้นหลัง</label>
          <select id="signPayTheme" class="field-input" style="margin-bottom:10px;">${themeOptions}</select>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:10px;">
            <div><label class="field-label" for="signPayLine1">หัวข้อบรรทัดบน</label><input id="signPayLine1" class="field-input" maxlength="16" /></div>
            <div><label class="field-label" for="signPayLine2">หัวข้อหลัก</label><input id="signPayLine2" class="field-input" maxlength="14" /></div>
          </div>
          <label class="field-label" for="signPayName">ชื่อบัญชี</label>
          <input id="signPayName" class="field-input" maxlength="40" placeholder="เช่น ชื่อ-นามสกุลเจ้าของบัญชี" style="margin-bottom:10px;" />
          <label class="field-label" for="signPayQr">คิวอาร์โค้ด <span class="muted" style="font-size:11px;">(รูปภาพ PNG/JPG)</span></label>
          <input id="signPayQr" type="file" accept="image/*" class="field-input" />
          <div style="display:flex; gap:10px; align-items:center; margin:10px 0;">
            <label class="field-label" for="signPayAccent" style="margin:0;">สีหัวข้อ</label>
            <input id="signPayAccent" type="color" style="width:52px; height:34px; padding:0; border:1px solid var(--line); border-radius:8px; background:none; cursor:pointer;" />
            <button type="button" id="signPayQrClear" class="icon-btn ghost" style="margin-left:auto;">ลบคิวอาร์</button>
          </div>
        </div>

        <!-- โปสเตอร์รวม -->
        <div id="signPanelMulti" class="admin-card" style="padding:16px; display:none;">
          <h3 class="display" style="margin:0 0 4px;">โปสเตอร์รวม (สูงสุด ${MP_MAX} งาน)</h3>
          <p class="muted" style="font-size:12.5px; margin:0 0 12px; line-height:1.6;">โปสเตอร์โปรโมทหลายงานในแผ่นเดียว เรียง 2 คอลัมน์ แต่ละงานซ้าย = โปสเตอร์ ขวา = ราคา มีโลโก้ร้านมุมซ้ายบน และกรอบรายละเอียดด้านล่าง ดึงงานและราคาจากระบบให้อัตโนมัติ</p>
          <label class="field-label" for="signMpTheme">ธีมพื้นหลัง</label>
          <select id="signMpTheme" class="field-input" style="margin-bottom:10px;">${themeOptions}</select>
          <label class="field-label" for="signMpTitle">หัวข้อ</label>
          <input id="signMpTitle" class="field-input" maxlength="40" style="margin-bottom:10px;" />
          <label class="field-label" for="signMpSub">ข้อความใต้หัวข้อ <span class="muted" style="font-size:11px;">(ไม่บังคับ)</span></label>
          <input id="signMpSub" class="field-input" maxlength="60" style="margin-bottom:10px;" />
          <label class="field-label" for="signMpLogo">โลโก้ร้าน (มุมซ้ายบน) <span class="muted" style="font-size:11px;">(รูป PNG/JPG)</span></label>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <input id="signMpLogo" type="file" accept="image/*" class="field-input" style="flex:1; min-width:0;" />
            <button type="button" id="signMpLogoClear" class="icon-btn ghost">ลบ</button>
          </div>
          <label class="field-label" for="signMpFooter">ข้อความท้ายโปสเตอร์</label>
          <input id="signMpFooter" class="field-input" maxlength="40" style="margin-bottom:12px;" />

          <label class="field-label">งานในโปสเตอร์ <span id="signMpCount" class="muted" style="font-size:12px;"></span></label>
          <div style="display:flex; gap:8px; margin-bottom:10px;">
            <select id="signMpAddSelect" class="field-input" style="flex:1; min-width:0;"></select>
            <button type="button" id="signMpAddBtn" class="icon-btn">เพิ่มงาน</button>
          </div>
          <div id="signMpList" style="display:flex; flex-direction:column; gap:10px; margin-bottom:12px;"></div>

          <label class="field-label" for="signMpDetails">รายละเอียดในกรอบด้านล่าง <span class="muted" style="font-size:11px;">(1 บรรทัด = 1 แถว สูงสุด 4 บรรทัด ระบบใส่ไอคอนให้ตามคำ)</span></label>
          <textarea id="signMpDetails" class="field-input" rows="4" maxlength="300" style="resize:vertical; font-family:'Sarabun',sans-serif; line-height:1.6; margin-bottom:10px;"></textarea>
          <label class="field-label" for="signMpLineId">LINE ID <span class="muted" style="font-size:11px;">(แสดงในกรอบเป็น "LINE ID: ..." เว้นว่าง = ไม่แสดง)</span></label>
          <input id="signMpLineId" class="field-input" maxlength="40" placeholder="เช่น @starlive" style="margin-bottom:10px;" />
          <label class="field-label" for="signMpDetailImg">รูปประกอบในกรอบรายละเอียด <span class="muted" style="font-size:11px;">(ไม่บังคับ)</span></label>
          <div style="display:flex; gap:8px;">
            <input id="signMpDetailImg" type="file" accept="image/*" class="field-input" style="flex:1; min-width:0;" />
            <button type="button" id="signMpDetailImgClear" class="icon-btn ghost">ลบ</button>
          </div>
        </div>

        <div class="admin-card" style="padding:16px; margin-top:12px;">
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" id="signDlPng" class="icon-btn">ดาวน์โหลด PNG</button>
            <button type="button" id="signDlJpg" class="icon-btn">ดาวน์โหลด JPG</button>
          </div>
          <p id="signStatus" class="muted" style="font-size:12.5px; margin:10px 0 0; line-height:1.6; min-height:18px;"></p>
          <p class="muted" style="font-size:12px; margin:6px 0 0; line-height:1.6;">ริชเมนู LINE รับไฟล์ JPG/PNG ไม่เกิน 1MB ปุ่ม JPG จะลดคุณภาพให้พอดีเกณฑ์ให้อัตโนมัติ · ค่าที่แก้ไว้จำในเบราว์เซอร์นี้</p>
        </div>
      </div>

      <div style="flex:2 1 360px; min-width:300px;">
        <canvas id="signCanvas" style="width:100%; max-width:820px; height:auto; border-radius:14px; border:1px solid var(--line); background:#0a0b14;"></canvas>
      </div>
    </div>
  `;

  // ตั้งค่าเริ่มต้นของช่องกรอก
  $("signRmTheme").value = rm.theme;
  $("signRmSize").value = rm.size;
  $("signRmFill").checked = rm.fill !== false;
  root.querySelectorAll(".sign-cell-card").forEach((card, i) => {
    card.querySelector(".sign-cell-icon").value = rm.cells[i].icon;
  });
  $("signMpTheme").value = mp.theme;
  $("signMpTitle").value = mp.title;
  $("signMpSub").value = mp.subtitle;
  $("signMpDetails").value = mp.details;
  $("signMpFooter").value = mp.footer ?? "STARLIVE OFFICIAL";
  $("signMpLineId").value = mp.lineId || "";
  $("signPayTheme").value = pay.theme;
  $("signPayLine1").value = pay.line1;
  $("signPayLine2").value = pay.line2;
  $("signPayName").value = pay.name;
  $("signPayAccent").value = pay.accent;
}

// ---------- โปสเตอร์รวม: รายการงาน ----------
function mpLastDate(ev) {
  const t = (ev.event_days || []).map((d) => new Date(d.event_date).getTime()).filter((n) => !isNaN(n));
  return t.length ? Math.max(...t) : -Infinity;
}

async function loadMpEvents() {
  const list = $("signMpList");
  if (list) list.innerHTML = '<p class="muted" style="font-size:12.5px; margin:0;">กำลังโหลดรายการงาน...</p>';
  const { data, error } = await supabase
    .from("events")
    .select("id, title, banner_url, event_days(event_date), ticket_packages(num_days, price)");
  if (error) {
    if (list) list.innerHTML = `<p class="error-text">โหลดรายการงานไม่สำเร็จ: ${esc(error.message)}</p>`;
    return;
  }
  mpEvents = [...(data || [])].sort((a, b) => mpLastDate(b) - mpLastDate(a));
  mpLoaded = true;
  // ตัดงานที่ถูกลบออกจากระบบแล้วออกจากรายการที่จำไว้
  mp.picks = mp.picks.filter((p) => mpEvents.some((e) => String(e.id) === String(p.id))).slice(0, MP_MAX);
  renderMpList();
  refresh();
}

function renderMpList() {
  const list = $("signMpList");
  const sel = $("signMpAddSelect");
  if (!list || !sel) return;
  const picked = new Set(mp.picks.map((p) => String(p.id)));
  const rest = mpEvents.filter((e) => !picked.has(String(e.id)));
  sel.innerHTML = rest.length
    ? rest.map((e) => `<option value="${esc(e.id)}">${esc(e.title)}</option>`).join("")
    : `<option value="">— ไม่มีงานให้เพิ่มแล้ว —</option>`;
  const full = mp.picks.length >= MP_MAX;
  $("signMpAddBtn").disabled = full || rest.length === 0;
  $("signMpCount").textContent = `(${mp.picks.length}/${MP_MAX})`;

  list.innerHTML = mp.picks
    .map((p, i) => {
      const ev = mpEvents.find((e) => String(e.id) === String(p.id));
      if (!ev) return "";
      const priceText = p.priceText !== undefined ? p.priceText : mpAutoPriceLines(ev).join("\n");
      return `
      <div class="sign-cell-card" data-mp="${i}">
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:6px;">
          <strong style="font-size:13px; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${i + 1}. ${esc(ev.title)}</strong>
          <button type="button" class="icon-btn ghost" data-act="up" style="padding:2px 8px;" ${i === 0 ? "disabled" : ""} aria-label="เลื่อนขึ้น">▲</button>
          <button type="button" class="icon-btn ghost" data-act="down" style="padding:2px 8px;" ${i === mp.picks.length - 1 ? "disabled" : ""} aria-label="เลื่อนลง">▼</button>
          <button type="button" class="icon-btn ghost" data-act="del" style="padding:2px 8px; color:var(--crimson);" aria-label="เอาออก">✕</button>
        </div>
        <textarea class="field-input mp-price" rows="2" maxlength="120" placeholder="ราคา (1 บรรทัด = 1 ป้าย เช่น 1 วัน 299฿)" style="resize:vertical;">${esc(priceText)}</textarea>
        <button type="button" class="icon-btn ghost" data-act="reset" style="margin-top:6px; font-size:12px; padding:3px 10px;">ใช้ราคาจากระบบ</button>
      </div>`;
    })
    .join("");
}

function bindMulti() {
  $("signMpTheme").addEventListener("change", (e) => {
    mp.theme = e.target.value;
    refresh();
  });
  $("signMpTitle").addEventListener("input", (e) => {
    mp.title = e.target.value;
    refresh();
  });
  $("signMpSub").addEventListener("input", (e) => {
    mp.subtitle = e.target.value;
    refresh();
  });
  $("signMpFooter").addEventListener("input", (e) => {
    mp.footer = e.target.value;
    refresh();
  });
  $("signMpLineId").addEventListener("input", (e) => {
    mp.lineId = e.target.value;
    refresh();
  });
  $("signMpLogo").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      mp.logo = await fileToDataUrl(f, 400, "image/png");
      refresh();
    } catch {}
  });
  $("signMpLogoClear").addEventListener("click", () => {
    mp.logo = "";
    $("signMpLogo").value = "";
    refresh();
  });
  $("signMpDetailImg").addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      mp.detailImg = await fileToDataUrl(f, 700, "image/jpeg", 0.85);
      refresh();
    } catch {}
  });
  $("signMpDetailImgClear").addEventListener("click", () => {
    mp.detailImg = "";
    $("signMpDetailImg").value = "";
    refresh();
  });
  $("signMpDetails").addEventListener("input", (e) => {
    mp.details = e.target.value;
    refresh();
  });
  $("signMpAddBtn").addEventListener("click", () => {
    const id = $("signMpAddSelect").value;
    if (!id || mp.picks.length >= MP_MAX) return;
    mp.picks.push({ id });
    renderMpList();
    refresh();
  });
  const list = $("signMpList");
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    const card = e.target.closest("[data-mp]");
    if (!b || !card) return;
    const i = Number(card.dataset.mp);
    const act = b.dataset.act;
    if (act === "del") mp.picks.splice(i, 1);
    else if (act === "up" && i > 0) [mp.picks[i - 1], mp.picks[i]] = [mp.picks[i], mp.picks[i - 1]];
    else if (act === "down" && i < mp.picks.length - 1) [mp.picks[i + 1], mp.picks[i]] = [mp.picks[i], mp.picks[i + 1]];
    else if (act === "reset") delete mp.picks[i].priceText;
    renderMpList();
    refresh();
  });
  list.addEventListener("input", (e) => {
    const ta = e.target.closest(".mp-price");
    const card = e.target.closest("[data-mp]");
    if (!ta || !card) return;
    mp.picks[Number(card.dataset.mp)].priceText = ta.value;
    refresh();
  });
}

// ---------- เลือกสีช่อง (แทนตัวเลือกสีของเบราว์เซอร์) ----------
function updateAllSameSwatch() {
  const sw = $("signRmAllSwatch");
  if (sw) sw.style.background = rm.lastColor || rm.cells[0].color;
}

function setCellColor(root, i, color, { remember = true } = {}) {
  rm.cells[i].color = color;
  if (remember) rm.lastColor = color;
  const card = root.querySelector(`.sign-cell-card[data-cell="${i}"]`);
  if (card) {
    card.querySelector(".sign-cell-swatch").style.background = color;
    card.querySelector(".sign-cell-color").value = color;
  }
  updateAllSameSwatch();
  refresh();
}

function closeColorPopover() {
  document.getElementById("signColorPop")?.remove();
}

function openColorPopover(root, card, i) {
  closeColorPopover();
  const current = rm.cells[i].color;
  const pop = document.createElement("div");
  pop.id = "signColorPop";
  pop.style.cssText =
    "position:fixed; z-index:100002; background:#1a1730; border:1px solid var(--line); border-radius:14px; padding:12px; box-shadow:0 12px 40px rgba(0,0,0,0.55); width:232px;";
  pop.innerHTML = `
    <div style="display:grid; grid-template-columns:repeat(8,1fr); gap:8px;">
      ${COLOR_PRESETS.map(
        (c) =>
          `<button type="button" data-c="${c}" aria-label="${c}" style="width:22px; height:22px; border-radius:50%; background:${c}; cursor:pointer; padding:0; border:2px solid ${c.toLowerCase() === String(current).toLowerCase() ? "#fff" : "rgba(255,255,255,0.18)"};"></button>`
      ).join("")}
    </div>
    <button type="button" id="signColorCustom" class="icon-btn ghost" style="width:100%; margin-top:10px; font-size:12.5px;">เลือกสีเอง…</button>
  `;
  document.body.appendChild(pop);

  const r = card.querySelector(".sign-cell-swatch").getBoundingClientRect();
  const left = Math.max(8, Math.min(window.innerWidth - 240, r.right - 232));
  const below = r.bottom + 8;
  const top = below + 150 > window.innerHeight ? Math.max(8, r.top - 150) : below;
  pop.style.left = left + "px";
  pop.style.top = top + "px";

  pop.addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.target.closest("[data-c]");
    if (b) {
      setCellColor(root, i, b.dataset.c);
      closeColorPopover();
    }
  });
  pop.querySelector("#signColorCustom").addEventListener("click", () => {
    closeColorPopover();
    card.querySelector(".sign-cell-color").click();
  });
  setTimeout(() => {
    document.addEventListener("click", closeColorPopover, { once: true });
    window.addEventListener("scroll", closeColorPopover, { once: true, passive: true });
  }, 0);
}

function bindUI(root) {
  // สลับหัวข้อย่อย
  $("signSubTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".sign-sub");
    if (!b) return;
    mode = b.dataset.sub === "pay" ? "pay" : b.dataset.sub === "multi" ? "multi" : "richmenu";
    root.querySelectorAll(".sign-sub").forEach((x) => {
      x.classList.toggle("active", x === b);
      x.classList.toggle("ghost", x !== b);
    });
    $("signPanelRich").style.display = mode === "richmenu" ? "block" : "none";
    $("signPanelPay").style.display = mode === "pay" ? "block" : "none";
    $("signPanelMulti").style.display = mode === "multi" ? "block" : "none";
    if (mode === "multi" && !mpLoaded) loadMpEvents();
    $("signStatus").textContent = "";
    refresh();
  });

  // ริชเมนู
  $("signRmTheme").addEventListener("change", (e) => {
    rm.theme = e.target.value;
    refresh();
  });
  $("signRmFill").addEventListener("change", (e) => {
    rm.fill = e.target.checked;
    refresh();
  });
  $("signRmSize").addEventListener("change", (e) => {
    rm.size = e.target.value;
    saveLSSoon();
  });
  root.querySelectorAll(".sign-cell-card").forEach((card) => {
    const i = Number(card.dataset.cell);
    card.querySelector(".sign-cell-title").addEventListener("input", (e) => {
      rm.cells[i].title = e.target.value;
      refresh();
    });
    card.querySelector(".sign-cell-sub").addEventListener("input", (e) => {
      rm.cells[i].sub = e.target.value;
      refresh();
    });
    card.querySelector(".sign-cell-swatch").addEventListener("click", (e) => {
      e.stopPropagation();
      openColorPopover(root, card, i);
    });
    card.querySelector(".sign-cell-color").addEventListener("input", (e) => {
      setCellColor(root, i, e.target.value);
    });
    card.querySelector(".sign-cell-icon").addEventListener("change", (e) => {
      rm.cells[i].icon = e.target.value;
      refresh();
    });
  });
  updateAllSameSwatch();
  $("signRmAllSame").addEventListener("click", () => {
    const c = rm.lastColor || rm.cells[0].color;
    rm.cells.forEach((_, i) => setCellColor(root, i, c, { remember: false }));
  });
  $("signRmReset").addEventListener("click", () => {
    if (!confirm("คืนค่าริชเมนูเป็นค่าเริ่มต้น (ข้อความ สี ไอคอนทุกช่อง) ใช่ไหม?")) return;
    rm.cells = DEFAULT_CELLS.map((c) => ({ ...c }));
    rm.theme = "st";
    rm.fill = true;
    rm.lastColor = null;
    buildUI(root);
    bindUI(root);
    mode = "richmenu";
    refresh();
  });

  // โปสเตอร์รวม
  bindMulti();

  // ป้ายชำระเงิน
  $("signPayTheme").addEventListener("change", (e) => {
    pay.theme = e.target.value;
    pay.accent = THEME_ACCENT[pay.theme] || pay.accent; // สีหัวข้อเปลี่ยนตามธีม (ปรับเองต่อได้)
    $("signPayAccent").value = pay.accent;
    refresh();
  });
  $("signPayLine1").addEventListener("input", (e) => {
    pay.line1 = e.target.value;
    refresh();
  });
  $("signPayLine2").addEventListener("input", (e) => {
    pay.line2 = e.target.value;
    refresh();
  });
  $("signPayName").addEventListener("input", (e) => {
    pay.name = e.target.value;
    refresh();
  });
  $("signPayAccent").addEventListener("input", (e) => {
    pay.accent = e.target.value;
    refresh();
  });
  $("signPayQr").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setQr(String(reader.result));
    reader.readAsDataURL(f);
  });
  $("signPayQrClear").addEventListener("click", () => {
    $("signPayQr").value = "";
    setQr("");
  });

  $("signDlPng").addEventListener("click", () => download("png"));
  $("signDlJpg").addEventListener("click", () => download("jpg"));
}

function setQr(dataUrl) {
  pay.qr = dataUrl;
  if (!dataUrl) {
    qrImage = null;
    refresh();
    return;
  }
  const im = new Image();
  im.onload = () => {
    qrImage = im;
    refresh();
  };
  im.onerror = () => {
    qrImage = null;
    pay.qr = "";
    $("signStatus").textContent = "อ่านไฟล์รูปคิวอาร์ไม่สำเร็จ";
    refresh();
  };
  im.src = dataUrl;
}

let rafId = 0;
function refresh() {
  saveLSSoon();
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(() => {
    const canvas = $("signCanvas");
    if (!canvas) return;
    if (mode === "richmenu") renderRichMenu(canvas, 1250, 843);
    else if (mode === "multi") renderMulti(canvas, MP_W, MP_H);
    else renderPay(canvas, PAY_W, PAY_H);
  });
}

export async function initSignDesigner() {
  const root = $("signsTab");
  if (!root) return;
  if (!inited) {
    inited = true;
    root.innerHTML = '<p class="muted" style="padding:30px 0; text-align:center;">กำลังเตรียมตัวออกแบบ...</p>';
    try {
      await Promise.all([
        document.fonts.load("800 40px Prompt", "ก STARLIVE"),
        document.fonts.load("700 40px Prompt", "ก"),
        document.fonts.load("500 24px Prompt", "ก"),
        document.fonts.load("500 24px Sarabun", "ก"),
      ]);
      await document.fonts.ready;
    } catch {}
    buildUI(root);
    bindUI(root);
    if (pay.qr) setQr(pay.qr);
  }
  refresh();
}
