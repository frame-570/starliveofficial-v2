import { supabase } from "./supabaseClient.js";
import { renderHeaderAuth, getSession } from "./auth.js";

renderHeaderAuth();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const baht = (n) => `${Number(n || 0).toLocaleString("th-TH")}฿`;
const PAY = { pending_payment: "รอชำระเงิน", verifying: "รอตรวจสอบสลิป", paid: "ชำระเงินสำเร็จ", cancelled: "ยกเลิก" };
const SHIP = { pending: "รอดำเนินการ", preparing: "เตรียมจัดส่ง", shipped: "จัดส่งแล้ว", completed: "สำเร็จ" };

const ICON = {
  cart: `<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>`,
  sparkle: `<svg class="cs-ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z"/></svg>`,
  flame: `<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.4 1-3 0 2.2 1.1 3.5 2.5 3.5z"/></svg>`,
  tag: `<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/></svg>`,
  truck: `<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  check: `<svg class="cs-big-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="8 12.5 11 15.5 16 9"/></svg>`,
};

let session = await getSession();
let products = [], categories = [], promos = [], settings = { shipping_fee: 0, free_shipping_min: null };
let cart = new Map(); // product_id -> qty
let filter = "all", search = "";

function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.style.display = "block";
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = "none"), 2200);
}
function errText(e) {
  const m = e?.message || "";
  if (m.startsWith("out_of_stock:")) return `สินค้า "${m.split(":")[1]}" มีไม่พอแล้ว กรุณาปรับจำนวนในตะกร้า`;
  if (m.startsWith("inactive:")) return `สินค้า "${m.split(":")[1]}" ปิดการขายแล้ว กรุณาลบออกจากตะกร้า`;
  if (m.includes("cart_empty")) return "ตะกร้าว่างเปล่า";
  if (m.includes("bad_address")) return "กรุณากรอกข้อมูลจัดส่งให้ครบ";
  return "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง";
}
const remaining = (p) => p.stock_total - p.stock_sold;
function promoInfo(p) {
  const now = Date.now(); let best = { price: Number(p.price), label: null };
  if (p.sale_price != null && Number(p.sale_price) < best.price) best = { price: Number(p.sale_price), label: p.promo_label || "โปรโมชั่น" };
  for (const pr of promos) {
    if (pr.starts_at && new Date(pr.starts_at) > now) continue;
    if (pr.ends_at && new Date(pr.ends_at) < now) continue;
    const hit = (!pr.product_id && !pr.category_id) || pr.product_id === p.id || (pr.category_id && pr.category_id === p.category_id);
    if (!hit) continue;
    const v = Number(pr.discount_value);
    const price = Math.max(0, Math.round((pr.discount_type === "percent" ? p.price - (p.price * v) / 100 : p.price - v) * 100) / 100);
    if (price < best.price) best = { price, label: pr.name };
  }
  return best;
}
const unitPrice = (p) => promoInfo(p).price;

// ---------- Layer (ตะกร้า / ฟอร์ม / ออเดอร์) ----------
function openLayer(html, center = false) {
  $("layer").className = "cs-layer" + (center ? " center" : "");
  $("layer").style.display = "flex";
  $("panel").innerHTML = `<button class="cs-x" id="xBtn" type="button" aria-label="ปิด">✕</button>${html}`;
  $("xBtn").onclick = closeLayer;
}
function closeLayer() { $("layer").style.display = "none"; }
$("layer").addEventListener("click", (e) => { if (e.target === $("layer")) closeLayer(); });

