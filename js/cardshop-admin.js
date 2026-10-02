import { adminSupabase as supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const baht = (n) => `${Number(n || 0).toLocaleString("th-TH")}฿`;
const PAY = { pending_payment: "รอชำระเงิน", verifying: "รอตรวจสอบสลิป", paid: "ชำระเงินสำเร็จ", cancelled: "ยกเลิก" };
const SHIP = { pending: "รอดำเนินการ", preparing: "เตรียมจัดส่ง", shipped: "จัดส่งแล้ว", completed: "สำเร็จ" };
const MENU = [["dash", "Dashboard"], ["products", "สินค้า"], ["orders", "ออเดอร์"], ["stock", "สต็อก"], ["shipping", "การจัดส่ง"], ["settings", "ตั้งค่าร้าน"]];
let view = "dash", categories = [];

$("systemSwitch").onchange = (e) => { if (e.target.value === "live") location.href = "./admin.html"; };

// ---------- ตรวจสิทธิ์แอดมิน (ใช้ session แอดมินเดียวกับ /admin) ----------
const { data: sess } = await supabase.auth.getSession();
let isAdmin = false;
if (sess.session) {
  const { data: pr } = await supabase.from("profiles").select("is_admin").eq("id", sess.session.user.id).maybeSingle();
  isAdmin = !!pr?.is_admin;
}
if (!isAdmin) { $("gate").style.display = "block"; }
else { $("app").style.display = "block"; renderMenu(); go("dash"); }

function renderMenu() {
  $("menu").innerHTML = MENU.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === view ? "on" : ""}">${l}</button>`).join("");
  $("menu").querySelectorAll("button").forEach((b) => (b.onclick = () => go(b.dataset.k)));
}
function go(k) { view = k; renderMenu(); ({ dash, products: productsView, orders: () => ordersView(false), stock: stockView, shipping: () => ordersView(true), settings: settingsView })[k](); }
async function loadCats() { const { data } = await supabase.from("card_categories").select("*").order("sort_order").order("name"); categories = data || []; }

// ---------- Dashboard ----------
async function dash() {
  const [verify, paid, prods] = await Promise.all([
    supabase.from("card_orders").select("id", { count: "exact", head: true }).eq("status", "verifying"),
    supabase.from("card_orders").select("total").eq("status", "paid"),
    supabase.from("card_products").select("name, stock_total, stock_sold, is_active"),
  ]);
  const revenue = (paid.data || []).reduce((a, r) => a + Number(r.total), 0);
  const low = (prods.data || []).filter((p) => p.is_active && p.stock_total - p.stock_sold <= 3);
  $("view").innerHTML = `<div class="ca-stats">
    <div class="ca-card ca-stat"><span class="muted">รอตรวจสอบสลิป</span><b>${verify.count || 0}</b></div>
    <div class="ca-card ca-stat"><span class="muted">รายได้ (ชำระแล้ว)</span><b>${baht(revenue)}</b></div>
    <div class="ca-card ca-stat"><span class="muted">สินค้าใกล้หมด (≤3)</span><b>${low.length}</b></div></div>
    ${low.length ? `<div class="ca-card"><b>ใกล้หมด:</b> ${low.map((p) => `${esc(p.name)} (เหลือ ${p.stock_total - p.stock_sold})`).join(" · ")}</div>` : ""}`;
}

