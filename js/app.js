// 画面制御
import { load, record, reset, summarize } from "./store.js";
import {
  loadQuestions,
  loadCategories,
  buildQuizSet,
  countQuestions,
  judge,
} from "./quiz.js";

const $ = (sel) => document.querySelector(sel);
const views = {
  home: $("#view-home"),
  quiz: $("#view-quiz"),
  stats: $("#view-stats"),
};

let questions = [];
let categories = [];
// 実装済みカテゴリの category -> 表示ラベルの対応。categories.json から導出する
let categoryLabel = {};
let quizSet = [];
let index = 0;
let selected = null;
let answeredCurrent = false;

function show(name) {
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle("hidden", key !== name);
  }
  window.scrollTo(0, 0);
}

/* ---------- ホーム ---------- */
// 実装済みカテゴリの出題ボタンを「全問」ボタンの後ろに動的生成する
function renderCategoryMenu() {
  const allBtn = $("#menu-all");
  // 再生成（問題更新時）でボタンが重複しないよう、既存の動的ボタンを除去する
  document
    .querySelectorAll('.menu-btn[data-mode="category"]')
    .forEach((b) => b.remove());
  const frag = document.createDocumentFragment();
  for (const c of categories) {
    if (!c.implemented) continue;
    const btn = document.createElement("button");
    btn.className = "menu-btn";
    btn.dataset.mode = "category";
    btn.dataset.category = c.category;

    const title = document.createElement("span");
    title.className = "menu-title";
    title.textContent = c.label;

    const desc = document.createElement("span");
    desc.className = "menu-desc";
    desc.id = `cnt-${c.category}`;
    desc.textContent = "-";

    btn.append(title, desc);
    frag.appendChild(btn);
  }
  allBtn.after(frag);
}

function renderHome() {
  const s = summarize(questions);
  const rate = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
  $("#home-rate").textContent = s.answered ? `${rate}%` : "--%";
  $("#home-answered").textContent = `${s.answered} / ${s.total}`;

  renderCounts();
  show("home");
}

// 現在のトグル（未回答 / 誤答）の選択状況を返す
function getFilter() {
  return {
    includeUnanswered: $("#tg-unanswered").checked,
    includeWrong: $("#tg-wrong").checked,
  };
}

// トグルの選択に応じて、各出題ボタンの対象問題数を表示し、0問のボタンを非活性にする
function renderCounts() {
  const filter = getFilter();

  const allN = countQuestions(questions, filter);
  $("#cnt-all").textContent = `${allN}問 / 全${questions.length}問`;
  $("#menu-all").disabled = allN === 0;

  for (const cat of Object.keys(categoryLabel)) {
    const catTotal = questions.filter((q) => q.category === cat).length;
    const n = countQuestions(questions, { category: cat, ...filter });
    const el = $(`#cnt-${cat}`);
    if (el) el.textContent = `${n}問 / 全${catTotal}問`;
    const btn = el && el.closest(".menu-btn");
    if (btn) btn.disabled = n === 0;
  }
}

/* ---------- 出題 ---------- */
function startQuiz(mode, category) {
  const filter = getFilter();
  const opts = mode === "category" ? { category, ...filter } : filter;
  quizSet = buildQuizSet(questions, opts);
  index = 0;
  if (quizSet.length === 0) {
    alert("選択した条件に該当する問題はありません。");
    return;
  }
  renderQuestion();
  show("quiz");
}

function renderQuestion() {
  selected = null;
  answeredCurrent = false;
  const q = quizSet[index];

  $("#quiz-progress").textContent = `${index + 1} / ${quizSet.length}`;
  $("#q-category").textContent = categoryLabel[q.category] || q.category;
  $("#q-tags").textContent = Array.isArray(q.tags) ? q.tags.join("・") : "";
  $("#q-text").textContent = q.question;

  const ol = $("#q-choices");
  ol.className = "choices";
  ol.innerHTML = "";
  q.choices.forEach((choice, i) => {
    const li = document.createElement("li");
    li.textContent = choice;
    li.dataset.index = i;
    li.addEventListener("click", () => selectChoice(i));
    ol.appendChild(li);
  });

  $("#q-result").classList.add("hidden");
  $("#q-submit").classList.remove("hidden");
  $("#q-submit").disabled = true;
  $("#q-next").classList.add("hidden");
}

function selectChoice(i) {
  if (answeredCurrent) return;
  selected = i;
  $("#q-choices")
    .querySelectorAll("li")
    .forEach((li) => li.classList.toggle("selected", Number(li.dataset.index) === i));
  $("#q-submit").disabled = false;
}

