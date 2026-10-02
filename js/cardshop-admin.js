import { adminSupabase as supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const baht = (n) => `${Number(n || 0).toLocaleString("th-TH")}฿`;
const PAY = { pending_payment: "รอชำระเงิน", verifying: "รอตรวจสอบสลิป", paid: "ชำระเงินสำเร็จ", cancelled: "ยกเลิก" };
const SHIP = { pending: "รอดำเนินการ", preparing: "เตรียมจัดส่ง", shipped: "จัดส่งแล้ว", completed: "สำเร็จ" };
// เมนูใหม่ให้เพิ่มก่อน Dashboard เสมอ (Dashboard อยู่ท้ายสุดทุกครั้ง)
const MENU = [["orders", "ออเดอร์"], ["shipping", "การจัดส่ง"], ["products", "สินค้า"], ["stock", "สต็อก"], ["promos", "โปรโมชั่น"], ["dash", "Dashboard"]];
let view = "orders", categories = [];

// ---------- ป๊อปอัพ (สไตล์เดียวกับแอดมินร้านไลฟ์) ----------
function popup(html, onClose) {
  const ov = document.createElement("div");
  ov.className = "modal-overlay";
  ov.innerHTML = `<div class="admin-card modal-card ca-modal">${html}</div>`;
  const close = () => { ov.remove(); onClose?.(); };
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  document.body.appendChild(ov);
  return { ov, close };
}
function confirmPopup(title, msg, okText = "ยืนยัน") {
  return new Promise((resolve) => {
    const { ov, close } = popup(`<h3 class="display">${esc(title)}</h3><p class="muted" style="margin:0">${esc(msg)}</p>
      <div class="ca-row" style="justify-content:flex-end;margin-top:16px"><button class="icon-btn ghost" data-no type="button">ยกเลิก</button><button class="btn-marquee" data-ok type="button" style="margin:0">${esc(okText)}</button></div>`, () => resolve(false));
    ov.querySelector("[data-no]").onclick = close;
    ov.querySelector("[data-ok]").onclick = () => { ov.remove(); resolve(true); };
  });
}
function noticePopup(title, msg) {
  const { ov, close } = popup(`<h3 class="display">${esc(title)}</h3><p class="muted" style="margin:0">${esc(msg)}</p>
    <div class="ca-row" style="justify-content:flex-end;margin-top:16px"><button class="btn-marquee" data-ok type="button" style="margin:0">ตกลง</button></div>`);
  ov.querySelector("[data-ok]").onclick = close;
}

// ---------- สแกนบาร์โค้ดเลข Tracking (กล้องมือถือ/คอม) ----------
const SCAN_ICON = `<svg class="cs-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 8v8M11 8v8M14 8v8M17 8v8"/></svg>`;
const SCAN_FORMATS = ["code_128", "code_39", "code_93", "codabar", "ean_13", "ean_8", "itf", "upc_a", "upc_e", "qr_code", "data_matrix"];

// คืนค่าเลขที่สแกนได้ หรือ null ถ้ายกเลิก/สแกนไม่ได้
function scanBarcode() {
  return new Promise((resolve) => {
    let done = false, stop = () => {};
    const finish = (val) => { if (done) return; done = true; stop(); ov.remove(); resolve(val); };
    const { ov } = popup(`<div class="ca-row" style="justify-content:space-between"><h3 class="display" style="margin:0">สแกนบาร์โค้ด Tracking</h3><button class="icon-btn ghost" data-x type="button" aria-label="ปิด" style="padding:5px 9px">✕</button></div>
      <div class="ca-scan"><video id="scanVideo" playsinline muted autoplay></video><div class="ca-scan-line"></div></div>
      <p class="muted" id="scanMsg" style="font-size:13px;text-align:center;margin:10px 0 0">เล็งกล้องไปที่บาร์โค้ดบนกล่องพัสดุ ระบบจะกรอกเลขให้อัตโนมัติ</p>`, () => finish(null));
    ov.querySelector("[data-x]").onclick = () => finish(null);

    (async () => {
      const video = ov.querySelector("#scanVideo"), msg = ov.querySelector("#scanMsg");
      const hit = (raw) => { const v = String(raw || "").replace(/[\s\u0000-\u001f]/g, ""); if (v) { navigator.vibrate?.(80); finish(v); } };
      const constraints = { video: { facingMode: { ideal: "environment" } }, audio: false };
      try {
        if ("BarcodeDetector" in window) {
          const sup = await BarcodeDetector.getSupportedFormats();
          const formats = SCAN_FORMATS.filter((f) => sup.includes(f));
          const det = new BarcodeDetector(formats.length ? { formats } : undefined);
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          stop = () => stream.getTracks().forEach((t) => t.stop());
          if (done) { stop(); return; }
          video.srcObject = stream; await video.play();
          const tick = async () => {
            if (done) return;
            try { const r = await det.detect(video); if (r.length) { hit(r[0].rawValue); return; } } catch {}
            setTimeout(tick, 150);
          };
          tick();
        } else {
          // เบราว์เซอร์ที่ไม่มี BarcodeDetector (เช่น iPhone Safari) ใช้ไลบรารี ZXing แทน
          msg.textContent = "กำลังเปิดกล้อง...";
          const { BrowserMultiFormatReader } = await import("https://esm.sh/@zxing/browser@0.1.5");
          const controls = await new BrowserMultiFormatReader().decodeFromConstraints(constraints, video, (result) => { if (result) hit(result.getText()); });
          stop = () => controls.stop();
          if (done) stop(); else msg.textContent = "เล็งกล้องไปที่บาร์โค้ดบนกล่องพัสดุ ระบบจะกรอกเลขให้อัตโนมัติ";
        }
      } catch (e) {
        msg.style.color = "var(--crimson)";
        msg.textContent = e?.name === "NotAllowedError"
          ? "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตการใช้กล้องในเบราว์เซอร์ แล้วลองใหม่ หรือพิมพ์เลขเอง"
          : "เปิดกล้องไม่ได้ในอุปกรณ์นี้ กรุณาพิมพ์เลข Tracking เอง";
      }
    })();
  });
}

// ---------- ออกจากระบบ / ตั้งค่าร้าน (ปุ่มฟันเฟือง) ----------
$("logoutBtn").onclick = async () => { await supabase.auth.signOut(); location.href = "./admin.html"; };
$("settingsBtn").onclick = () => settingsPopup();

// ---------- ตรวจสิทธิ์แอดมิน (ใช้ session แอดมินเดียวกับ /admin) ----------
const { data: sess } = await supabase.auth.getSession();
let isAdmin = false;
if (sess.session) {
  const { data: pr } = await supabase.from("profiles").select("is_admin").eq("id", sess.session.user.id).maybeSingle();
  isAdmin = !!pr?.is_admin;
}
if (!isAdmin) { $("gate").style.display = "block"; }
else { $("app").style.display = "block"; renderMenu(); go("orders"); }

function renderMenu() {
  $("menu").innerHTML = MENU.map(([k, l]) => `<button type="button" data-k="${k}" class="${k === view ? "on" : ""}">${l}</button>`).join("");
  $("menu").querySelectorAll("button").forEach((b) => (b.onclick = () => go(b.dataset.k)));
}
function go(k) { view = k; renderMenu(); ({ dash, products: productsView, orders: () => ordersView(false), stock: stockView, shipping: () => ordersView(true), promos: promosView })[k](); }
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
      <div style="flex:1;min-width:160px"><b>${esc(p.name)}</b><div class="muted" style="font-size:12px">${baht(p.price)} · เหลือ ${p.stock_total - p.stock_sold}/${p.stock_total} (ขายแล้ว ${p.stock_sold}) · ${p.product_type === "unique" ? "เฉพาะใบ" : "ทั่วไป"}</div>
      <div style="margin-top:4px"><span class="ca-st">${p.is_active ? "เปิดขาย" : "ปิดขาย"}</span> ${p.is_new ? '<span class="ca-st">ใหม่</span>' : ""} ${p.is_bestseller ? '<span class="ca-st">ขายดี</span>' : ""}</div></div>
      <button class="icon-btn" data-edit="${p.id}" type="button">แก้ไข</button>
      <button class="icon-btn ghost" data-tog="${p.id}" data-on="${p.is_active}" type="button">${p.is_active ? "ปิดขาย" : "เปิดขาย"}</button>
      <button class="icon-btn ghost" data-del="${p.id}" type="button" style="color:var(--crimson)">ลบ</button></div>`).join("") || '<p class="muted">ยังไม่มีสินค้า</p>'}`;
  $("newP").onclick = () => productForm(null);
  $("newCat").onclick = categoryPopup;
  const byId = Object.fromEntries((data || []).map((p) => [p.id, p]));
  $("view").querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => productForm(byId[b.dataset.edit])));
  $("view").querySelectorAll("[data-tog]").forEach((b) => (b.onclick = async () => { await supabase.from("card_products").update({ is_active: b.dataset.on !== "true" }).eq("id", b.dataset.tog); productsView(); }));
  $("view").querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmPopup("ลบสินค้า", "ลบสินค้านี้ถาวร? (ประวัติออเดอร์เดิมยังอยู่)", "ลบสินค้า"))) return;
    const { error } = await supabase.from("card_products").delete().eq("id", b.dataset.del);
    if (error) noticePopup("ลบไม่สำเร็จ", error.message); else productsView();
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
        price: Number($("fPrice").value),
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
      <div class="full"><label class="field-label">เลข Tracking (พิมพ์เองหรือกดสแกนบาร์โค้ด)</label>
        <div class="ca-row" style="flex-wrap:nowrap"><input class="field-input" id="sT" style="flex:1;min-width:0" value="${esc(sh.tracking_no || "")}" autocomplete="off" />
        <button class="icon-btn" data-scan type="button" title="สแกนบาร์โค้ด" aria-label="สแกนบาร์โค้ด" style="flex-shrink:0;display:inline-flex;align-items:center;gap:6px">${SCAN_ICON}<span>สแกน</span></button></div></div></div>
      <button class="btn-marquee" data-act="ship" type="button" style="margin:8px 0 0">บันทึกการจัดส่ง</button>` : ""}
    <p class="error-text" data-err></p>`;
  box.style.display = "block";
  const fail = (e) => (box.querySelector("[data-err]").textContent = "ไม่สำเร็จ: " + (e.message || e));
  const scanBtn = box.querySelector("[data-scan]");
  if (scanBtn) scanBtn.onclick = async () => {
    const code = await scanBarcode();
    if (code) { const inp = box.querySelector("#sT"); inp.value = code; inp.focus(); }  // กรอกให้ แก้ไขเองต่อได้
  };
  box.querySelectorAll("[data-act]").forEach((b) => (b.onclick = async () => {
    const a = b.dataset.act; let r;
    if (a === "approve") r = await supabase.from("card_orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", o.id);
    else if (a === "reject") r = await supabase.from("card_orders").update({ status: "pending_payment", slip_url: null }).eq("id", o.id);
    else if (a === "cancel") { if (!(await confirmPopup("ยกเลิกออเดอร์", "ยกเลิกออเดอร์นี้และคืน Stock ให้สินค้า?", "ยกเลิกออเดอร์"))) return; r = await supabase.rpc("card_cancel_order", { p_order: o.id }); }
    else if (a === "ship") {
      const st = box.querySelector("#sS").value, trk = box.querySelector("#sT").value.trim();
      r = await supabase.from("card_orders").update({ shipping_status: st }).eq("id", o.id);
      if (!r.error) r = await supabase.from("card_shipments").upsert({ order_id: o.id, carrier: box.querySelector("#sC").value.trim() || null, tracking_no: trk || null, shipped_at: st === "shipped" ? new Date().toISOString() : sh.shipped_at || null, updated_at: new Date().toISOString() });
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

// ---------- ป๊อปอัพจัดการหมวดหมู่ ----------
async function categoryPopup() {
  const { ov, close } = popup(`<div id="catBox"></div>`, () => { if (view === "products") productsView(); });
  const render = async () => {
    await loadCats();
    const box = ov.querySelector("#catBox");
    box.innerHTML = `<div class="ca-row" style="justify-content:space-between"><h3 class="display" style="margin:0">จัดการหมวดหมู่</h3><button class="icon-btn ghost" data-x type="button" aria-label="ปิด" style="padding:5px 9px">✕</button></div>
      <div class="ca-row" style="margin:12px 0 4px"><input id="catName" class="field-input" style="flex:1" placeholder="ชื่อหมวดหมู่ใหม่" /><button class="btn-marquee" id="catAdd" type="button" style="margin:0">เพิ่ม</button></div>
      <p class="error-text" id="catErr"></p>
      ${categories.map((c) => `<div class="ca-row" style="justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--line)"><span>${esc(c.name)}</span><button class="icon-btn ghost" data-del="${c.id}" type="button" style="color:var(--crimson)">ลบ</button></div>`).join("") || '<p class="muted">ยังไม่มีหมวดหมู่</p>'}
      <p class="muted" style="font-size:12px;margin:10px 0 0">ลบหมวดหมู่แล้ว สินค้าในหมวดนั้นจะกลายเป็น "ไม่มีหมวดหมู่"</p>`;
    box.querySelector("[data-x]").onclick = close;
    const add = async () => {
      const n = box.querySelector("#catName").value.trim(); if (!n) return;
      const { error } = await supabase.from("card_categories").insert({ name: n });
      if (error) box.querySelector("#catErr").textContent = "เพิ่มไม่สำเร็จ: " + error.message; else render();
    };
    box.querySelector("#catAdd").onclick = add;
    box.querySelector("#catName").onkeydown = (e) => { if (e.key === "Enter") add(); };
    box.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { await supabase.from("card_categories").delete().eq("id", b.dataset.del); render(); }));
  };
  render();
}

// ---------- ป๊อปอัพตั้งค่าร้าน (ปุ่มฟันเฟือง) ----------
async function settingsPopup() {
  const { data: s } = await supabase.from("card_settings").select("*").eq("id", 1).maybeSingle();
  const { ov, close } = popup(`<div class="ca-row" style="justify-content:space-between"><h3 class="display" style="margin:0">ตั้งค่าร้าน CARD SHOP</h3><button class="icon-btn ghost" data-x type="button" aria-label="ปิด" style="padding:5px 9px">✕</button></div>
    <div class="ca-grid" style="margin-top:12px">
    <div><label class="field-label">ค่าจัดส่งต่อออเดอร์ (บาท)</label><input id="sFee" type="number" min="0" step="1" class="field-input" value="${s?.shipping_fee ?? 0}" /></div>
    <div><label class="field-label">ซื้อครบกี่บาทส่งฟรี (เว้นว่าง = ไม่มี)</label><input id="sFree" type="number" min="0" step="1" class="field-input" value="${s?.free_shipping_min ?? ""}" /></div></div>
    <p class="error-text" id="sErr"></p><p id="sOk" style="color:#46c882;min-height:18px;margin:6px 0"></p>
    <button class="btn-marquee" id="sSave" type="button" style="margin:0;width:100%">บันทึก</button>`);
  ov.querySelector("[data-x]").onclick = close;
  ov.querySelector("#sSave").onclick = async () => {
    const { error } = await supabase.from("card_settings").update({ shipping_fee: Number(ov.querySelector("#sFee").value) || 0, free_shipping_min: ov.querySelector("#sFree").value === "" ? null : Number(ov.querySelector("#sFree").value) }).eq("id", 1);
    ov.querySelector("#sErr").textContent = error ? "บันทึกไม่สำเร็จ: " + error.message : ""; ov.querySelector("#sOk").textContent = error ? "" : "บันทึกเรียบร้อยแล้ว";
  };
}

// ---------- โปรโมชั่น ----------
const toLocalInput = (iso) => { if (!iso) return ""; const d = new Date(iso), z = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; };
const fmtDT = (iso) => new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

async function promosView() {
  await loadCats();
  const [{ data: promos }, { data: prods }] = await Promise.all([
    supabase.from("card_promotions").select("*").order("created_at", { ascending: false }),
    supabase.from("card_products").select("id, name").order("name"),
  ]);
  const prodName = Object.fromEntries((prods || []).map((x) => [x.id, x.name]));
  const catName = Object.fromEntries(categories.map((c) => [c.id, c.name]));
  const state = (pr) => {
    const now = Date.now();
    if (!pr.is_active) return "ปิดใช้งาน";
    if (pr.starts_at && new Date(pr.starts_at) > now) return "ยังไม่เริ่ม";
    if (pr.ends_at && new Date(pr.ends_at) < now) return "หมดอายุแล้ว";
    return "กำลังใช้งาน";
  };
  $("view").innerHTML = `<div class="ca-row" style="margin-bottom:12px"><button class="btn-marquee" id="newPromo" type="button" style="margin:0">+ เพิ่มโปรโมชั่น</button></div>
    ${(promos || []).map((pr) => `<div class="ca-card ca-row"><div style="flex:1;min-width:180px"><b>${esc(pr.name)}</b>
      <div class="muted" style="font-size:12px">ลด ${pr.discount_type === "percent" ? `${pr.discount_value}%` : baht(pr.discount_value)} · ใช้กับ: ${pr.product_id ? "สินค้า " + esc(prodName[pr.product_id] || "(ถูกลบ)") : pr.category_id ? "หมวดหมู่ " + esc(catName[pr.category_id] || "(ถูกลบ)") : "ทุกสินค้า"}</div>
      <div class="muted" style="font-size:12px">${pr.starts_at ? fmtDT(pr.starts_at) : "เริ่มทันที"} → ${pr.ends_at ? fmtDT(pr.ends_at) : "ไม่มีวันหมดอายุ"}</div>
      <span class="ca-st" style="margin-top:4px">${state(pr)}</span></div>
      <button class="icon-btn" data-edit="${pr.id}" type="button">แก้ไข</button>
      <button class="icon-btn ghost" data-tog="${pr.id}" data-on="${pr.is_active}" type="button">${pr.is_active ? "ปิดใช้งาน" : "เปิดใช้งาน"}</button>
      <button class="icon-btn ghost" data-del="${pr.id}" type="button" style="color:var(--crimson)">ลบ</button></div>`).join("") || '<p class="muted">ยังไม่มีโปรโมชั่น</p>'}`;
  const byId = Object.fromEntries((promos || []).map((x) => [x.id, x]));
  $("newPromo").onclick = () => promoPopup(null, prods || []);
  $("view").querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => promoPopup(byId[b.dataset.edit], prods || [])));
  $("view").querySelectorAll("[data-tog]").forEach((b) => (b.onclick = async () => { await supabase.from("card_promotions").update({ is_active: b.dataset.on !== "true" }).eq("id", b.dataset.tog); promosView(); }));
  $("view").querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => {
    if (!(await confirmPopup("ลบโปรโมชั่น", "ลบโปรโมชั่นนี้? สินค้าจะกลับไปใช้ราคาปกติทันที", "ลบโปรโมชั่น"))) return;
    await supabase.from("card_promotions").delete().eq("id", b.dataset.del); promosView();
  }));
}

