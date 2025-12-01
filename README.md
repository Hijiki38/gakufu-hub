# Gakufu-hub

> **⚠️ 移行計画中（2025-11-27）**
>
> 現在、AWS Amplify から素のAWSサーバレスアーキテクチャへの移行を計画中です。
> 以下に記載されている仕様は**現行版（Amplify使用）**であり、**将来変更される予定**です。
> 移行計画の詳細は [docs/migration_plan_aws_native.md](docs/migration_plan_aws_native.md) を参照してください。

---

> **現行仕様（変更予定）**
>
> **モバイル初段実装：React Native + Expo + Amplify Gen 2 (Code‑First)**
>
> **Web 対応：React Native for Web** で同一コードをブラウザ向けビルド
>
> **バックエンド：Amplify Gen 2** (CDK ベース) に Auth / Storage / API / Function を定義

---

## 1. 概要

Gakufu-hub は、楽譜 PDF をクラウドに保存し、**バージョン管理・差分可視化・手書き注釈** をワンストップで提供するアプリです。

* **S3 + 命名規則による履歴管理**: `data/{work}/{part}/{timestamp}-{filename}` で曲・パートごとにバージョンを保存。
* **差分抽出 Lambda** が最新と直前の PDF を比較し、`data/{work}/{part}/diff/..._diff.pdf` にハイライトを出力。
* **注釈エディタ PoC** が Expo/React Native で動作し、pdf.js 表示上にストロークを描いて PDF に焼き込み、そのまま差分フローへ連携。
* モバイル＆Web 共通コードベース (Expo) によりマルチデバイスで利用可能。
* **弦楽セクション対応**: Vn1/Vn2/Va/Vc/Cb のパートごとに楽譜を階層管理し、将来的にパート間連携機能も実装予定。

### 1.2 ユーザーストーリー (抜粋)

| ID    | ストーリー                                              | 優先度 | 実装状況 (2025-11) |
| ----- | --------------------------------------------------- | --- | ------------------ |
| US‑01 | パートリーダーは楽譜をアップロードして保存できる           | ★★★ | ✅ `UploadSection` で運用中 |
| US‑02 | 楽譜のバージョン差分をページ別に閲覧できる                | ★★★ | 🔄 単ページ差分 (diff PDF) まで PoC 完了 |
| US‑03 | 楽譜を他メンバーと共有し、コメントを残せる                | ★★☆ | ⏳ 未着手 |
| US‑04 | オフラインでも直近の譜面を閲覧できる                     | ★★☆ | ⏳ 未着手 |
| US‑05 | Web 版でも同様にアップロード／閲覧ができる                | ★★☆ | 🔄 Expo Web で PoC 表示を確認中 |
| US‑06 | 楽譜にボウイングや注釈を手書きで追加できる                | ★★★ | 🔄 PoC で注釈保存→差分連携を確認中 |

---

## 2. 機能ロードマップ

| フェーズ           | 機能                                      | 技術 / 備考                         |
| -------------- | --------------------------------------- | ------------------------------- |
| **MVP (v0.1)** | ユーザー登録 (Cognito) / 楽譜アップロード / バージョン自動管理 | Amplify Auth / Storage (S3)     |
|                | 差分抽出 (単ページ)                             | Lambda (Python + OpenCV.js)     |
| **v0.2**       | 複数ページ差分 / Web Viewer                    | React Native for Web, PDF.js    |
|                | 階層的フォルダ構成（曲→パート階層）                     | S3パス構造変更、UI 3段階ナビゲーション         |
|                | 共有リンク・アクセス権                             | S3 PresignedUrl, DynamoDB ACL   |
| **v0.3**       | コメント＆注釈保存                               | AppSync GraphQL + DynamoDB      |
|                | オフラインキャッシュ                              | Amplify DataStore               |
| **v1.0**       | モバイル & Web 正式リリース、CI/CD, E2E テスト        | Amplify Hosting, GitHub Actions |
| **v1.x (将来計画)** | パート間連携機能（他パートのボウイング参照）                | DynamoDB メタデータ層、フレーズタグ付け      |
|                | パート間フレーズ差分表示                            | 拡張diff Lambda、クロスパート比較UI       |

---

## 3. アーキテクチャ

