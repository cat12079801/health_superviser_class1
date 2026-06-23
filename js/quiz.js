// 問題データの読み込みと出題ロジック
import { getAnswers } from "./store.js";

export const CATEGORY_LABEL = {
  law_hazardous: "有害業務に係るもの",
  law_general: "有害業務以外のもの",
};

let cache = null;

async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`データの読み込みに失敗しました: ${path} (${res.status})`);
  return res.json();
}

// data/index.json のマニフェストに列挙された科目別ファイルを読み込み、結合して返す
export async function loadQuestions() {
  if (cache) return cache;
  const manifest = await fetchJson("data/index.json");
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const datasets = await Promise.all(files.map((file) => fetchJson(`data/${file}`)));
  cache = datasets.flatMap((d) => (Array.isArray(d.questions) ? d.questions : []));
  return cache;
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
