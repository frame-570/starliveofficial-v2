import { supabase } from "./supabaseClient.js";
import { hasGuestOrders } from "./guest.js";
import { getMember, clearMember, memberCall } from "./member.js";

// ---------- Session helpers ----------
export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = "./index.html";
}

export async function signInWithGoogle(redirectPath = "./index.html") {
  const redirectTo = new URL(redirectPath, window.location.href).toString();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
}

export async function signInWithPassword(email, password) {
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(email, password, displayName) {
  return supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: displayName || "" } },
  });
}

// ---------- Header / profile menu (ใช้ในทุกหน้าฝั่งลูกค้า) ----------
// ต้องมี element ในหน้า: #headerAuthArea
export async function renderHeaderAuth() {
  const area = document.getElementById("headerAuthArea");
  if (!area) return;

  const session = await getSession();

  if (!session) {
    const member = getMember();
    if (member) {
      // เข้าสู่ระบบด้วยรหัสประจำตัว: แสดงโปรไฟล์เป็นตัวอักษร "ST" มีเมนูประวัติ/ออกจากระบบ
      area.innerHTML = `
        <div class="profile-menu-wrap">
          <button id="profileAvatarBtn" class="profile-avatar" aria-haspopup="true" aria-expanded="false" title="${escapeHtml(member.name || "รหัสประจำตัว")}"><span>ST</span></button>
          <div id="profileDropdown" class="profile-dropdown" style="display:none;">
            <div style="padding:8px 12px 6px; font-size:12.5px; line-height:1.5;">
              <strong style="color:var(--amber);">${escapeHtml(member.name || "ลูกค้า")}</strong><br>
              <span class="muted">รหัสประจำตัว ${escapeHtml(String(member.code || "").slice(0, 2))}••••${escapeHtml(String(member.code || "").slice(-2))}</span>
            </div>
            <a href="./orders.html" class="profile-dropdown-item">ประวัติการสั่งซื้อ</a>
            <button id="signOutBtn" class="profile-dropdown-item" type="button">ออกจากระบบ</button>
          </div>
        </div>`;
      const btn = document.getElementById("profileAvatarBtn");
      const dd = document.getElementById("profileDropdown");
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const open = dd.style.display === "block";
        dd.style.display = open ? "none" : "block";
        btn.setAttribute("aria-expanded", String(!open));
      });
      document.addEventListener("click", () => (dd.style.display = "none"));
      document.getElementById("signOutBtn").addEventListener("click", async () => {
        try { await memberCall({ action: "logout", token: member.token }); } catch {}
        clearMember();
        window.location.href = "./index.html";
      });
      return;
    }
    // เครื่องนี้เคยสั่งซื้อแบบไม่สมัครสมาชิก -> มีทางเข้าประวัติที่เก็บในเครื่อง
    const historyLink = hasGuestOrders()
      ? `<a href="./orders.html" class="icon-btn ghost">ประวัติ</a>`
      : "";
    area.innerHTML = `<div class="header-auth-row">${historyLink}<a href="./login.html" class="icon-btn ghost">เข้าสู่ระบบ</a></div>`;
    return;
  }

  const profile = await getProfile(session.user.id);
  const name = profile?.display_name || session.user.email || "ผู้ใช้งาน";
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const avatarUrl = profile?.avatar_url;

  area.innerHTML = `
    <div class="profile-menu-wrap">
      <button id="profileAvatarBtn" class="profile-avatar" aria-haspopup="true" aria-expanded="false" title="${escapeHtml(name)}">
        ${avatarUrl ? `<img src="${escapeHtml(avatarUrl)}" alt="" />` : `<span>${escapeHtml(initial)}</span>`}
      </button>
      <div id="profileDropdown" class="profile-dropdown" style="display:none;">
        <a href="./orders.html" class="profile-dropdown-item">ประวัติการสั่งซื้อ</a>
        <button id="signOutBtn" class="profile-dropdown-item" type="button">ออกจากระบบ</button>
      </div>
    </div>
  `;

  const avatarBtn = document.getElementById("profileAvatarBtn");
  const dropdown = document.getElementById("profileDropdown");

  avatarBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = dropdown.style.display === "block";
    dropdown.style.display = isOpen ? "none" : "block";
    avatarBtn.setAttribute("aria-expanded", String(!isOpen));
  });

  document.addEventListener("click", () => {
    dropdown.style.display = "none";
    avatarBtn.setAttribute("aria-expanded", "false");
  });

  document.getElementById("signOutBtn").addEventListener("click", signOut);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
