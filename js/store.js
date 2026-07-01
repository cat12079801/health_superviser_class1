// 学習状態の localStorage 読み書き
const KEY = "eisei1.progress.v1";

// 回答ごとの更新時刻の既定値。updatedAt を持たない旧データはこの十分古い時刻で
// 補完する。問題単位マージで旧データがリモートの新しい回答へ不当に優先されるのを防ぐ。
export const EPOCH = "1970-01-01T00:00:00.000Z";

function emptyState() {
  return { answers: {}, updatedAt: null };
}

// 回答マップを現行スキーマへ正規化する純関数。
// 各回答に updatedAt を保証し、欠損（旧スキーマ）は EPOCH で補完する。
// localStorage に依存しないため単体テスト可能とする。
export function migrateAnswers(answers) {
  const out = {};
  if (!answers || typeof answers !== "object") return out;
  for (const [id, a] of Object.entries(answers)) {
    if (!a || typeof a !== "object") continue;
    out[id] = {
      lastChoice: a.lastChoice,
      correct: a.correct,
      attempts: a.attempts || 0,
      updatedAt: typeof a.updatedAt === "string" ? a.updatedAt : EPOCH,
    };
  }
  return out;
}

// 2 つの回答マップ（例: ローカルとリモート）を問題 id ごとにマージする純関数。
// 片方にしか存在しない id はそれを採用し、両方に存在する id は updatedAt が
// 新しい方を採用する。これにより端末ごとに別々の問題を解いた場合でも双方の
// 更新が残り、全体上書き（LWW）による消失を防ぐ。
// - updatedAt は ISO 8601 UTC 文字列のため、辞書順比較が時系列比較に一致する。
// - attempts は合算せず、採用した側（勝者）の値をそのまま用いる。
// - updatedAt が同時刻のときは第 1 引数側を優先する。
// 両引数は migrateAnswers で正規化するため、欠損は EPOCH として扱われる。
export function mergeAnswers(a, b) {
  const left = migrateAnswers(a);
  const right = migrateAnswers(b);
  const out = {};
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const id of ids) {
    const l = left[id];
    const r = right[id];
    if (!r) { out[id] = l; continue; }
    if (!l) { out[id] = r; continue; }
    out[id] = r.updatedAt > l.updatedAt ? r : l;
  }
  return out;
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!data || typeof data.answers !== "object") return emptyState();
    return { answers: migrateAnswers(data.answers), updatedAt: data.updatedAt ?? null };
  } catch {
    return emptyState();
  }
}

function save(state) {
  state.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* 保存失敗時は無視（プライベートモード等） */
  }
}

// 1問の回答結果を記録
export function record(id, choiceIndex, correct) {
  const state = load();
  const prev = state.answers[id];
  state.answers[id] = {
    lastChoice: choiceIndex,
    correct,
    attempts: (prev?.attempts || 0) + 1,
    updatedAt: new Date().toISOString(),
  };
  save(state);
}

export function reset() {
  save(emptyState());
}

// 回答マップ全体を置き換えて保存する。同期のマージ結果を localStorage へ
// 反映する用途に使う。渡された値は migrateAnswers で正規化する。
export function replaceAnswers(answers) {
  save({ answers: migrateAnswers(answers), updatedAt: null });
}

// 難易度の正準キー。表示順もこの順とする
export const DIFFICULTIES = ["hard", "standard", "easy"];
// 難易度キー -> 表示ラベル
export const DIFFICULTY_LABEL = { hard: "難", standard: "並", easy: "易" };

function emptyDifficultyStats() {
  const d = {};
  for (const key of DIFFICULTIES) d[key] = { total: 0, answered: 0, correct: 0 };
  return d;
}

// 問題配列に対する集計を返す。
// byCategory[cat] は { total, answered, correct, byDifficulty: { hard|standard|easy: {...} } }
export function summarize(questions) {
  const state = load();
  const total = questions.length;
  let answered = 0;
  let correct = 0;
  const byCategory = {};

  for (const q of questions) {
    const cat = (byCategory[q.category] ||= {
      total: 0,
      answered: 0,
      correct: 0,
      byDifficulty: emptyDifficultyStats(),
    });
    cat.total += 1;
    // 既知の難易度キーに限って集計する（不明値は難易度別集計に計上しない）
    const diff = DIFFICULTIES.includes(q.difficulty) ? cat.byDifficulty[q.difficulty] : null;
    if (diff) diff.total += 1;

    const a = state.answers[q.id];
    if (a) {
      answered += 1;
      cat.answered += 1;
      if (diff) diff.answered += 1;
      if (a.correct) {
        correct += 1;
        cat.correct += 1;
        if (diff) diff.correct += 1;
      }
    }
  }
  return { total, answered, correct, byCategory };
}

// 復習対象（不正解 or 未回答）の id 集合判定に使う
export function getAnswers() {
  return load().answers;
}
