// ============================================================
// ระบบ "ออกแบบป้าย" (หน้าแอดมินร้านไลฟ์)
//   - ริชเมนู: ป้าย 6 ช่องสำหรับ LINE Official (3 คอลัมน์ × 2 แถว) แก้ข้อความ/สี/ไอคอนทีละช่อง
//   - ช่องทางชำระเงิน: ป้ายสำหรับส่งในไลน์ มีช่องอัปโหลดคิวอาร์ + ชื่อบัญชี
//   ทั้งสองแบบเลือกธีมพื้นหลังได้ 6 ธีมเดียวกับระบบสร้างโปสเตอร์ และไอคอน/ภาพประกอบเป็น SVG ใน icons.js
// ============================================================
import { POSTER_THEMES, drawBackground } from "./poster.js";
import { SIGN_ICON_LIST, signIconSvg, signIllustrationSvg } from "./icons.js";

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

let inited = false;
let mode = "richmenu";
let rm = loadLS(LS_RM, null) || { theme: "st", size: "large", cells: DEFAULT_CELLS.map((c) => ({ ...c })) };
let pay = loadLS(LS_PAY, null) || { theme: "st", accent: THEME_ACCENT.st, line1: "ช่องทาง", line2: "ชำระเงิน", name: "", qr: "" };
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
          <input type="color" class="sign-cell-color" value="${esc(c.color)}" title="สีช่อง" style="width:44px; height:30px; padding:0; border:1px solid var(--line); border-radius:8px; background:none; cursor:pointer;" />
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
  root.querySelectorAll(".sign-cell-card").forEach((card, i) => {
    card.querySelector(".sign-cell-icon").value = rm.cells[i].icon;
  });
  $("signPayTheme").value = pay.theme;
  $("signPayLine1").value = pay.line1;
  $("signPayLine2").value = pay.line2;
  $("signPayName").value = pay.name;
  $("signPayAccent").value = pay.accent;
}

function bindUI(root) {
  // สลับหัวข้อย่อย
  $("signSubTabs").addEventListener("click", (e) => {
    const b = e.target.closest(".sign-sub");
    if (!b) return;
    mode = b.dataset.sub === "pay" ? "pay" : "richmenu";
    root.querySelectorAll(".sign-sub").forEach((x) => {
      x.classList.toggle("active", x === b);
      x.classList.toggle("ghost", x !== b);
    });
    $("signPanelRich").style.display = mode === "richmenu" ? "block" : "none";
    $("signPanelPay").style.display = mode === "pay" ? "block" : "none";
    $("signStatus").textContent = "";
    refresh();
  });

  // ริชเมนู
  $("signRmTheme").addEventListener("change", (e) => {
    rm.theme = e.target.value;
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
    card.querySelector(".sign-cell-color").addEventListener("input", (e) => {
      rm.cells[i].color = e.target.value;
      refresh();
    });
    card.querySelector(".sign-cell-icon").addEventListener("change", (e) => {
      rm.cells[i].icon = e.target.value;
      refresh();
    });
  });
  $("signRmReset").addEventListener("click", () => {
    if (!confirm("คืนค่าริชเมนูเป็นค่าเริ่มต้น (ข้อความ สี ไอคอนทุกช่อง) ใช่ไหม?")) return;
    rm.cells = DEFAULT_CELLS.map((c) => ({ ...c }));
    rm.theme = "st";
    buildUI(root);
    bindUI(root);
    mode = "richmenu";
    refresh();
  });

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
