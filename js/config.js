// Supabase 接続情報。いずれも公開してよい値である（保護は DB 側の RLS で行う）。
// Supabase ダッシュボードの Project URL / Publishable key に対応する。
// 値を差し替える場合はこの 2 定数のみを更新すればよい。
// 未設定（空文字）のときは同期機能を無効化し、localStorage のみで動作する。
export const SUPABASE_URL = "https://hwlfabjwpbxjaaiqutux.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PlTDW3PJvO1Bz8oZxm7PMg_rpvghvg2";
