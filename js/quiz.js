// 問題データの読み込みと出題ロジック
import { getAnswers } from "./store.js";

let categoriesCache = null;
let questionsCache = null;

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`データの読み込みに失敗しました: ${path} (${res.status})`);
  return res.json();
}

// カテゴリ定義（label / prefix / file / implemented）の単一の定義元を読み込む。
// 表示ラベル・読み込むファイル・id 接頭辞はすべて data/categories.json に集約する。
export async function loadCategories() {
  if (categoriesCache) return categoriesCache;
  const data = await fetchJson("data/categories.json");
  categoriesCache = Array.isArray(data.categories) ? data.categories : [];
  return categoriesCache;
}

// categories.json の implemented なカテゴリのデータファイルを読み込み、結合して返す
export async function loadQuestions() {
  if (questionsCache) return questionsCache;
  const categories = await loadCategories();
  const files = categories.filter((c) => c.implemented).map((c) => c.file);
  const datasets = await Promise.all(files.map((file) => fetchJson(`data/${file}`)));
  questionsCache = datasets.flatMap((d) => (Array.isArray(d.questions) ? d.questions : []));
  return questionsCache;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// モードに応じて出題する問題リストを返す
export function buildQuizSet(questions, mode, category) {
  let pool = questions;

  if (mode === "category") {
    pool = questions.filter((q) => q.category === category);
  } else if (mode === "review") {
    const answers = getAnswers();
    // 未回答 または 直近不正解 を対象
    pool = questions.filter((q) => {
      const a = answers[q.id];
      return !a || !a.correct;
    });
  }

  return shuffle(pool);
}

export function judge(question, choiceIndex) {
  return choiceIndex === question.answerIndex;
}