// ---------- โหลดข้อมูล ----------
async function loadAll() {
  const [c, p, s, pm] = await Promise.all([
    supabase.from("card_categories").select("*").order("sort_order").order("name"),
    supabase.from("card_products").select("*").eq("is_active", true).order("created_at", { ascending: false }),
    supabase.from("card_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("card_promotions").select("*").eq("is_active", true),
  ]);
  promos = pm.data || [];
  categories = c.data || []; products = p.data || []; if (s.data) settings = s.data;
  await loadCart();
  renderChips(); renderGrid();
}
async function loadCart() {
  cart = new Map();
  if (session) {
    const { data } = await supabase.from("card_cart").select("product_id, qty");
    (data || []).forEach((r) => cart.set(r.product_id, r.qty));
  }
  updateBadge();
}
function updateBadge() {
  const n = [...cart.values()].reduce((a, b) => a + b, 0);
  $("cartBadge").textContent = n; $("cartBadge").style.display = n ? "flex" : "none";
}

// ---------- หน้าร้าน ----------
function renderChips() {
  const chips = [["all", "ทั้งหมด", ""], ["new", "สินค้าใหม่", ICON.sparkle], ["best", "ขายดี", ICON.flame], ["promo", "โปรโมชั่น", ICON.tag], ...categories.map((c) => [c.id, c.name, ""])];
  $("chips").innerHTML = chips.map(([k, l, ic]) => `<button class="cs-chip ${filter === k ? "on" : ""}" data-k="${esc(k)}" type="button">${ic}${esc(l)}</button>`).join("");
  $("chips").querySelectorAll(".cs-chip").forEach((b) => (b.onclick = () => { filter = b.dataset.k; renderChips(); renderGrid(); }));
}
function renderGrid() {
  const q = search.toLowerCase();
  const list = products.filter((p) => {
    if (q && !`${p.name} ${p.serial_no || ""}`.toLowerCase().includes(q)) return false;
    if (filter === "new") return p.is_new;
    if (filter === "best") return p.is_bestseller;
    if (filter === "promo") return promoInfo(p).price < Number(p.price);
    if (filter !== "all") return p.category_id === filter;
    return true;
  });
  $("empty").style.display = list.length ? "none" : "block";
  $("grid").innerHTML = list.map((p) => {
    const left = remaining(p), out = left <= 0, info = promoInfo(p), onSale = info.price < Number(p.price);
    const stockTxt = out ? "สินค้าหมด" : p.product_type === "unique" ? `การ์ดเฉพาะใบ${p.serial_no ? " · " + esc(p.serial_no) : ""}` : `คงเหลือ ${left} ชิ้น`;
    return `<article class="cs-card">
      <div class="cs-img">${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" />` : ""}
        <div class="cs-tags">${p.is_new ? `<span class="cs-tag">${ICON.sparkle}ใหม่</span>` : ""}${p.is_bestseller ? `<span class="cs-tag hot">${ICON.flame}ขายดี</span>` : ""}${onSale ? `<span class="cs-tag hot">${ICON.tag}${esc(info.label || "โปรโมชั่น")}</span>` : ""}</div></div>
      <div class="cs-body"><div class="cs-name">${esc(p.name)}</div>
        <div class="cs-price">${baht(info.price)}${onSale ? `<s>${baht(p.price)}</s>` : ""}</div>
        <div class="cs-stock ${!out && left <= 3 ? "low" : ""}">${stockTxt}</div>
        <button class="cs-add" data-id="${p.id}" type="button" ${out ? "disabled" : ""}>${out ? "สินค้าหมด" : "เพิ่มลงตะกร้า"}</button></div></article>`;
  }).join("");
  $("grid").querySelectorAll(".cs-add").forEach((b) => (b.onclick = () => addToCart(b.dataset.id, 1)));
}
$("searchInput").addEventListener("input", (e) => { search = e.target.value.trim(); renderGrid(); });
$("navShop").onclick = closeLayer;

// ---------- ตะกร้า ----------
async function addToCart(id, delta) {
  if (!session) { location.href = `./login.html?redirect=${encodeURIComponent(location.href)}`; return; }
  const p = products.find((x) => x.id === id); if (!p) return;
  const next = Math.min((cart.get(id) || 0) + delta, remaining(p));
  if (next <= 0) { cart.delete(id); await supabase.from("card_cart").delete().eq("product_id", id); }
  else {
    if (next === cart.get(id) && delta > 0) { toast("เพิ่มไม่ได้ จำนวนสินค้าไม่พอ"); return; }
    cart.set(id, next);
    await supabase.from("card_cart").upsert({ user_id: session.user.id, product_id: id, qty: next });
    if (delta > 0 && $("layer").style.display !== "flex") toast("เพิ่มลงตะกร้าแล้ว");
  }
  updateBadge(); if ($("layer").dataset.view === "cart") showCart();
}
function totals() {
  let sub = 0;
  for (const [id, q] of cart) { const p = products.find((x) => x.id === id); if (p) sub += unitPrice(p) * q; }
  const free = settings.free_shipping_min != null && sub >= Number(settings.free_shipping_min);
  const ship = !cart.size || free ? 0 : Number(settings.shipping_fee);
  return { sub, ship, total: sub + ship };
}
function showCart() {
  const items = [...cart].map(([id, q]) => [products.find((x) => x.id === id), q]).filter(([p]) => p);
  const t = totals();
  openLayer(`<h2 class="display" style="margin:0 0 6px">${ICON.cart} ตะกร้าสินค้า</h2>
    ${items.length ? items.map(([p, q]) => `<div class="cs-row">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" />` : "<img alt='' />"}
      <div style="flex:1"><div style="font:600 14px Prompt">${esc(p.name)}</div><div class="muted" style="font-size:12px">${baht(unitPrice(p))} · เหลือ ${remaining(p)}</div></div>
      <div class="cs-qty"><button data-d="-1" data-id="${p.id}" type="button">−</button><b>${q}</b><button data-d="1" data-id="${p.id}" type="button">+</button></div>
      <button data-rm="${p.id}" type="button" style="background:none;border:0;color:var(--crimson);cursor:pointer">ลบ</button></div>`).join("") : `<p class="muted" style="padding:40px 0;text-align:center">ตะกร้าว่างเปล่า</p>`}
    <div style="margin-top:14px"><div class="cs-sum"><span>ค่าสินค้า</span><span>${baht(t.sub)}</span></div>
    <div class="cs-sum"><span>ค่าจัดส่ง</span><span>${t.ship ? baht(t.ship) : cart.size ? "ฟรี" : "-"}</span></div>
    ${settings.free_shipping_min != null && t.ship > 0 ? `<p class="muted" style="font-size:12px;margin:0">ซื้อครบ ${baht(settings.free_shipping_min)} ส่งฟรี</p>` : ""}
    <div class="cs-sum total"><span>ยอดรวม</span><span>${baht(t.total)}</span></div></div>
    <button class="btn-marquee" id="toCheckout" type="button" ${items.length ? "" : "disabled"} style="width:100%;margin-top:14px">ดำเนินการสั่งซื้อ</button>`);
  $("layer").dataset.view = "cart";
  $("panel").querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => addToCart(b.dataset.id, Number(b.dataset.d))));
  $("panel").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => {
    cart.delete(b.dataset.rm); await supabase.from("card_cart").delete().eq("product_id", b.dataset.rm); updateBadge(); showCart();
  }));
  if (items.length) $("toCheckout").onclick = showCheckout;
}
$("cartBtn").onclick = () => { if (!session) { location.href = `./login.html?redirect=${encodeURIComponent(location.href)}`; return; } showCart(); };