// ---------- สินค้า ----------
async function productsView() {
  await loadCats();
  const { data } = await supabase.from("card_products").select("*").order("created_at", { ascending: false });
  $("view").innerHTML = `<div class="ca-row" style="margin-bottom:12px"><button class="btn-marquee" id="newP" type="button" style="margin:0">+ เพิ่มสินค้า</button>
    <button class="icon-btn ghost" id="newCat" type="button">+ หมวดหมู่</button></div><div id="pForm"></div>
    ${(data || []).map((p) => `<div class="ca-card ca-row">${p.image_url ? `<img src="${esc(p.image_url)}" alt="" />` : "<img alt='' />"}
      <div style="flex:1;min-width:160px"><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${baht(p.price)}${p.sale_price != null ? ` → โปร ${baht(p.sale_price)}` : ""} · เหลือ ${p.stock_total - p.stock_sold}/${p.stock_total} (ขายแล้ว ${p.stock_sold}) · ${p.product_type === "unique" ? "เฉพาะใบ" : "ทั่วไป"}</div>
      <div style="margin-top:4px"><span class="ca-st">${p.is_active ? "เปิดขาย" : "ปิดขาย"}</span> ${p.is_new ? '<span class="ca-st">ใหม่</span>' : ""} ${p.is_bestseller ? '<span class="ca-st">ขายดี</span>' : ""}</div></div>
      <button class="icon-btn" data-edit="${p.id}" type="button">แก้ไข</button>
      <button class="icon-btn ghost" data-tog="${p.id}" data-on="${p.is_active}" type="button">${p.is_active ? "ปิดขาย" : "เปิดขาย"}</button>
      <button class="icon-btn ghost" data-del="${p.id}" type="button" style="color:var(--crimson)">ลบ</button></div>`).join("") || '<p class="muted">ยังไม่มีสินค้า</p>'}`;
  $("newP").onclick = () => productForm(null);
  $("newCat").onclick = async () => { const n = prompt("ชื่อหมวดหมู่ใหม่"); if (n?.trim()) { await supabase.from("card_categories").insert({ name: n.trim() }); productsView(); } };
  const byId = Object.fromEntries((data || []).map((p) => [p.id, p]));
  $("view").querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => productForm(byId[b.dataset.edit])));
  $("view").querySelectorAll("[data-tog]").forEach((b) => (b.onclick = async () => { await supabase.from("card_products").update({ is_active: b.dataset.on !== "true" }).eq("id", b.dataset.tog); productsView(); }));
  $("view").querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!confirm("ลบสินค้านี้ถาวร? (ประวัติออเดอร์เดิมยังอยู่)")) return;
    const { error } = await supabase.from("card_products").delete().eq("id", b.dataset.del);
    if (error) alert("ลบไม่สำเร็จ: " + error.message); else productsView();
  }));
}
function productForm(p) {
  const v = (k, d = "") => esc(p?.[k] ?? d);
  $("pForm").innerHTML = `<div class="ca-card"><h3 class="display" style="margin:0 0 10px">${p ? "แก้ไขสินค้า" : "เพิ่มสินค้า"}</h3><div class="ca-grid">
    <div class="full"><label class="field-label">ชื่อสินค้า</label><input id="fName" class="field-input" value="${v("name")}" /></div>
    <div><label class="field-label">หมวดหมู่</label><select id="fCat" class="field-input"><option value="">-</option>${categories.map((c) => `<option value="${c.id}" ${p?.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div><label class="field-label">รูปแบบสินค้า</label><select id="fType" class="field-input"><option value="stock" ${p?.product_type !== "unique" ? "selected" : ""}>ทั่วไป (นับจำนวน)</option><option value="unique" ${p?.product_type === "unique" ? "selected" : ""}>เฉพาะใบ (Serial / หายาก)</option></select></div>
    <div><label class="field-label">Serial / หมายเลขการ์ด (เฉพาะใบ)</label><input id="fSerial" class="field-input" value="${v("serial_no")}" /></div>
    <div><label class="field-label">ราคา (บาท)</label><input id="fPrice" type="number" min="0" step="0.01" class="field-input" value="${v("price")}" /></div>
    <div><label class="field-label">ราคาโปรโมชั่น (เว้นว่าง = ไม่มีโปร)</label><input id="fSale" type="number" min="0" step="0.01" class="field-input" value="${v("sale_price")}" /></div>
    <div><label class="field-label">ป้ายโปรโมชั่น (เช่น ลด 20%)</label><input id="fPromo" class="field-input" value="${v("promo_label")}" /></div>
    ${p ? "" : `<div><label class="field-label">จำนวนเริ่มต้น (Stock)</label><input id="fStock" type="number" min="0" step="1" class="field-input" value="1" /></div>`}
    <div class="full"><label class="field-label">รูปสินค้า (อัปโหลด หรือวางลิงก์)</label><input id="fFile" type="file" accept="image/*" class="field-input" /><input id="fImg" class="field-input" style="margin-top:6px" placeholder="https://..." value="${v("image_url")}" /></div>
    <div class="full"><label class="field-label">รายละเอียด</label><textarea id="fDesc" class="field-input" rows="3">${v("description")}</textarea></div>
    <div class="full ca-row"><label><input type="checkbox" id="fAct" ${p?.is_active !== false ? "checked" : ""}/> เปิดขาย</label><label><input type="checkbox" id="fNew" ${p?.is_new ? "checked" : ""}/> สินค้าใหม่</label><label><input type="checkbox" id="fBest" ${p?.is_bestseller ? "checked" : ""}/> ขายดี</label></div></div>
    ${p ? '<p class="muted" style="font-size:12px">ปรับจำนวนสินค้าที่เมนู "สต็อก" เพื่อให้มีประวัติ Stock Log</p>' : ""}
    <p class="error-text" id="fErr"></p><div class="ca-row"><button class="btn-marquee" id="fSave" type="button" style="margin:0">บันทึก</button><button class="icon-btn ghost" id="fCancel" type="button">ยกเลิก</button></div></div>`;
  $("fCancel").onclick = () => ($("pForm").innerHTML = "");
  $("fSave").onclick = async () => {
    $("fErr").textContent = ""; $("fSave").disabled = true;
    try {
      let img = $("fImg").value.trim(); const f = $("fFile").files[0];
      if (f) {
        const path = `${Date.now()}-${f.name.replace(/[^\w.\-]/g, "_")}`;
        const up = await supabase.storage.from("card-products").upload(path, f);
        if (up.error) throw up.error;
        img = supabase.storage.from("card-products").getPublicUrl(path).data.publicUrl;
      }
      const type = $("fType").value;
      const row = { name: $("fName").value.trim(), category_id: $("fCat").value || null, product_type: type, serial_no: type === "unique" ? $("fSerial").value.trim() || null : null,
        price: Number($("fPrice").value), sale_price: $("fSale").value === "" ? null : Number($("fSale").value), promo_label: $("fPromo").value.trim() || null,
        image_url: img || null, description: $("fDesc").value.trim() || null, is_active: $("fAct").checked, is_new: $("fNew").checked, is_bestseller: $("fBest").checked, updated_at: new Date().toISOString() };
      if (!row.name || !(row.price >= 0)) throw new Error("กรุณากรอกชื่อและราคา");
      if (p) { const { error } = await supabase.from("card_products").update(row).eq("id", p.id); if (error) throw error; }
      else {
        const { data, error } = await supabase.from("card_products").insert(row).select().single(); if (error) throw error;
        const qty = Math.max(0, Math.floor(Number($("fStock").value) || 0));
        if (qty) { const r = await supabase.rpc("card_adjust_stock", { p_product: data.id, p_delta: qty, p_reason: "add", p_note: "เพิ่มสินค้าใหม่" }); if (r.error) throw r.error; }
      }
      productsView();
    } catch (e) { $("fErr").textContent = "บันทึกไม่สำเร็จ: " + (e.message || e); $("fSave").disabled = false; }
  };
  $("pForm").scrollIntoView({ behavior: "smooth" });
}

// ---------- ออเดอร์ / การจัดส่ง ----------
async function ordersView(shippingMode) {
  $("view").innerHTML = `<div class="ca-row" style="margin-bottom:12px"><select id="oFilter" class="field-input" style="width:auto">
    ${shippingMode ? `<option value="todo">ต้องจัดส่ง (ชำระแล้ว ยังไม่สำเร็จ)</option><option value="all">ชำระแล้วทั้งหมด</option>`
      : `<option value="">ทุกสถานะ</option><option value="verifying">รอตรวจสอบสลิป</option><option value="pending_payment">รอชำระเงิน</option><option value="paid">ชำระเงินสำเร็จ</option><option value="cancelled">ยกเลิก</option>`}</select>
    <button class="icon-btn ghost" id="oRefresh" type="button">รีเฟรช</button></div><div id="oList"></div>`;
  const load = async () => {
    let q = supabase.from("card_orders").select("*, card_order_items(*), card_shipments(*)").order("created_at", { ascending: false }).limit(100);
    const f = $("oFilter").value;
    if (shippingMode) { q = q.eq("status", "paid"); if (f === "todo") q = q.neq("shipping_status", "completed"); }
    else if (f) q = q.eq("status", f);
    const { data } = await q;
    const ids = [...new Set((data || []).map((o) => o.user_id))];
    const { data: pf } = ids.length ? await supabase.from("profiles").select("id, display_name, email").in("id", ids) : { data: [] };
    const pm = Object.fromEntries((pf || []).map((x) => [x.id, x]));
    $("oList").innerHTML = (data || []).map((o) => `<div class="ca-card" data-o="${o.id}">
      <div class="ca-row"><b>${esc(o.order_number)}</b><span class="muted" style="font-size:12px">${new Date(o.created_at).toLocaleString("th-TH")}</span>
      <span class="ca-st">${PAY[o.status]}</span>${o.status === "paid" ? `<span class="ca-st">${SHIP[o.shipping_status]}</span>` : ""}<b style="margin-left:auto;color:var(--amber)">${baht(o.total)}</b></div>
      <div class="muted" style="font-size:13px;margin-top:4px">${esc(pm[o.user_id]?.display_name || pm[o.user_id]?.email || "-")} · ${o.card_order_items.map((i) => `${esc(i.product_name)}×${i.qty}`).join(", ")}</div>
      <button class="icon-btn ghost" data-open="${o.id}" type="button" style="margin-top:8px">รายละเอียด / จัดการ</button><div class="ca-detail" style="display:none"></div></div>`).join("") || '<p class="muted">ไม่มีออเดอร์</p>';
    const byId = Object.fromEntries((data || []).map((o) => [o.id, o]));
    $("oList").querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => toggleDetail(b, byId[b.dataset.open], load)));
  };
  $("oFilter").onchange = load; $("oRefresh").onclick = load; load();
}
async function toggleDetail(btn, o, reload) {
  const box = btn.nextElementSibling;
  if (box.style.display === "block") { box.style.display = "none"; return; }
  const sh = o.card_shipments || {};
  let slip = "";
  if (o.slip_url) { const { data } = await supabase.storage.from("card-slips").createSignedUrl(o.slip_url, 600); slip = data?.signedUrl ? `<a href="${esc(data.signedUrl)}" target="_blank" rel="noopener"><img class="slip" src="${esc(data.signedUrl)}" alt="สลิป" /></a>` : ""; }
  box.innerHTML = `<div><b>จัดส่งถึง:</b> ${esc(o.ship_name)} · ${esc(o.ship_phone)}<br>${esc(o.ship_address)} ต.${esc(o.ship_subdistrict)} อ.${esc(o.ship_district)} จ.${esc(o.ship_province)} ${esc(o.ship_postcode)}</div>
    <div style="margin-top:6px">${o.card_order_items.map((i) => `${esc(i.product_name)} × ${i.qty} = ${baht(i.line_total)}`).join("<br>")}<br>ค่าสินค้า ${baht(o.subtotal)} + ส่ง ${baht(o.shipping_fee)}</div>
    ${slip || '<p class="muted">ยังไม่มีสลิป</p>'}
    <div class="ca-row" style="margin:8px 0">${["verifying", "pending_payment"].includes(o.status) ? `<button class="btn-marquee" data-act="approve" type="button" style="margin:0">ยืนยันชำระเงิน</button>` : ""}
      ${o.status === "verifying" ? `<button class="icon-btn ghost" data-act="reject" type="button">ปฏิเสธสลิป</button>` : ""}
      ${o.status !== "cancelled" ? `<button class="icon-btn ghost" data-act="cancel" type="button" style="color:var(--crimson)">ยกเลิกออเดอร์ (คืน Stock)</button>` : ""}</div>
    ${o.status === "paid" ? `<div class="ca-grid"><div><label class="field-label">สถานะจัดส่ง</label><select class="field-input" id="sS">${Object.entries(SHIP).map(([k, l]) => `<option value="${k}" ${o.shipping_status === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      <div><label class="field-label">บริษัทขนส่ง</label><input class="field-input" id="sC" value="${esc(sh.carrier || "")}" placeholder="Flash / Kerry / ไปรษณีย์ไทย" /></div>
      <div class="full"><label class="field-label">เลข Tracking</label><input class="field-input" id="sT" value="${esc(sh.tracking_no || "")}" /></div></div>
      <button class="btn-marquee" data-act="ship" type="button" style="margin:8px 0 0">บันทึกการจัดส่ง</button>` : ""}
    <p class="error-text" data-err></p>`;
  box.style.display = "block";
  const fail = (e) => (box.querySelector("[data-err]").textContent = "ไม่สำเร็จ: " + (e.message || e));
  box.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const a = b.dataset.act; let r;
    if (a === "approve") r = await supabase.from("card_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", o.id);
    else if (a === "reject") r = await supabase.from("card_orders").update({ status: "pending_payment", slip_url: null }).eq("id", o.id);
    else if (a === "cancel") { if (!confirm("ยกเลิกออเดอร์นี้และคืน Stock?")) return; r = await supabase.rpc("card_cancel_order", { p_order: o.id }); }
    else if (a === "ship") {
      const st = $("sS").value, trk = $("sT").value.trim();
      r = await supabase.from("card_orders").update({ shipping_status: st }).eq("id", o.id);
      if (!r.error) r = await supabase.from("card_shipments").upsert({ order_id: o.id, carrier: $("sC").value.trim() || null, tracking_no: trk || null, shipped_at: st === "shipped" ? new Date().toISOString() : sh.shipped_at || null, updated_at: new Date().toISOString() });
    }
    if (r.error) fail(r.error); else reload();
  }));
}

