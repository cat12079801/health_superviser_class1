// 問題データ（data/index.json と各カテゴリファイル）を検証する。
// エラーがあれば終了コード 1 で終了する。依存パッケージは不要。
// 実行: node scripts/validate-questions.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = "data";

// category とファイル名・id 接頭辞の対応（docs/categories.md に準拠）
const CATEGORY_PREFIX = {
  law_hazardous: "law-haz",
  law_general: "law-gen",
  hygiene_hazardous: "hyg-haz",
  hygiene_general: "hyg-gen",
  physiology: "phys",
};

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    err(`JSON パース失敗: ${path} (${e.message})`);
    return null;
  }
}

// マニフェスト
const indexPath = join(DATA_DIR, "index.json");
if (!existsSync(indexPath)) err(`${indexPath} が存在しない`);
const manifest = existsSync(indexPath) ? readJson(indexPath) : null;
const files = manifest && Array.isArray(manifest.files) ? manifest.files : [];
if (manifest && !Array.isArray(manifest.files)) err(`index.json に files 配列がない`);

// マニフェスト未登録のデータファイル検出
if (existsSync(DATA_DIR)) {
  for (const f of readdirSync(DATA_DIR)) {
    if (f.endsWith(".json") && f !== "index.json" && !files.includes(f)) {
      warn(`data/${f} は index.json に登録されていない`);
    }
  }
}

const seenIds = new Map(); // id -> file
let total = 0;

for (const file of files) {
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) {
    err(`index.json が参照する ${path} が存在しない`);
    continue;
  }
  const data = readJson(path);
  if (!data) continue;
  if (!Array.isArray(data.questions)) {
    err(`${file}: questions 配列がない`);
    continue;
  }
  const expectedCategory = file.replace(/\.json$/, ""); // ファイル名 == category

  data.questions.forEach((q, i) => {
    total++;
    const at = `${file}[${i}]${q && q.id ? ` id=${q.id}` : ""}`;
    if (!q || typeof q !== "object") {
      err(`${at}: オブジェクトでない`);
      return;
    }

    // id
    if (typeof q.id !== "string" || !q.id.trim()) {
      err(`${at}: id が不正`);
    } else if (seenIds.has(q.id)) {
      err(`id 重複: ${q.id}（${seenIds.get(q.id)} と ${file}）`);
    } else {
      seenIds.set(q.id, file);
    }

    // category とファイル名の一致 / 既知の category か
    if (q.category !== expectedCategory) {
      err(`${at}: category(${q.category}) がファイル名(${expectedCategory})と一致しない`);
    }
    if (!CATEGORY_PREFIX[q.category]) {
      err(`${at}: 未知の category(${q.category})`);
    }

    // id 接頭辞と category の整合
    const prefix = CATEGORY_PREFIX[q.category];
    if (prefix && typeof q.id === "string" && !q.id.startsWith(prefix + "-")) {
      err(`${at}: id が category の接頭辞(${prefix}-)で始まっていない`);
    }

    // question
    if (typeof q.question !== "string" || !q.question.trim()) {
      err(`${at}: question が空`);
    }

    // choices（五肢択一）
    if (!Array.isArray(q.choices)) {
      err(`${at}: choices が配列でない`);
    } else {
      if (q.choices.length !== 5) err(`${at}: choices が5つでない(${q.choices.length})`);
      if (q.choices.some((c) => typeof c !== "string" || !c.trim())) {
        err(`${at}: choices に空の選択肢がある`);
      }
    }

    // answerIndex
    if (!Number.isInteger(q.answerIndex)) {
      err(`${at}: answerIndex が整数でない`);
    } else if (Array.isArray(q.choices) && (q.answerIndex < 0 || q.answerIndex >= q.choices.length)) {
      err(`${at}: answerIndex(${q.answerIndex}) が選択肢の範囲外`);
    }

    // explanation
    if (typeof q.explanation !== "string" || !q.explanation.trim()) {
      err(`${at}: explanation が空`);
    }

    // tags（任意）
    if (q.tags !== undefined && (!Array.isArray(q.tags) || q.tags.some((t) => typeof t !== "string"))) {
      err(`${at}: tags は文字列の配列であること`);
    }

    // reference（任意）
    if (q.reference !== undefined && typeof q.reference !== "string") {
      err(`${at}: reference は文字列であること`);
    }

    // columns（任意）
    if (q.columns !== undefined) {
      if (!Array.isArray(q.columns)) {
        err(`${at}: columns が配列でない`);
      } else {
        q.columns.forEach((c, j) => {
          if (!c || typeof c !== "object") {
            err(`${at}: columns[${j}] が不正`);
          } else {
            if (typeof c.title !== "string" || !c.title.trim()) err(`${at}: columns[${j}].title が空`);
            if (typeof c.body !== "string" || !c.body.trim()) err(`${at}: columns[${j}].body が空`);
          }
        });
      }
    }
  });
}

console.log(`検証対象: ${files.length} ファイル / ${total} 問`);
for (const w of warnings) console.log(`WARN: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`ERROR: ${e}`);
  console.error(`\n検証失敗: ${errors.length} 件のエラー`);
  process.exit(1);
}
console.log(`検証成功: エラーなし${warnings.length ? `（警告 ${warnings.length} 件）` : ""}`);