function submitAnswer() {
  if (selected === null || answeredCurrent) return;
  answeredCurrent = true;
  const q = quizSet[index];
  const correct = judge(q, selected);
  record(q.id, selected, correct);

  const ol = $("#q-choices");
  ol.classList.add("locked");
  ol.querySelectorAll("li").forEach((li) => {
    const i = Number(li.dataset.index);
    li.classList.remove("selected");
    if (i === q.answerIndex) li.classList.add("correct");
    else if (i === selected) li.classList.add("wrong");
  });

  const judgeEl = $("#q-judge");
  judgeEl.textContent = correct ? "正解" : "不正解";
  judgeEl.className = "result-head " + (correct ? "ok" : "ng");
  $("#q-explanation").textContent = q.explanation || "";
  $("#q-reference").textContent = q.reference ? `根拠: ${q.reference}` : "";
  renderColumns(q.columns);

  $("#q-result").classList.remove("hidden");
  $("#q-submit").classList.add("hidden");
  const next = $("#q-next");
  next.textContent = index + 1 < quizSet.length ? "次の問題へ" : "結果を見る";
  next.classList.remove("hidden");
}

// 解説下部の具体例コラム（任意個数。なければ何も表示しない）
function renderColumns(columns) {
  const el = $("#q-columns");
  el.innerHTML = "";
  if (!Array.isArray(columns) || columns.length === 0) return;
  for (const col of columns) {
    if (!col || (!col.title && !col.body)) continue;
    const box = document.createElement("div");
    box.className = "column";
    if (col.title) {
      const h = document.createElement("h4");
      h.textContent = col.title;
      box.appendChild(h);
    }
    if (col.body) {
      const p = document.createElement("p");
      p.textContent = col.body;
      box.appendChild(p);
    }
    el.appendChild(box);
  }
}

function nextQuestion() {
  if (index + 1 < quizSet.length) {
    index += 1;
    renderQuestion();
    window.scrollTo(0, 0);
  } else {
    renderStats();
  }
}

/* ---------- 統計 ---------- */
function renderStats() {
  const s = summarize(questions);
  const container = $("#stats-categories");
  container.innerHTML = "";

  for (const [cat, label] of Object.entries(categoryLabel)) {
    const c = s.byCategory[cat] || { total: 0, answered: 0, correct: 0 };
    const rate = c.answered ? Math.round((c.correct / c.answered) * 100) : 0;
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${label}</span>
        <span>${c.answered ? rate + "%" : "未回答"} <small>(${c.answered}/${c.total})</small></span>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${rate}%"></div></div>`;
    container.appendChild(row);
  }
  show("stats");
}

/* ---------- イベント ---------- */
function bind() {
  // 出題ボタンはイベント委譲で扱う。カテゴリ別ボタンは問題更新時に再生成されるため、
  // 個別に addEventListener せず親要素で受ける。
  $(".menu").addEventListener("click", (e) => {
    const btn = e.target.closest(".menu-btn");
    if (!btn || btn.disabled) return;
    startQuiz(btn.dataset.mode, btn.dataset.category);
  });
  $("#tg-unanswered").addEventListener("change", renderCounts);
  $("#tg-wrong").addEventListener("change", renderCounts);
  $("#to-stats").addEventListener("click", renderStats);
  $("#refresh-data").addEventListener("click", refreshData);
  $("#quiz-back").addEventListener("click", renderHome);
  $("#stats-back").addEventListener("click", renderHome);
  $("#q-submit").addEventListener("click", submitAnswer);
  $("#q-next").addEventListener("click", nextQuestion);
  $("#reset-progress").addEventListener("click", () => {
    if (confirm("この端末の回答履歴をすべて消去します。よろしいですか？")) {
      reset();
      renderStats();
    }
  });
}

/* ---------- 問題の更新 ---------- */
// iOS のホーム画面アプリ（standalone）ではページのリロードができないため、
// キャッシュを無視して問題データを取得し直し、ホームを再構築する。
async function refreshData() {
  const btn = $("#refresh-data");
  const status = $("#refresh-status");
  const prevCount = questions.length;
  btn.disabled = true;
  status.textContent = "更新中…";
  status.className = "refresh-status";
  try {
    categories = await loadCategories({ force: true });
    questions = await loadQuestions({ force: true });
    categoryLabel = Object.fromEntries(
      categories.filter((c) => c.implemented).map((c) => [c.category, c.label])
    );
    renderCategoryMenu();
    renderHome();
    const diff = questions.length - prevCount;
    status.textContent =
      diff > 0
        ? `更新しました（+${diff}問・全${questions.length}問）`
        : `最新です（全${questions.length}問）`;
    status.className = "refresh-status ok";
  } catch (e) {
    status.textContent = "更新に失敗しました。通信状況を確認してください。";
    status.className = "refresh-status ng";
  } finally {
    btn.disabled = false;
  }
}

/* ---------- 初期化 ---------- */
async function init() {
  try {
    categories = await loadCategories();
    questions = await loadQuestions();
  } catch (e) {
    $("#app").innerHTML = `<p class="empty-msg">${e.message}</p>`;
    return;
  }
  categoryLabel = Object.fromEntries(
    categories.filter((c) => c.implemented).map((c) => [c.category, c.label])
  );
  renderCategoryMenu();
  bind(); // カテゴリ別ボタン生成後に bind し、生成ボタンにも click を付与する
  renderHome();
}

init();