1. ユーザーが新規 PDF を `data/{repo}/` へアップロード (`UploadSection` またはエディタ保存)。
2. 既存バージョンが 1 件以上ある場合、API Gateway → `diffFunction` → Python コンテナ Lambda (`diff-py-function`) の流れで差分計算を開始。
3. Lambda が直前の PDF と比較し、差分ハイライトを描画した PDF を生成。
4. 結果ファイルを `data/{repo}/diff/{basename}_diff.pdf` へ保存し、キーをレスポンスで返却。
5. クライアントはレスポンスを UI に表示し、ユーザーが差分を辿れるようにする（今後、ビューワ連携予定）。

### 3.1 現在のワークフロー (2025-11 PoC)

| フロー | ステップ | 主要ファイル / API |
| --- | --- | --- |
| **アップロード** | 1. `UploadSection` で曲選択 → パート選択（vn1/vn2/va/vc/cb）→ DocumentPicker で PDF 選択<br>2. `uploadData` で `data/{work}/{part}/{timestamp}-{filename}` へ PUT<br>3. 既存ファイルがあれば `post({ apiName: "diffApiv2", path: "diff" })` | `App.tsx`, `docs/feature_uploading.md` |
| **手書き注釈 (PoC)** | 1. 「Open Editor (PoC)」で `ScoreEditorPoc` モーダルを表示<br>2. pdf.js + WebView で 1 ページ目をレンダリングし、SVG でストローク記録 (AsyncStorage キャッシュ)<br>3. `Save (PoC)` で PDF にストロークを焼き込み `basename-annotated-{ISO}` としてアップロード<br>4. 同じ diff API を同期呼び出し、結果キーを UI に表示 | `src/editor/ScoreEditorPoc.tsx`, `docs/feature_editing.md` |
| **差分 Lambda** | 1. Node ランタイム (`diffFunction`) が Python Lambda を `InvokeCommand` でコール<br>2. Python 側で最新と旧版のページを PNG 化し、差分 (グレースケール→赤チャネル) を生成<br>3. S3 に `_diff.pdf` を保存し、キーをレスポンス | `amplify/functions/diff-function/*`, `lambda_py/app.py` |

### 3.2 接続要件

- `amplify_outputs.json` の `custom.API` に差分 API（例: `diffApiv2`）が出力されていること。エディタ側は自動的に最初のエントリを使用しますが、名前が一致しないと `InvalidApiName` 例外になります。
- `Amplify.configure` 側でも同じ API 名で REST エンドポイントを登録しておく必要があります。`App.tsx` の初期化を参照してください。
- Python Lambda には `BUCKET_NAME` と `PY_FN_NAME` 環境変数が渡されている想定です。差分を無効化したい場合は API 呼び出し前に `DIFF_API_NAME` を `null` 扱いにするか、`amplify_outputs.json` を更新してください。

### 3.3 階層的フォルダ構成（弦楽セクション対応）

Gakufu-hub は、オーケストラの弦楽セクション（Vn1, Vn2, Va, Vc, Cb）における楽譜管理を想定し、**曲ごとにパート別のサブフォルダを持つ階層構造**を採用します。

#### ストレージパス規約

```
data/{work}/{part}/{timestamp}-{filename}.pdf

例:
data/beethoven-symphony-5/vn1/1699876543210-score.pdf
data/beethoven-symphony-5/vn2/1699876543211-score.pdf
data/beethoven-symphony-5/va/1699876543212-score.pdf
data/beethoven-symphony-5/vc/1699876543213-score.pdf
data/beethoven-symphony-5/cb/1699876543214-score.pdf
```

**パラメータ定義:**
- `{work}`: 曲名またはリポジトリ名（例: `beethoven-symphony-5`, `brahms-violin-concerto`）
- `{part}`: パート識別子（短縮形を使用）
  - `vn1`: Violin 1（第1バイオリン）
  - `vn2`: Violin 2（第2バイオリン）
  - `va`: Viola（ビオラ）
  - `vc`: Cello（チェロ）
  - `cb`: Contrabass（コントラバス）
- `{timestamp}`: アップロード時刻（`Date.now()`）
- `{filename}`: 元ファイル名

#### 設計方針

1. **パート独立管理**
   - 各パート（vn1, vn2, va, vc, cb）は独立した楽譜を持ち、バージョン履歴もパートごとに管理
   - 同じ曲内でもパート間で異なるPDFファイルが存在する前提

