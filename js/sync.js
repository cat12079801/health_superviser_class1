// Supabase を用いた認証と進捗同期を集約するモジュール。
// 同期は任意機能とし、未設定・SDK 読込失敗・通信失敗のいずれでもアプリを止めない
// （呼び出し側でローカルのみの動作へフォールバックできるよう設計する）。
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

// esm.sh 経由で supabase-js を動的読み込みする。ビルド工程を持たない方針に合わせ、
// CDN からの ESM import とする。読み込み失敗時は同期を無効化する。
const SUPABASE_ESM = "https://esm.sh/@supabase/supabase-js@2";

const CONFIGURED =
  typeof SUPABASE_URL === "string" &&
  SUPABASE_URL.startsWith("https://") &&
  typeof SUPABASE_PUBLISHABLE_KEY === "string" &&
  SUPABASE_PUBLISHABLE_KEY.length > 0;

// 同期機能が利用可能に構成されているか（接続情報が設定済みか）。
export function isConfigured() {
  return CONFIGURED;
}

let clientPromise = null;
async function getClient() {
  if (!CONFIGURED) return null;
  if (!clientPromise) {
    clientPromise = import(SUPABASE_ESM)
      .then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY))
      .catch((e) => {
        clientPromise = null; // 次回再試行できるようにする
        throw e;
      });
  }
  return clientPromise;
}

// progress テーブルの1行 <-> 学習状態の1回答 の相互変換。
function rowToAnswer(r) {
  return {
    lastChoice: r.last_choice,
    correct: r.correct,
    attempts: r.attempts || 0,
    updatedAt: r.updated_at,
  };
}
function answerToRow(userId, id, a) {
  return {
    user_id: userId,
    question_id: id,
    last_choice: a.lastChoice,
    correct: a.correct,
    attempts: a.attempts || 0,
    updated_at: a.updatedAt,
  };
}

let currentUser = null;

// 現在ログイン中のユーザ（未ログインなら null）。
export function getUser() {
  return currentUser;
}

// 認証状態を初期化し、変化を購読する。onChange(user|null) が初期状態と以降の
// 変化時に呼ばれる。接続情報が未設定なら onChange(null) を1度呼んで終了する。
export async function initAuth(onChange) {
  let client;
  try {
    client = await getClient();
  } catch {
    client = null;
  }
  if (!client) {
    onChange(null);
    return null;
  }
  const { data } = await client.auth.getSession();
  currentUser = data.session?.user ?? null;
  onChange(currentUser); // 初期状態を通知する
  client.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION は上の getSession で通知済みのため無視する。
    if (event === "INITIAL_SESSION") return;
    currentUser = session?.user ?? null;
    onChange(currentUser);
  });
  return currentUser;
}

// Google ログインを開始する。認証後は現在のページへ戻る。
export async function signIn() {
  const client = await getClient();
  if (!client) return;
  const redirectTo = window.location.origin + window.location.pathname;
  await client.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
}

export async function signOut() {
  const client = await getClient();
  if (!client) return;
  await client.auth.signOut();
}

// リモートの全回答を { [questionId]: answer } 形式で取得する。
export async function pullRemote() {
  const client = await getClient();
  if (!client || !currentUser) return {};
  const { data, error } = await client
    .from("progress")
    .select("question_id,last_choice,correct,attempts,updated_at")
    .eq("user_id", currentUser.id);
  if (error) throw error;
  const out = {};
  for (const r of data || []) out[r.question_id] = rowToAnswer(r);
  return out;
}

// 回答マップ全体をリモートへ upsert する。
export async function pushAll(answers) {
  const client = await getClient();
  if (!client || !currentUser) return;
  const rows = Object.entries(answers).map(([id, a]) => answerToRow(currentUser.id, id, a));
  if (rows.length === 0) return;
  const { error } = await client.from("progress").upsert(rows);
  if (error) throw error;
}

// 1問の回答をリモートへ upsert する。
export async function pushOne(id, a) {
  const client = await getClient();
  if (!client || !currentUser) return;
  const { error } = await client.from("progress").upsert(answerToRow(currentUser.id, id, a));
  if (error) throw error;
}

// リモートの自ユーザ行をすべて削除する（進捗リセット用）。
export async function clearRemote() {
  const client = await getClient();
  if (!client || !currentUser) return;
  const { error } = await client.from("progress").delete().eq("user_id", currentUser.id);
  if (error) throw error;
}