function promoPopup(pr, prods) {
  const scope = pr?.product_id ? "product" : pr?.category_id ? "category" : "all";
  const { ov, close } = popup(`<div class="ca-row" style="justify-content:space-between"><h3 class="display" style="margin:0">${pr ? "แก้ไขโปรโมชั่น" : "เพิ่มโปรโมชั่น"}</h3><button class="icon-btn ghost" data-x type="button" aria-label="ปิด" style="padding:5px 9px">✕</button></div>
    <div class="ca-grid" style="margin-top:12px">
    <div class="full"><label class="field-label">ชื่อโปรโมชั่น (แสดงเป็นป้ายบนสินค้า)</label><input id="pName" class="field-input" placeholder="เช่น ลดต้อนรับเปิดร้าน" value="${esc(pr?.name || "")}" /></div>
    <div><label class="field-label">รูปแบบส่วนลด</label><select id="pType" class="field-input"><option value="percent" ${pr?.discount_type !== "amount" ? "selected" : ""}>ลดเป็น %</option><option value="amount" ${pr?.discount_type === "amount" ? "selected" : ""}>ลดเป็นบาท</option></select></div>
    <div><label class="field-label">จำนวนที่ลด</label><input id="pVal" type="number" min="0" step="0.01" class="field-input" value="${pr?.discount_value ?? ""}" /></div>
    <div class="full"><label class="field-label">ใช้กับ</label><select id="pScope" class="field-input"><option value="all" ${scope === "all" ? "selected" : ""}>ทุกสินค้า</option><option value="category" ${scope === "category" ? "selected" : ""}>หมวดหมู่</option><option value="product" ${scope === "product" ? "selected" : ""}>สินค้าเฉพาะ</option></select></div>
    <div class="full" id="pCatWrap"><select id="pCat" class="field-input">${categories.map((c) => `<option value="${c.id}" ${pr?.category_id === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="full" id="pProdWrap"><select id="pProd" class="field-input">${prods.map((x) => `<option value="${x.id}" ${pr?.product_id === x.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
    <div><label class="field-label">เริ่ม (เว้นว่าง = เริ่มทันที)</label><input id="pStart" type="datetime-local" class="field-input" value="${toLocalInput(pr?.starts_at)}" /></div>
    <div><label class="field-label">สิ้นสุด (เว้นว่าง = ไม่หมดอายุ)</label><input id="pEnd" type="datetime-local" class="field-input" value="${toLocalInput(pr?.ends_at)}" /></div>
    <div class="full"><label><input type="checkbox" id="pAct" ${pr?.is_active !== false ? "checked" : ""}/> เปิดใช้งาน</label></div></div>
    <p class="muted" style="font-size:12px;margin:8px 0 0">ถ้าสินค้าตรงกับหลายโปรโมชั่น ระบบใช้ราคาที่ถูกที่สุดให้ลูกค้า</p>
    <p class="error-text" id="pErr"></p>
    <div class="ca-row" style="justify-content:flex-end;margin-top:10px"><button class="icon-btn ghost" data-x2 type="button">ยกเลิก</button><button class="btn-marquee" id="pSave" type="button" style="margin:0">บันทึก</button></div>`);
  const sync = () => { const v = ov.querySelector("#pScope").value; ov.querySelector("#pCatWrap").style.display = v === "category" ? "block" : "none"; ov.querySelector("#pProdWrap").style.display = v === "product" ? "block" : "none"; };
  ov.querySelector("#pScope").onchange = sync; sync();
  ov.querySelector("[data-x]").onclick = close; ov.querySelector("[data-x2]").onclick = close;
  ov.querySelector("#pSave").onclick = async () => {
    const g = (id) => ov.querySelector(id), err = g("#pErr"); err.textContent = "";
    const sc = g("#pScope").value, type = g("#pType").value, val = Number(g("#pVal").value);
    const start = g("#pStart").value ? new Date(g("#pStart").value) : null, end = g("#pEnd").value ? new Date(g("#pEnd").value) : null;
    if (!g("#pName").value.trim()) { err.textContent = "กรุณากรอกชื่อโปรโมชั่น"; return; }
    if (!(val > 0) || (type === "percent" && val > 100)) { err.textContent = type === "percent" ? "ส่วนลดต้องอยู่ระหว่าง 1–100%" : "กรุณากรอกจำนวนเงินที่ลด"; return; }
    if (sc === "category" && !g("#pCat").value) { err.textContent = "กรุณาเลือกหมวดหมู่"; return; }
    if (sc === "product" && !g("#pProd").value) { err.textContent = "กรุณาเลือกสินค้า"; return; }
    if (start && end && end <= start) { err.textContent = "วันสิ้นสุดต้องอยู่หลังวันเริ่ม"; return; }
    const row = { name: g("#pName").value.trim(), discount_type: type, discount_value: val, product_id: sc === "product" ? g("#pProd").value : null, category_id: sc === "category" ? g("#pCat").value : null,
      starts_at: start ? start.toISOString() : null, ends_at: end ? end.toISOString() : null, is_active: g("#pAct").checked };
    const { error } = pr ? await supabase.from("card_promotions").update(row).eq("id", pr.id) : await supabase.from("card_promotions").insert(row);
    if (error) { err.textContent = "บันทึกไม่สำเร็จ: " + error.message; return; }
    close(); promosView();
  };
}
