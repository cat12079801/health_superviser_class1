// store.js の migrateAnswers（旧スキーマ補完）を検証する。
// localStorage に依存しない純関数のみを対象とする。依存パッケージは不要。
// 実行: node scripts/test-store-migration.mjs
import { migrateAnswers, EPOCH } from "../js/store.js";

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok: ${msg}`);
  } else {
    failed += 1;
    console.error(`  NG: ${msg}`);
  }
}

// 旧スキーマ（updatedAt 欠損）は EPOCH で補完する
{
  const out = migrateAnswers({
    "law-haz-001": { lastChoice: 1, correct: false, attempts: 3 },
  });
  const a = out["law-haz-001"];
  assert(a.updatedAt === EPOCH, "updatedAt 欠損は EPOCH で補完される");
  assert(a.lastChoice === 1 && a.correct === false && a.attempts === 3, "既存フィールドを保持する");
}

// 既存の updatedAt は上書きしない
{
  const ts = "2026-07-01T09:00:00.000Z";
  const out = migrateAnswers({
    "law-haz-002": { lastChoice: 0, correct: true, attempts: 1, updatedAt: ts },
  });
  assert(out["law-haz-002"].updatedAt === ts, "既存の updatedAt は保持される");
}

// attempts 欠損は 0 とする
{
  const out = migrateAnswers({ "x": { lastChoice: 2, correct: true } });
  assert(out["x"].attempts === 0, "attempts 欠損は 0 に補完される");
}

// 不正な入力は空オブジェクトを返す / 不正な要素は除外する
{
  assert(Object.keys(migrateAnswers(null)).length === 0, "null は空を返す");
  assert(Object.keys(migrateAnswers(undefined)).length === 0, "undefined は空を返す");
  const out = migrateAnswers({ good: { lastChoice: 0, correct: true }, bad: null });
  assert(!("bad" in out) && "good" in out, "不正な要素は除外する");
}

if (failed > 0) {
  console.error(`\n${failed} 件失敗した。`);
  process.exit(1);
}
console.log("\nすべて成功した。");