// ---------- สต็อก ----------
async function stockView() {
  const [{ data: prods }, { data: logs }] = await Promise.all([
    supabase.from("card_products").select("id, name, stock_total, stock_sold, product_type").order("name"),
    supabase.from("card_stock_logs").select("*, card_products(name)").order("created_at", { ascending: false }).limit(60),
  ]);
  const REASON = { add: "เพิ่มสินค้า", sale: "ขายสินค้า", adjust: "ปรับสต็อก", cancel: "คืนสต็อก (ยกเลิก)" };
  $("view").innerHTML = `<div class="ca-card"><h3 class="display" style="margin:0 0 8px">ปรับ Stock</h3><div class="ca-grid">
    <div class="full"><select id="stP" class="field-input">${(prods || []).map((p) => `<option value="${p.id}">${esc(p.name)} (ทั้งหมด ${p.stock_total} · ขายแล้ว ${p.stock_sold} · เหลือ ${p.stock_total - p.stock_sold})</option>`).join("")}</select></div>
    <div><label class="field-label">จำนวน (+เพิ่ม / −ลด)</label><input id="stD" type="number" step="1" class="field-input" placeholder="เช่น 50 หรือ -2" /></div>
    <div><label class="field-label">ประเภท</label><select id="stR" class="field-input"><option value="add">เพิ่มสินค้า</option><option value="adjust">ปรับสต็อก</option></select></div>
    <div class="full"><label class="field-label">หมายเหตุ</label><input id="stN" class="field-input" /></div></div>
    <p class="error-text" id="stE"></p><button class="btn-marquee" id="stGo" type="button" style="margin:0">บันทึก</button></div>
    <div class="ca-card"><h3 class="display" style="margin:0 0 8px">Stock Log ล่าสุด</h3>${(logs || []).map((l) => `<div class="ca-row" style="border-bottom:1px solid var(--line);padding:6px 0;font-size:13px"><b style="color:${l.change > 0 ? "#46c882" : "var(--crimson)"};min-width:44px">${l.change > 0 ? "+" : ""}${l.change}</b><span style="flex:1">${esc(l.card_products?.name || "")} — ${REASON[l.reason]}${l.note ? " · " + esc(l.note) : ""}</span><span class="muted">${new Date(l.created_at).toLocaleString("th-TH")}</span></div>`).join("") || '<p class="muted">ยังไม่มีประวัติ</p>'}</div>`;
  $("stGo").onclick = async () => {
    const d = Math.trunc(Number($("stD").value)); $("stE").textContent = "";
    if (!d) { $("stE").textContent = "กรุณาใส่จำนวนที่ไม่ใช่ 0"; return; }
    const { error } = await supabase.rpc("card_adjust_stock", { p_product: $("stP").value, p_delta: d, p_reason: $("stR").value, p_note: $("stN").value.trim() || null });
    if (error) $("stE").textContent = "ไม่สำเร็จ: ลดจนต่ำกว่าจำนวนที่ขายแล้วไม่ได้ (หรือการ์ดเฉพาะใบเกิน 1 ใบ)"; else stockView();
  };
}