// ---------- ข้อมูลจัดส่ง + สร้างออเดอร์ ----------
async function showCheckout() {
  const { data: a } = await supabase.from("card_addresses").select("*").eq("user_id", session.user.id).order("updated_at", { ascending: false }).limit(1);
  const ad = a?.[0] || {}; const t = totals();
  const f = (id, label, val, cls = "") => `<div class="${cls}"><label class="field-label" for="${id}">${label}</label><input id="${id}" class="field-input" value="${esc(val || "")}" /></div>`;
  openLayer(`<h2 class="display" style="margin:0 0 12px">ข้อมูลจัดส่ง</h2>
    <div class="cs-form">${f("aName", "ชื่อผู้รับ", ad.recipient_name, "full")}${f("aPhone", "เบอร์โทรศัพท์", ad.phone, "full")}${f("aAddr", "ที่อยู่ (บ้านเลขที่ ถนน)", ad.address, "full")}
    ${f("aSub", "ตำบล/แขวง", ad.subdistrict)}${f("aDist", "อำเภอ/เขต", ad.district)}${f("aProv", "จังหวัด", ad.province)}${f("aZip", "รหัสไปรษณีย์", ad.postcode)}</div>
    <div style="margin-top:14px"><div class="cs-sum"><span>ค่าสินค้า</span><span>${baht(t.sub)}</span></div><div class="cs-sum"><span>ค่าจัดส่ง</span><span>${t.ship ? baht(t.ship) : "ฟรี"}</span></div>
    <div class="cs-sum total"><span>ยอดชำระ</span><span>${baht(t.total)}</span></div></div>
    <p class="error-text" id="coErr"></p>
    <button class="btn-marquee" id="placeBtn" type="button" style="width:100%">ยืนยันและไปชำระเงิน</button>
    <button class="icon-btn ghost" id="backCart" type="button" style="width:100%;margin-top:8px">← กลับไปตะกร้า</button>`);
  $("layer").dataset.view = "checkout";
  $("backCart").onclick = showCart;
  $("placeBtn").onclick = async () => {
    const addr = { name: $("aName").value, phone: $("aPhone").value, address: $("aAddr").value, subdistrict: $("aSub").value, district: $("aDist").value, province: $("aProv").value, postcode: $("aZip").value };
    $("placeBtn").disabled = true; $("coErr").textContent = "";
    const { data: orderId, error } = await supabase.rpc("card_place_order", { p_address: addr });
    if (error) { $("coErr").textContent = errText(error); $("placeBtn").disabled = false; await loadAll(); return; }
    const row = { user_id: session.user.id, recipient_name: addr.name.trim(), phone: addr.phone.trim(), address: addr.address.trim(), province: addr.province.trim(), district: addr.district.trim(), subdistrict: addr.subdistrict.trim(), postcode: addr.postcode.trim(), updated_at: new Date().toISOString() };
    if (ad.id) await supabase.from("card_addresses").update(row).eq("id", ad.id); else await supabase.from("card_addresses").insert(row);
    await loadAll(); showPayment(orderId);
  };
}

