import { supabase } from "./supabaseClient.js";
import { signInWithGoogle, signInWithPassword, signUpWithPassword } from "./auth.js";

// Safe redirect resolver to prevent Open Redirect vulnerability
function getSafeRedirectTarget() {
  const rawParam = new URLSearchParams(window.location.search).get("redirect");
  if (!rawParam) return "./index.html";

  // อนุญาตเฉพาะ Relative Path หรือ URL ภายในโดเมนเดียวกันเท่านั้น
  try {
    const parsed = new URL(rawParam, window.location.origin);
    if (parsed.origin === window.location.origin) {
      return parsed.pathname + parsed.search + parsed.hash;
    }
  } catch {
    // ถ้าเป็น Relative Path (เช่น ./index.html หรือ /dashboard)
    if (rawParam.startsWith("/") || rawParam.startsWith("./")) {
      return rawParam;
    }
  }
  return "./index.html";
}

const redirectTarget = getSafeRedirectTarget();

// ถ้าล็อกอินอยู่แล้ว ส่งกลับหน้าที่ตั้งใจไว้ทันที
const { data: sessionData } = await supabase.auth.getSession();
if (sessionData?.session) {
  window.location.href = redirectTarget;
}

// --- DOM Elements & Mode Switcher ---
const loginMode = document.getElementById("loginMode");
const signUpMode = document.getElementById("signUpMode");

document.getElementById("goSignUp")?.addEventListener("click", () => {
  loginMode.style.display = "none";
  signUpMode.style.display = "block";
});

document.getElementById("goSignIn")?.addEventListener("click", () => {
  signUpMode.style.display = "none";
  loginMode.style.display = "block";
});

// --- สั่งซื้อโดยไม่สมัครสมาชิก: กลับไปหน้าที่ตั้งใจไว้ (หน้างาน) แล้วกดชำระเงินได้เลย ระบบจะถามชื่อเพื่อสั่งแบบแขก ---
function goGuest() {
  const hasRedirect = !!new URLSearchParams(window.location.search).get("redirect");
  // กลับไปเฉพาะหน้างาน (ที่กดชำระเงินแบบแขกได้) หน้าอื่นอย่างหน้าชำระเงิน/ประวัติต้องมีออเดอร์แขกในเครื่องก่อน จึงไปหน้าแรกให้เลือกงาน
  if (hasRedirect && /event-detail/.test(redirectTarget)) {
    // กลับหน้างานเดิม พร้อมสั่งให้เปิดหน้าต่างกรอกชื่อสำหรับสั่งซื้อแบบแขก
    const u = new URL(redirectTarget, window.location.origin);
    u.searchParams.set("guest", "1");
    window.location.href = u.pathname + u.search;
  } else {
    window.location.href = "./index.html";
  }
}
document.getElementById("guestBtnLogin")?.addEventListener("click", goGuest);
document.getElementById("guestBtnSignUp")?.addEventListener("click", goGuest);

// --- OAuth (Google) ---
document.getElementById("googleBtn")?.addEventListener("click", () => signInWithGoogle(redirectTarget));
document.getElementById("googleBtnSignUp")?.addEventListener("click", () => signInWithGoogle(redirectTarget));

// ---------- เข้าสู่ระบบด้วยอีเมล ----------
const signInForm = document.getElementById("signInForm");
const signInError = document.getElementById("signInError");
const signInBtn = document.getElementById("signInBtn");

signInForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  signInError.textContent = "";
  signInBtn.disabled = true;
  signInBtn.textContent = "กำลังเข้าสู่ระบบ...";

  const email = document.getElementById("signInEmail").value.trim();
  const password = document.getElementById("signInPassword").value;

  try {
    const { error } = await signInWithPassword(email, password);

    if (error) {
      signInError.textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
      return;
    }

    window.location.href = redirectTarget;
  } catch (err) {
    signInError.textContent = "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง";
  } finally {
    signInBtn.disabled = false;
    signInBtn.textContent = "เข้าสู่ระบบ";
  }
});

// ---------- สมัครสมาชิกด้วยอีเมล ----------
const signUpForm = document.getElementById("signUpForm");
const signUpError = document.getElementById("signUpError");
const signUpNotice = document.getElementById("signUpNotice");
const signUpBtn = document.getElementById("signUpBtn");

signUpForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  signUpError.textContent = "";
  signUpNotice.textContent = "";
  signUpBtn.disabled = true;
  signUpBtn.textContent = "กำลังสมัคร...";

  const name = document.getElementById("signUpName").value.trim();
  const email = document.getElementById("signUpEmail").value.trim();
  const password = document.getElementById("signUpPassword").value;

  try {
    const { data, error } = await signUpWithPassword(email, password, name);

    if (error) {
      signUpError.textContent = /already|registered|user_already_exists/i.test(error.message || "")
        ? "อีเมลนี้ถูกใช้สมัครแล้ว"
        : "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่";
      return;
    }

    // ถ้าตั้งค่า Supabase ให้ล็อกอินอัตโนมัติหลังสมัครสำเร็จ (Turn off Email Confirm)
    if (data?.session) {
      window.location.href = redirectTarget;
      return;
    }

    // ถ้าต้องยืนยันตัวตนผ่านอีเมลก่อน
    signUpNotice.textContent = "สมัครสำเร็จ! กรุณาตรวจสอบอีเมลและยืนยันตัวตนก่อนเข้าสู่ระบบ";
    signUpForm.reset();
  } catch (err) {
    signUpError.textContent = "เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง";
  } finally {
    signUpBtn.disabled = false;
    signUpBtn.textContent = "สมัครสมาชิก";
  }
});
