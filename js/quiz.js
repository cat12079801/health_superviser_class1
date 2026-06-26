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

// 出題対象の問題を、カテゴリと回答状態フィルタ（未回答 / 誤答）で絞り込む。
// category を指定するとそのカテゴリに限定し、null のときは全カテゴリを対象とする。
// 正答済みの問題は常に対象外とする（再出題する必要がないため）。
export function selectQuestions(
  questions,
  { category = null, includeUnanswered = false, includeWrong = false } = {}
) {
  const answers = getAnswers();
  return questions.filter((q) => {
    if (category && q.category !== category) return false;
    const a = answers[q.id];
    if (!a) return includeUnanswered; // 未回答
    if (!a.correct) return includeWrong; // 回答済みだが誤答
    return false; // 正答済み
  });
}

// 絞り込み条件に一致する問題数を返す
export function countQuestions(questions, opts) {
  return selectQuestions(questions, opts).length;
}

// 絞り込み条件に一致する問題をシャッフルして出題リストを返す
export function buildQuizSet(questions, opts) {
  return shuffle(selectQuestions(questions, opts));
}

export function judge(question, choiceIndex) {
  return choiceIndex === question.answerIndex;
}
