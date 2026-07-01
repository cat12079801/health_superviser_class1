// store.js の mergeAnswers（問題単位マージ）を検証する。
// localStorage に依存しない純関数のみを対象とする。依存パッケージは不要。
// 実行: node scripts/test-merge-answers.mjs
import { mergeAnswers, EPOCH } from "../js/store.js";

let failed = 0;
function assert(cond, msg) {
  if (cond) {
    console.log(`  ok: ${msg}`);
  } else {
    failed += 1;
    console.error(`  NG: ${msg}`);
  }
}

const A = (lastChoice, correct, attempts, updatedAt) => ({ lastChoice, correct, attempts, updatedAt });
const T1 = "2026-07-01T09:00:00.000Z";
const T2 = "2026-07-01T10:00:00.000Z";

// 片方にしか存在しない id は保持される
{
  const out = mergeAnswers({ q1: A(0, true, 1, T1) }, { q2: A(1, false, 1, T1) });
  assert("q1" in out && "q2" in out, "両者の固有 id が残る");
}

// 両方に存在する id は updatedAt が新しい方を採用する
{
  const out = mergeAnswers({ q1: A(0, false, 1, T1) }, { q1: A(3, true, 1, T2) });
  assert(out.q1.lastChoice === 3 && out.q1.correct === true, "新しい updatedAt の回答が採用される");
}

// 引数の順序によらず新しい方を採用する
{
  const older = { q1: A(0, false, 1, T1) };
  const newer = { q1: A(3, true, 1, T2) };
  const o1 = mergeAnswers(older, newer);
  const o2 = mergeAnswers(newer, older);
  assert(o1.q1.lastChoice === 3 && o2.q1.lastChoice === 3, "順序を入れ替えても新しい方が勝つ");
}

// attempts は合算せず勝者の値を採る
{
  const out = mergeAnswers({ q1: A(0, true, 2, T1) }, { q1: A(1, true, 5, T2) });
  assert(out.q1.attempts === 5, "attempts は合算されず勝者の値になる");
}

// 別々の問題を解いた 2 端末の結果が両方残る（全消し事故が起きない）
{
  const deviceA = { q1: A(0, true, 1, T2), q2: A(1, false, 1, T1) };
  const deviceB = { q1: A(0, true, 1, T1), q3: A(2, true, 1, T1) };
  const out = mergeAnswers(deviceA, deviceB);
  assert(["q1", "q2", "q3"].every((k) => k in out), "3 問すべて残る");
  assert(out.q1.updatedAt === T2, "共通問題は新しい端末 A の回答が残る");
}

// updatedAt 欠損は EPOCH 扱いとなり、時刻を持つ方が勝つ
{
  const out = mergeAnswers(
    { q1: { lastChoice: 0, correct: false, attempts: 1 } },
    { q1: A(2, true, 1, T1) }
  );
  assert(out.q1.lastChoice === 2, "時刻を持つ回答が欠損（EPOCH）に勝つ");
  const out2 = mergeAnswers({ q1: { lastChoice: 9, correct: true, attempts: 1 } }, {});
  assert(out2.q1.updatedAt === EPOCH, "片側のみの欠損データは EPOCH で補完される");
}

// 同時刻は第 1 引数を優先する
{
  const out = mergeAnswers({ q1: A(0, true, 1, T1) }, { q1: A(4, false, 1, T1) });
  assert(out.q1.lastChoice === 0, "同時刻は第 1 引数側が採用される");
}

// 不正な入力でも例外を投げない
{
  assert(Object.keys(mergeAnswers(null, undefined)).length === 0, "null/undefined は空を返す");
}

if (failed > 0) {
  console.error(`\n${failed} 件失敗した。`);
  process.exit(1);
}
console.log("\nすべて成功した。");
