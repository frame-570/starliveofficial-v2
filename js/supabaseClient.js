import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// 1. Client สำหรับฝั่งลูกค้า (เข้าซื้อบัตร / หน้าเว็บหลัก / หน้าชมไลฟ์)
export const customerSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: "starlive_customer_auth", // เก็บ Session แยกสำหรับลูกค้า
    persistSession: true,
    autoRefreshToken: true,
  },
});

// 2. Client สำหรับฝั่งแอดมิน (Admin Panel)
export const adminSupabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: "starlive_admin_auth", // เก็บ Session แยกสำหรับแอดมิน
    persistSession: true,
    autoRefreshToken: true,
  },
});

// 3. คง export supabase ค่าเริ่มต้นไว้เพื่อรองรับไฟล์เดิมที่ยังใช้ export แบบเดิม
export const supabase = customerSupabase;

// แปลงลิงก์ YouTube ทุกรูปแบบ (watch?v=, youtu.be/, live/, embed/) ให้เป็น video ID
export function extractYouTubeId(url) {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([\w-]{11})/,
    /(?:youtu\.be\/)([\w-]{11})/,
    /(?:youtube\.com\/live\/)([\w-]{11})/,
    /(?:youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
