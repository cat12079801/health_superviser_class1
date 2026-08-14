// 問題の文量（問題文・選択肢の文字数）を計測する。依存パッケージは不要。
// CLAUDE.md「難易度 > 文量」で定めた目安に対する達成状況を表示する。
//
// 既定は集計を表示するだけで終了コード 0 で終わる。既存問題は本基準の制定前に作成しており、
// 遡って基準を満たす必要がないためである。--check を付けたときだけ下限判定を行い、
// 下回れば終了コード 1 で終了する。新規追加分だけを対象に --check を使う。
//
// 実行例:
//   node scripts/measure-length.mjs                                      // 全問の集計
//   node scripts/measure-length.mjs --category physiology --last 50 --check
//   node scripts/measure-length.mjs --difficulty hard --json
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = "data";

// 本番（安全衛生技術試験協会の公表問題 2025年4月・2025年10月公表、計88問440選択肢）の
// 実測値を 1.15 倍した値を目安とする。試験勉強用であり、本番より 1.5 割増しの文量を狙うためである。
const TARGET = {
  stemMedian: 47, // 本番の中央値 41字
  choiceMean: 51, // 本番の平均 44.7字
  totalMean: 332, // 本番の平均 288.4字
  longChoiceLen: 58, // 本番の閾値 50字
  longChoiceRatio: 0.4, // 本番 40.7%
  longStemLen: 115, // 本番の閾値 100字
  longStemRatio: 0.1, // 本番 11.4%
};

// --check の判定に用いる下限。目安をわずかに下回る程度は許容する。
const MIN = { stemMedian: 45, choiceMean: 48, totalMean: 320 };

// --- 引数 ---------------------------------------------------------------
const argv = process.argv.slice(2);
const opt = { categories: null, last: null, difficulty: null, check: false, json: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  const next = () => {
    const v = argv[++i];
    if (v === undefined) {
      console.error(`ERROR: ${a} に値が必要である`);
      process.exit(2);
    }
    return v;
  };
  if (a === "--category" || a === "-c") opt.categories = next().split(",").map((s) => s.trim()).filter(Boolean);
  else if (a === "--last" || a === "-n") opt.last = Number(next());
  else if (a === "--difficulty" || a === "-d") opt.difficulty = next();
  else if (a === "--check") opt.check = true;
  else if (a === "--json") opt.json = true;
  else if (a === "--help" || a === "-h") {
    console.log(
      [
        "使い方: node scripts/measure-length.mjs [options]",
        "  -c, --category <a,b>   対象カテゴリを絞る（既定は実装済みの全カテゴリ）",
        "  -n, --last <N>         各カテゴリの末尾 N 問だけを対象とする（新規追加分の確認用）",
        "  -d, --difficulty <d>   difficulty で絞る（hard / standard / easy）",
        "      --check            目安の下限を下回れば終了コード 1 で終了する",
        "      --json             集計を JSON で出力する",
      ].join("\n"),
    );
    process.exit(0);
  } else {
    console.error(`ERROR: 不明な引数: ${a}`);
    process.exit(2);
  }
}
if (opt.last !== null && (!Number.isInteger(opt.last) || opt.last <= 0)) {
  console.error("ERROR: --last には正の整数を指定すること");
  process.exit(2);
}
if (opt.difficulty !== null && !["hard", "standard", "easy"].includes(opt.difficulty)) {
  console.error(`ERROR: --difficulty は hard / standard / easy のいずれかであること（現在: ${opt.difficulty}）`);
  process.exit(2);
}

// --- 読み込み -----------------------------------------------------------
function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    console.error(`ERROR: JSON パース失敗: ${path} (${e.message})`);
    process.exit(2);
  }
}

const catDef = readJson(join(DATA_DIR, "categories.json"));
let targets = (catDef.categories || []).filter((c) => c && c.implemented);
if (opt.categories) {
  const known = new Set(targets.map((c) => c.category));
  for (const c of opt.categories) {
    if (!known.has(c)) {
      console.error(`ERROR: 未知または未実装のカテゴリ: ${c}`);
      process.exit(2);
    }
  }
  targets = targets.filter((c) => opt.categories.includes(c.category));
}

// 文字数は空白を除いて数える。本番の PDF から実測した際と条件を揃えるためである。
const len = (s) => s.replace(/\s+/g, "").length;

const groups = [];
for (const c of targets) {
  const path = join(DATA_DIR, c.file);
  if (!existsSync(path)) {
    console.error(`ERROR: ${path} が存在しない`);
    process.exit(2);
  }
  let qs = readJson(path).questions || [];
  if (opt.difficulty) qs = qs.filter((q) => q.difficulty === opt.difficulty);
  if (opt.last !== null) qs = qs.slice(-opt.last);
  if (qs.length) groups.push({ category: c.category, label: c.label || c.category, questions: qs });
}

if (!groups.length) {
  console.error("ERROR: 対象の問題が 0 問である");
  process.exit(2);
}

