import { supabase } from "./supabaseClient.js";

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
    area.innerHTML = `<a href="./login.html" class="icon-btn ghost" style="text-decoration:none; display:inline-block;">เข้าสู่ระบบ</a>`;
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