2. **バージョン管理とdiff生成**
   - **現在の実装対象**: 同一パート内での版の変化（例: vn1の楽譜v1とv2の差分）
   - 最新アップロードと直前のアップロードを比較し、`data/{work}/{part}/diff/{basename}_diff.pdf` に差分を保存
   - **将来の拡張**: パート間でのフレーズ比較機能（他パートのボウイング参照など）

3. **UIワークフロー**
   - **曲選択 → パート選択 → PDF選択** の3段階ナビゲーション
   - リポジトリ一覧では曲（work）のタイルを表示
   - 曲選択後、パート選択画面でvn1/vn2/va/vc/cbから選択
   - パート選択後、該当パートの楽譜バージョン一覧を表示

4. **パート間連携の余地**
   - 将来的に「同じフレーズを弾いている他パートのボウイングを参考にする」機能を実装するため、以下を考慮:
     - S3パス構造はパート間の横断検索を可能にする設計（`data/{work}/` 配下に全パートが並列）
     - メタデータ層の追加（DynamoDBなど）でフレーズ単位のタグ付けや関連付けを可能にする余地

#### 影響範囲と実装タスク

階層構造への移行には以下のファイル・機能の更新が必要です:

| コンポーネント | 更新内容 | ファイルパス |
|---|---|---|
| **リポジトリ一覧** | `list({ path: "data/" })` のパース処理を3階層対応に変更 | [App.tsx](App.tsx) |
| **アップロード処理** | パート選択UIの追加、パスを `data/{work}/{part}/` に更新 | [App.tsx](App.tsx) |
| **エディタPoC** | `list()` と `computeNewKey()` をパート対応に更新 | [src/editor/ScoreEditorPoc.tsx](src/editor/ScoreEditorPoc.tsx) |
| **差分Lambda** | S3キーのパース処理を3階層対応に変更 | [amplify/functions/diff-function/handler.ts](amplify/functions/diff-function/handler.ts), [lambda_py/app.py](lambda_py/app.py) |
| **ストレージ権限** | パス構造変更に伴う権限設定の見直し（必要に応じて） | [amplify/storage/resource.ts](amplify/storage/resource.ts) |

#### 既存データの移行

現在の `data/{repo}/` 構造から新構造へ移行する際は、以下の戦略を検討:
- 既存リポジトリを「デフォルトパート」（例: `vn1`）に自動移行
- または、手動で新規リポジトリとして再アップロード

詳細な移行計画は別途 `docs/migration_to_hierarchical.md` に記載予定。


## 4. 開発環境

* **Node.js:** 24.x
* **npm:** 11.3.0
* **AWS CLI:**


### Quick Start

```bash
# 1. Nodeを入れる
nvm install 24
nvm use 24

# 2. 依存を入れる
npm ci

# 3. Amplify Gen2 をローカルプレビュー
npx amplify sandbox

# 4. Expo デバッグ (エディタ PoC を含む)
npx expo prebuild     # iOS/Android ネイティブ生成
npx expo run:ios      # or run:android
# Web で PoC を見る場合
npx expo start --web
```

### Amplify と並行で AWS CDK を試す手順（移行準備）
- ブランチ作成: `git switch -c chore/aws-native-phase0`
- CDK 初期化済み: `cd infrastructure && npm run build && npx cdk synth`
- デプロイ対象環境は `STAGE` / `CDK_DEFAULT_ACCOUNT` / `CDK_DEFAULT_REGION` で切替
- Lambda/API/Storage の実装は Phase1 以降で `infrastructure/lib/` にスタックを追加予定

---

## 5. デプロイ環境

| ターゲット           | 手段                                | 備考                                     |
| --------------- | --------------------------------- | -------------------------------------- |
| **Web**         | Amplify Hosting (S3 + CloudFront) | Preview Branch 自動発行                    |
| **iOS/Android** | EAS Build & Submit                | TestFlight / Google Play 内部テスト         |
| **Backend**     | Amplify Gen2 CI (GitHub Actions)  | `amplify push` → CloudFormation スタック更新 |

---

## 6. 開発フロー

1. **Issue 立案** → GitHub Projects (Kanban)
2. **Feature Branch** で実装
3. PR 作成 → **GitHub Actions** で Lint/Test/Preview URL
4. QA OK で `main` にマージ → Amplify / EAS Production デプロイ

---

## 7. ライセンス

MIT