// --- 集計 ---------------------------------------------------------------
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function summarize(label, questions) {
  const stems = questions.map((q) => len(q.question));
  const choices = questions.flatMap((q) => q.choices.map(len));
  const totals = questions.map((q) => len(q.question) + q.choices.reduce((a, c) => a + len(c), 0));
  return {
    label,
    n: questions.length,
    stemMean: mean(stems),
    stemMedian: median(stems),
    choiceMean: mean(choices),
    choiceMedian: median(choices),
    totalMean: mean(totals),
    longChoiceRatio: choices.filter((x) => x >= TARGET.longChoiceLen).length / choices.length,
    longStemRatio: stems.filter((x) => x > TARGET.longStemLen).length / stems.length,
  };
}

const rows = groups.map((g) => summarize(g.label, g.questions));
const all = summarize("全体", groups.flatMap((g) => g.questions));

// --- 出力 ---------------------------------------------------------------
if (opt.json) {
  console.log(JSON.stringify({ target: TARGET, min: MIN, categories: rows, overall: all }, null, 2));
} else {
  // 全角を2桁として幅を合わせる
  const width = (s) => [...s].reduce((w, ch) => w + (/[　-ヿ一-鿿！-｠]/.test(ch) ? 2 : 1), 0);
  const pad = (s, w) => s + " ".repeat(Math.max(0, w - width(s)));
  const padL = (s, w) => " ".repeat(Math.max(0, w - width(s))) + s;

  const cond = [
    opt.categories ? `カテゴリ=${opt.categories.join(",")}` : null,
    opt.last !== null ? `末尾${opt.last}問` : null,
    opt.difficulty ? `difficulty=${opt.difficulty}` : null,
  ].filter(Boolean);
  console.log(`計測対象: ${all.n} 問${cond.length ? `（${cond.join(" / ")}）` : ""}`);
  console.log("");

  const head =
    pad("カテゴリ", 16) +
    padL("n", 6) +
    padL("問題文平均", 12) +
    padL("中央", 6) +
    padL("選択肢平均", 12) +
    padL("中央", 6) +
    padL("1問合計", 10) +
    padL(`${TARGET.longChoiceLen}字以上`, 10) +
    padL(`${TARGET.longStemLen}字超`, 9);
  console.log(head);
  console.log("-".repeat(width(head)));
  const line = (r) =>
    pad(r.label, 16) +
    padL(String(r.n), 6) +
    padL(r.stemMean.toFixed(1), 12) +
    padL(String(r.stemMedian), 6) +
    padL(r.choiceMean.toFixed(1), 12) +
    padL(String(r.choiceMedian), 6) +
    padL(r.totalMean.toFixed(1), 10) +
    padL(`${(r.longChoiceRatio * 100).toFixed(1)}%`, 10) +
    padL(`${(r.longStemRatio * 100).toFixed(1)}%`, 9);
  for (const r of rows) console.log(line(r));
  console.log("-".repeat(width(head)));
  console.log(line(all));
  console.log("");
  console.log(
    `目安（本番実測の1.15倍）: 問題文中央値 ${TARGET.stemMedian}字 / 選択肢平均 ${TARGET.choiceMean}字 / ` +
      `1問合計 ${TARGET.totalMean}字 / ${TARGET.longChoiceLen}字以上の選択肢 ${(TARGET.longChoiceRatio * 100).toFixed(0)}% / ` +
      `${TARGET.longStemLen}字超の設問 ${(TARGET.longStemRatio * 100).toFixed(0)}%`,
  );
}

// --- 判定 ---------------------------------------------------------------
if (!opt.check) process.exit(0);

const failures = [];
const notes = [];
const check = (key, actual, unit = "字") => {
  if (actual < MIN[key]) {
    failures.push(`${key}: ${actual.toFixed(1)}${unit}（下限 ${MIN[key]}${unit} / 目安 ${TARGET[key]}${unit}）`);
  }
};
check("stemMedian", all.stemMedian);
check("choiceMean", all.choiceMean);
check("totalMean", all.totalMean);
if (all.longChoiceRatio < TARGET.longChoiceRatio) {
  notes.push(
    `${TARGET.longChoiceLen}字以上の選択肢が ${(all.longChoiceRatio * 100).toFixed(1)}% しかない（目安 ${(TARGET.longChoiceRatio * 100).toFixed(0)}%）`,
  );
}
if (all.longStemRatio < TARGET.longStemRatio) {
  notes.push(
    `${TARGET.longStemLen}字超の前提条件つき設問が ${(all.longStemRatio * 100).toFixed(1)}% しかない（目安 ${(TARGET.longStemRatio * 100).toFixed(0)}%）`,
  );
}

if (!opt.json) {
  for (const n of notes) console.log(`WARN: ${n}`);
  if (failures.length) {
    for (const f of failures) console.error(`ERROR: ${f}`);
    console.error(`\n文量チェック失敗: ${failures.length} 件が下限を下回る`);
  } else {
    console.log(`\n文量チェック成功${notes.length ? `（警告 ${notes.length} 件）` : ""}`);
  }
}
process.exit(failures.length ? 1 : 0);