// ---------- ตั้งค่าร้าน ----------
async function settingsView() {
  const { data: s } = await supabase.from("card_settings").select("*").eq("id", 1).maybeSingle();
  $("view").innerHTML = `<div class="ca-card"><h3 class="display" style="margin:0 0 8px">ค่าจัดส่ง</h3><div class="ca-grid">
    <div><label class="field-label">ค่าจัดส่งต่อออเดอร์ (บาท)</label><input id="sFee" type="number" min="0" step="1" class="field-input" value="${s?.shipping_fee ?? 0}" /></div>
    <div><label class="field-label">ซื้อครบกี่บาทส่งฟรี (เว้นว่าง = ไม่มี)</label><input id="sFree" type="number" min="0" step="1" class="field-input" value="${s?.free_shipping_min ?? ""}" /></div></div>
    <p class="error-text" id="sErr"></p><p id="sOk" style="color:#46c882;min-height:18px"></p><button class="btn-marquee" id="sSave" type="button" style="margin:0">บันทึก</button></div>`;
  $("sSave").onclick = async () => {
    const { error } = await supabase.from("card_settings").update({ shipping_fee: Number($("sFee").value) || 0, free_shipping_min: $("sFree").value === "" ? null : Number($("sFree").value) }).eq("id", 1);
    $("sErr").textContent = error ? "บันทึกไม่สำเร็จ: " + error.message : ""; $("sOk").textContent = error ? "" : "บันทึกเรียบร้อยแล้ว";
  };
}
