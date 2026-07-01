// 画面制御
import {
  load,
  record,
  reset,
  summarize,
  getAnswers,
  replaceAnswers,
  mergeAnswers,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
} from "./store.js";
import {
  loadQuestions,
  loadCategories,
  buildQuizSet,
  countQuestions,
  judge,
} from "./quiz.js";
import * as sync from "./sync.js";

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

let currentView = "home";
function show(name) {
  currentView = name;
  for (const [key, el] of Object.entries(views)) {
    el.classList.toggle("hidden", key !== name);
  }
  window.scrollTo(0, 0);
}

// 表示中のビューを再描画する。出題中は回答操作を妨げないため再描画しない。
function refreshCurrentView() {
  if (currentView === "home") renderHome();
  else if (currentView === "stats") renderStats();
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
  // ログイン中はこの1問をリモートへも反映する。失敗時は未反映フラグを立て、
  // オンライン復帰・フォアグラウンド復帰時の再同期（pushAll）で解消する。
  if (sync.getUser()) {
    const a = getAnswers()[q.id];
    sync.pushOne(q.id, a)
      .then(() => {
        if (!syncDirty) setSyncStatus("synced");
      })
      .catch(() => {
        syncDirty = true;
        setSyncStatus(navigator.onLine ? "error" : "offline");
      });
  }

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

// カテゴリ別正答率の下に、難（hard）/並（standard）/易（easy）別の正答率を表示する
function renderDifficultyRows(byDifficulty = {}) {
  return DIFFICULTIES.map((key) => {
    const d = byDifficulty[key] || { total: 0, answered: 0, correct: 0 };
    if (d.total === 0) return ""; // その難易度の問題がなければ行を出さない
    const rate = d.answered ? Math.round((d.correct / d.answered) * 100) : 0;
    return `
      <div class="diff-row">
        <span class="diff-name">${DIFFICULTY_LABEL[key]}</span>
        <div class="bar bar-sm"><div class="bar-fill" style="width:${rate}%"></div></div>
        <span class="diff-val">${d.answered ? rate + "%" : "未回答"} <small>(${d.answered}/${d.total})</small></span>
      </div>`;
  }).join("");
}

/* ---------- 統計 ---------- */
function renderStats() {
  const s = summarize(questions);
  const container = $("#stats-categories");
  container.innerHTML = "";

  for (const [cat, label] of Object.entries(categoryLabel)) {
    const c = s.byCategory[cat] || { total: 0, answered: 0, correct: 0, byDifficulty: {} };
    const rate = c.answered ? Math.round((c.correct / c.answered) * 100) : 0;
    const row = document.createElement("div");
    row.className = "cat-row";
    row.innerHTML = `
      <div class="cat-head">
        <span class="cat-name">${label}</span>
        <span>${c.answered ? rate + "%" : "未回答"} <small>(${c.answered}/${c.total})</small></span>
      </div>
      <div class="bar"><div class="bar-fill" style="width:${rate}%"></div></div>
      ${renderDifficultyRows(c.byDifficulty)}`;
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
  $("#reset-progress").addEventListener("click", async () => {
    if (!confirm("この端末の回答履歴をすべて消去します。よろしいですか？")) return;
    reset();
    // ログイン中はリモートの自ユーザ行も削除する
    if (sync.getUser()) {
      try {
        await sync.clearRemote();
        setSyncStatus("synced");
      } catch {
        // 失敗してもローカルはリセット済み。空の状態を再同期対象として印を付ける
        syncDirty = true;
        setSyncStatus(navigator.onLine ? "error" : "offline");
      }
    }
    renderStats();
  });

  // ログイン / ログアウト
  $("#login-btn").addEventListener("click", () => {
    sync.signIn().catch(() => {});
  });
  $("#logout-btn").addEventListener("click", () => {
    sync.signOut().catch(() => {});
  });

  // フォアグラウンド復帰時、ログイン中なら再同期する
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sync.getUser()) {
      setTimeout(syncFromRemote, 0);
    }
  });

  // オンライン復帰時に再同期し、未反映の回答を解消する
  window.addEventListener("online", () => {
    if (sync.getUser()) setTimeout(syncFromRemote, 0);
  });
  // オフライン化を検知したら表示に反映する
  window.addEventListener("offline", () => {
    if (sync.getUser()) setSyncStatus("offline");
  });
}

/* ---------- 認証・同期 ---------- */
// 認証状態に応じてヘッダの表示を切り替える。
function renderAuth(user) {
  if (!sync.isConfigured()) {
    $("#auth").hidden = true;
    return;
  }
  $("#auth").hidden = false;
  $("#login-btn").hidden = !!user;
  $("#logout-btn").hidden = !user;
  const userEl = $("#auth-user");
  userEl.hidden = !user;
  if (user) {
    userEl.textContent = user.email || user.user_metadata?.name || "ログイン中";
  } else {
    // ログアウト時は同期ステータスを消す
    $("#sync-status").hidden = true;
  }
}

// 認証状態が変化したときの処理。ログイン時はリモートと初回マージする。
function onAuthChange(user) {
  renderAuth(user);
  // auth コールバック内で Supabase を呼ぶとデッドロックしうるため遅延実行する
  if (user) setTimeout(syncFromRemote, 0);
}

// 同期状態の表示。正常時は何も出さず、問題のある状態のみ表示する。
// syncDirty: リモートへ未反映のローカル変更があるか（復帰時に再同期して解消する）。
let syncDirty = false;
let syncing = false;
function setSyncStatus(state) {
  const el = $("#sync-status");
  if (!sync.getUser()) {
    el.hidden = true;
    return;
  }
  const text = {
    syncing: "同期中…",
    synced: "",
    offline: "オフライン（後で同期する）",
    error: "同期できない（自動で再試行する）",
  }[state] || "";
  el.textContent = text;
  el.hidden = text === "";
  el.className = "sync-status" + (state === "error" ? " ng" : "");
}

// リモートの進捗をローカルと問題単位でマージし、双方へ書き戻す。
// 多重起動（ログイン・復帰・オンライン復帰の重複）を避け、通信失敗時も
// ローカルで継続する。pushAll は全回答を送るため、未反映の1問も併せて解消する。
async function syncFromRemote() {
  if (!sync.getUser() || syncing) return;
  if (!navigator.onLine) {
    setSyncStatus("offline");
    return;
  }
  syncing = true;
  setSyncStatus("syncing");
  try {
    const remote = await sync.pullRemote();
    const merged = mergeAnswers(getAnswers(), remote);
    replaceAnswers(merged);
    await sync.pushAll(merged); // ローカルにしかない回答をリモートへも反映する
    syncDirty = false;
    setSyncStatus("synced");
    refreshCurrentView();
  } catch {
    // 通信失敗・一時停止（無料枠）等。ローカルのまま継続し、復帰時に再同期する
    setSyncStatus(navigator.onLine ? "error" : "offline");
  } finally {
    syncing = false;
  }
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
  // 認証を初期化する。未設定・失敗時は onAuthChange(null) が呼ばれ、
  // 同期 UI は隠れたままローカルのみで動作する。
  sync.initAuth(onAuthChange).catch(() => renderAuth(null));
}

init();

// Service Worker を登録し、PWA としてのインストール・オフライン動作を有効化する。
// file:// で開いた場合は登録しない（SW は http/https でのみ動作する）。
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* 登録失敗時もアプリはネットワーク経由で通常どおり動作する */
    });
  });
}
