楽譜差分抽出は Amplify Functions で構成された二段構えの Lambda により実行される。REST API エントリポイントは Node.js の `diff-function` が担当し、同一スタックでデプロイされる Python コンテナ (`lambda_py/app.py`) を同期呼び出しして PDF 差分 PDF を生成する。

### 対象ユーザー・利用場面
対象: バージョン差分を確認したいメンバー、編集結果を共有するパートリーダー。
利用シーン: 新しい譜面をアップロード後、直前バージョンとの差分を確認し、修正ポイントを赤ハイライト付き PDF として配布する。

### 処理フロー
1. クライアント (`App.tsx` または `ScoreEditorPoc`) から REST API `POST /diff` に `{ repo, key }` を送信。
2. Node Lambda (`amplify/functions/diff-function/handler.ts`) が `PY_FN_NAME` 環境変数で指定された Python 関数を `InvokeCommand` で同期呼び出し。
3. Python Lambda (`lambda_py/app.py`)
   - `data/{repo}/` から最新 (`key`) と直前の PDF を S3 から取得。
   - PyMuPDF でページ毎にレンダリングし、Pillow で差分（グレースケール→閾値→赤チャンネル強調）を作成。
   - 差分ページを PDF に再結合し、`data/{repo}/diff/{basename}_diff.pdf` として `put_object`。
   - JSON で `ok`, `diff.key`, `pageCount` などを返却。
4. Node Lambda が Python 結果をそのまま API レスポンスとして返し、クライアントはステータス表示や再読込に利用。

### エラーハンドリング
- 前バージョンが存在しない場合は Python 側で `ValueError("No previous score available for comparison")` を返し、クライアントは差分未生成メッセージを表示。
- ページ数不一致時も例外とし差分生成を中断。
- AWS エラー (`ClientError`, `BotoCoreError`) は `error` と `key` 情報付きで返却、フロントはログ出力。

### インフラ構成と権限
- `amplify/backend.ts` で Node Lambda を HTTP API (API Gateway v2) に統合、IAM 認可を有効化し Auth/Unauth ロールへ `execute-api:Invoke` を付与。
- Python コンテナ Lambda は 1024 MB メモリ / 30 秒タイムアウト設定、S3 読み書き権限と `BUCKET_NAME` 環境変数を注入。
- Node Lambda には Python 関数への `lambda:InvokeFunction` 権限を付与。

### 非機能要件・今後の課題
- 現状は逐次比較（前バージョンとのみ）であり、多段比較や任意バージョン選択は未対応。
- 非同期化やジョブステータス管理は未実装。App では `Diffing...` 表示で即時結果を期待する同期設計。
- 差分感度（閾値20固定）・赤ハイライト表現の調整、マルチページ最適化（PyMuPDFレンダリング解像度制御）が改善余地。
