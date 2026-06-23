// 学習状態の localStorage 読み書き
const KEY = "eisei1.progress.v1";

function emptyState() {
  return { answers: {}, updatedAt: null };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const data = JSON.parse(raw);
    if (!data || typeof data.answers !== "object") return emptyState();
    return data;
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
  };
  save(state);
}

export function reset() {
  save(emptyState());
}

// 問題配列に対する集計を返す
export function summarize(questions) {
  const state = load();
  const total = questions.length;
  let answered = 0;
  let correct = 0;
  const byCategory = {};

  for (const q of questions) {
    const cat = (byCategory[q.category] ||= { total: 0, answered: 0, correct: 0 });
    cat.total += 1;
    const a = state.answers[q.id];
    if (a) {
      answered += 1;
      cat.answered += 1;
      if (a.correct) {
        correct += 1;
        cat.correct += 1;
      }
    }
  }
  return { total, answered, correct, byCategory };
}

// 復習対象（不正解 or 未回答）の id 集合判定に使う
export function getAnswers() {
  return load().answers;
}