// ---------- ชำระเงิน + อัปโหลดสลิป ----------
async function showPayment(orderId) {
  const { data: o } = await supabase.from("card_orders").select("*").eq("id", orderId).maybeSingle();
  if (!o) { toast("ไม่พบคำสั่งซื้อ"); return; }
  const { data: sl } = await supabase.from("app_settings").select("promptpay_id, promptpay_name").limit(1);
  const s = sl?.[0];
  openLayer(`<h2 class="display" style="margin:0 0 4px">ชำระเงิน</h2><p class="muted" style="margin:0 0 10px">เลขที่คำสั่งซื้อ ${esc(o.order_number)}</p>
    <div style="text-align:center"><div style="font:800 28px Prompt;color:var(--amber)">${baht(o.total)}</div>
    ${s?.promptpay_id ? `<img id="qrImg" alt="QR พร้อมเพย์" style="width:240px;max-width:100%;background:#fff;border-radius:12px;padding:8px;margin:10px 0" /><div class="muted">${esc(s.promptpay_name || "")}</div>` : `<p class="error-text">ยังไม่ได้ตั้งค่าเลขพร้อมเพย์ กรุณาติดต่อแอดมิน</p>`}</div>
    <div class="slip-dropzone" id="drop" style="margin-top:14px;cursor:pointer;border:2px dashed var(--line);border-radius:14px;padding:18px;text-align:center"><img id="slipPrev" alt="" style="display:none;max-width:100%;max-height:220px;margin:0 auto 8px;border-radius:10px" /><span id="dropTxt">แตะเพื่อแนบสลิปการโอนเงิน</span></div>
    <input type="file" id="slipFile" accept="image/*" style="display:none" /><p class="error-text" id="slipErr"></p>
    <button class="btn-marquee" id="sendSlip" type="button" disabled style="width:100%">ส่งสลิปให้แอดมินตรวจสอบ</button>
    <button class="icon-btn ghost" id="later" type="button" style="width:100%;margin-top:8px">ชำระภายหลัง (ดูได้ที่ "คำสั่งซื้อของฉัน")</button>`);
  $("later").onclick = closeLayer;
  if (s?.promptpay_id) {
    const [{ default: pp }, { default: QR }] = await Promise.all([import("https://cdn.jsdelivr.net/npm/promptpay-qr@0.5.0/+esm"), import("https://esm.sh/qrcode@1.5.3")]);
    $("qrImg").src = await QR.toDataURL(pp(s.promptpay_id, { amount: Number(o.total) }), { width: 280, margin: 1 });
  }
  let file = null;
  $("drop").onclick = () => $("slipFile").click();
  $("slipFile").onchange = () => {
    const f = $("slipFile").files[0]; $("slipErr").textContent = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { $("slipErr").textContent = "กรุณาเลือกไฟล์รูปภาพเท่านั้น"; return; }
    if (f.size > 4 * 1024 * 1024) { $("slipErr").textContent = "ไฟล์รูปมีขนาดใหญ่เกิน 4MB"; return; }
    file = f; $("slipPrev").src = URL.createObjectURL(f); $("slipPrev").style.display = "block"; $("dropTxt").textContent = "แตะเพื่อเปลี่ยนรูป"; $("sendSlip").disabled = false;
  };
  $("sendSlip").onclick = async () => {
    $("sendSlip").disabled = true; $("sendSlip").textContent = "กำลังส่ง...";
    const path = `${session.user.id}/${orderId}-${Date.now()}.${(file.name.split(".").pop() || "jpg").toLowerCase()}`;
    const up = await supabase.storage.from("card-slips").upload(path, file, { upsert: false });
    const rpc = up.error ? { error: up.error } : await supabase.rpc("card_submit_slip", { p_order: orderId, p_path: path });
    if (rpc.error) { $("slipErr").textContent = "ส่งสลิปไม่สำเร็จ กรุณาลองใหม่"; $("sendSlip").disabled = false; $("sendSlip").textContent = "ส่งสลิปให้แอดมินตรวจสอบ"; return; }
    openLayer(`<div style="text-align:center;padding:30px 0">${ICON.check}<h2 class="display">ส่งสลิปเรียบร้อย</h2>
      <p class="muted">แอดมินกำลังตรวจสอบการชำระเงิน คุณติดตามสถานะได้ที่ "คำสั่งซื้อของฉัน"</p>
      <button class="btn-marquee" id="seeOrders" type="button">ดูคำสั่งซื้อของฉัน</button></div>`, true);
    $("seeOrders").onclick = showOrders;
  };
}

