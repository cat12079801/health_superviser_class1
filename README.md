# 第一種衛生管理者 関係法令 一問一答

第一種衛生管理者試験の **関係法令科目** を学習する一問一答 Web アプリ。
バックエンド不要の静的サイトで、iPad / iPhone / Android のブラウザで動作する。

## 機能

- 五肢択一の一問一答を出題し、1問ごとに正誤判定と解説を表示する。
- 出題モードとして、全問・カテゴリ別（有害業務に係るもの／有害業務以外のもの）・復習（不正解・未回答のみ）の3種類を用意する。
- 端末ごとの学習記録を `localStorage` で管理し、カテゴリ別正答率の表示と進捗リセットに対応する。

## ローカルでの動作確認

`fetch` を使うため file:// では動かない。簡易サーバで開く。

```sh
python3 -m http.server 8000
# http://localhost:8000 をブラウザで開く
```

## デプロイ（GitHub Pages）

1. このリポジトリを push。
2. GitHub の Settings → Pages → Source を `Deploy from a branch`、Branch を `main` / `/ (root)` に設定。
3. 発行された URL にアクセス。

ビルド工程はない。`main` に push するだけで反映される。

## 問題の追加・更新

問題は [`data/questions.json`](data/questions.json) で管理する。`questions` 配列に1問1オブジェクトで追加する。

```json
{
  "id": "law-haz-007",
  "category": "law_hazardous",
  "tags": ["安衛法", "作業主任者"],
  "question": "設問文（五肢択一）。",
  "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4", "選択肢5"],
  "answerIndex": 0,
  "explanation": "解説本文。",
  "reference": "根拠条文（任意）"
}
```

| フィールド | 内容 |
|------------|------|
| `id` | 一意なID。`law-haz-xxx`（有害業務) / `law-gen-xxx`（有害業務以外）の連番。**既存IDは変更しない**（学習履歴の紐付けが切れるため) |
| `category` | `law_hazardous` または `law_general` |
| `tags` | 法令名などの配列（任意) |
| `question` | 設問文 |
| `choices` | 選択肢の配列（通常5つ。組合せ問題は組合せ文を選択肢に書く) |
| `answerIndex` | 正解の選択肢インデックス（**0始まり**) |
| `explanation` | 解説 |
| `reference` | 根拠条文（任意) |

Claude に「`data/questions.json` に〇〇の問題を追加して」と依頼すれば、このスキーマに沿って追記できる。

`category` / `id` / `tags` の命名規則と、未実装科目（労働衛生・労働生理）への拡張方針は [docs/categories.md](docs/categories.md) に定める。

## 免責

本アプリは学習用であり、内容の正確性・最新性を保証しない。法令は改正される。
実際の受験対策にあたっては、必ず最新の法令および公的情報を確認すること。
問題・解説は法令等を一次情報として作成したオリジナルであり、特定の市販問題集の転載ではない。
