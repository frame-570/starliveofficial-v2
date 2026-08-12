import { supabase } from "./supabaseClient.js";
import { signInWithGoogle, signInWithPassword, signUpWithPassword } from "./auth.js";

const redirectTarget = new URLSearchParams(window.location.search).get("redirect") || "./index.html";

// ถ้าล็อกอินอยู่แล้ว ส่งกลับหน้าที่ตั้งใจไว้ทันที
const { data: sessionData } = await supabase.auth.getSession();
if (sessionData.session) {
  window.location.href = redirectTarget;
}

const loginMode = document.getElementById("loginMode");
const signUpMode = document.getElementById("signUpMode");

document.getElementById("goSignUp").addEventListener("click", () => {
  loginMode.style.display = "none";
  signUpMode.style.display = "block";
});
document.getElementById("goSignIn").addEventListener("click", () => {
  signUpMode.style.display = "none";
  loginMode.style.display = "block";
});

document.getElementById("googleBtn").addEventListener("click", () => signInWithGoogle(redirectTarget));
document.getElementById("googleBtnSignUp").addEventListener("click", () => signInWithGoogle(redirectTarget));

// ---------- เข้าสู่ระบบด้วยอีเมล ----------
const signInForm = document.getElementById("signInForm");
const signInError = document.getElementById("signInError");
const signInBtn = document.getElementById("signInBtn");

signInForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signInError.textContent = "";
  signInBtn.disabled = true;
  signInBtn.textContent = "กำลังเข้าสู่ระบบ...";

  const email = document.getElementById("signInEmail").value.trim();
  const password = document.getElementById("signInPassword").value;

  const { error } = await signInWithPassword(email, password);

  signInBtn.disabled = false;
  signInBtn.textContent = "เข้าสู่ระบบ";

  if (error) {
    signInError.textContent = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    return;
  }

  window.location.href = redirectTarget;
});

// ---------- สมัครสมาชิกด้วยอีเมล ----------
const signUpForm = document.getElementById("signUpForm");
const signUpError = document.getElementById("signUpError");
const signUpNotice = document.getElementById("signUpNotice");
const signUpBtn = document.getElementById("signUpBtn");

signUpForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  signUpError.textContent = "";
  signUpNotice.textContent = "";
  signUpBtn.disabled = true;
  signUpBtn.textContent = "กำลังสมัคร...";

  const name = document.getElementById("signUpName").value.trim();
  const email = document.getElementById("signUpEmail").value.trim();
  const password = document.getElementById("signUpPassword").value;

  const { data, error } = await signUpWithPassword(email, password, name);

  signUpBtn.disabled = false;
  signUpBtn.textContent = "สมัครสมาชิก";

  if (error) {
    signUpError.textContent = /already|registered/i.test(error.message)
      ? "อีเมลนี้ถูกใช้สมัครแล้ว"
      : "สมัครสมาชิกไม่สำเร็จ กรุณาลองใหม่";
    return;
  }

  if (data.session) {
    window.location.href = redirectTarget;
    return;
  }

  signUpNotice.textContent = "สมัครสำเร็จ กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ";
});