// ---------- คำสั่งซื้อของฉัน ----------
async function showOrders() {
  if (!session) { location.href = `./login.html?redirect=${encodeURIComponent(location.href)}`; return; }
  const { data } = await supabase.from("card_orders").select("*, card_order_items(*), card_shipments(*)").order("created_at", { ascending: false }).limit(50);
  openLayer(`<h2 class="display" style="margin:0 0 10px">คำสั่งซื้อ CARD SHOP ของฉัน</h2>
    ${(data || []).map((o) => { const sh = o.card_shipments;
      return `<div style="border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>${esc(o.order_number)}</b><span class="muted" style="font-size:12px">${new Date(o.created_at).toLocaleString("th-TH")}</span></div>
      <div style="margin:6px 0"><span class="cs-st">${PAY[o.status]}</span> ${o.status === "paid" ? `<span class="cs-st">${SHIP[o.shipping_status]}</span>` : ""}</div>
      <div class="muted" style="font-size:13px">${o.card_order_items.map((i) => `${esc(i.product_name)} × ${i.qty}`).join("<br>")}</div>
      <div class="cs-sum total" style="font-size:15px"><span>ยอดรวม</span><span>${baht(o.total)}</span></div>
      ${sh?.tracking_no ? `<div style="font-size:13px">${ICON.truck} ${esc(sh.carrier || "")} · เลข Tracking: <b>${esc(sh.tracking_no)}</b></div>` : ""}
      ${["pending_payment", "verifying"].includes(o.status) ? `<div style="margin-top:8px;display:flex;gap:8px"><button class="icon-btn" data-pay="${o.id}" type="button">${o.status === "verifying" ? "ส่งสลิปใหม่" : "ชำระเงิน / แนบสลิป"}</button>${o.status === "pending_payment" ? `<button class="icon-btn ghost" data-cancel="${o.id}" type="button">ยกเลิก</button>` : ""}</div>` : ""}</div>`; }).join("") || `<p class="muted" style="text-align:center;padding:40px 0">ยังไม่มีคำสั่งซื้อ</p>`}`);
  $("panel").querySelectorAll("[data-pay]").forEach((b) => (b.onclick = () => showPayment(b.dataset.pay)));
  $("panel").querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = async () => {
    if (!confirm("ยืนยันการยกเลิกคำสั่งซื้อนี้?")) return;
    const { error } = await supabase.rpc("card_cancel_order", { p_order: b.dataset.cancel });
    if (error) toast("ยกเลิกไม่สำเร็จ"); else { await loadAll(); showOrders(); }
  }));
}
$("navOrders").onclick = showOrders;

await loadAll();
