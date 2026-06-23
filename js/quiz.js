// 問題データの読み込みと出題ロジック
import { getAnswers } from "./store.js";

export const CATEGORY_LABEL = {
  law_hazardous: "有害業務に係るもの",
  law_general: "有害業務以外のもの",
};

let cache = null;

export async function loadQuestions() {
  if (cache) return cache;
  const res = await fetch("data/questions.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`問題データの読み込みに失敗しました (${res.status})`);
  const data = await res.json();
  cache = Array.isArray(data.questions) ? data.questions : [];
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
