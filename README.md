# Gakufu-hub

> **モバイル初段実装：React Native + Expo + Amplify Gen 2 (Code‑First)**
>
> **Web 対応：React Native for Web** で同一コードをブラウザ向けビルド
>
> **バックエンド：Amplify Gen 2** (CDK ベース) に Auth / Storage / API / Function を定義

---

## 1. 概要

Gakufu-hub は、楽譜 PDF／画像をクラウドに保存し、**バージョン管理・差分可視化・共有** をワンストップで提供するアプリです。

* **クラウドストレージ (S3) のバージョニング** を活用 → 版ごとの履歴追跡が自動
* **差分抽出 Lambda** が譜面画像を比較し、変更箇所をハイライト
* モバイル＆Web 共通コードベース (Expo) によりマルチデバイスで利用可能

### 1.2 ユーザーストーリー (抜粋)

| ID    | ストーリー                    | 優先度 |
| ----- | ------------------------ | --- |
| US‑01 | パートリーダーは楽譜をアップロードして保存できる | ★★★ |
| US‑02 | 楽譜のバージョン差分をページ別に閲覧できる    | ★★★ |
| US‑03 | 楽譜を他メンバーと共有し、コメントを残せる    | ★★☆ |
| US‑04 | オフラインでも直近の譜面を閲覧できる       | ★★☆ |
| US‑05 | Web 版でも同様にアップロード／閲覧ができる  | ★★☆ |

---

## 2. 機能ロードマップ

| フェーズ           | 機能                                      | 技術 / 備考                         |
| -------------- | --------------------------------------- | ------------------------------- |
| **MVP (v0.1)** | ユーザー登録 (Cognito) / 楽譜アップロード / バージョン自動管理 | Amplify Auth / Storage (S3)     |
|                | 差分抽出 (単ページ)                             | Lambda (Python + OpenCV.js)     |
| **v0.2**       | 複数ページ差分 / Web Viewer                    | React Native for Web, PDF.js    |
|                | 共有リンク・アクセス権                             | S3 PresignedUrl, DynamoDB ACL   |
| **v0.3**       | コメント＆注釈保存                               | AppSync GraphQL + DynamoDB      |
|                | オフラインキャッシュ                              | Amplify DataStore               |
| **v1.0**       | モバイル & Web 正式リリース、CI/CD, E2E テスト        | Amplify Hosting, GitHub Actions |

---

## 3. システム構成 (Amplify Gen 2)

### 3.1 フロントエンド

* **モノレポ** (pnpm or npm workspaces)

  * `/apps/mobile` Expo (iOS/Android)
  * `/apps/web` Expo Web (React Native for Web)

### 3.2 Amplify Gen 2 Backend (Code‑First)

```
/amplify
├─ backend.ts               # CDK App Entrypoint
├─ auth/                    # Cognito UserPool / IdentityPool
├─ storage/                 # S3 バケット (versioning=true, CORS 設定)
├─ api/graphQL.ts           # AppSync スキーマ & Resolvers
├─ function/diffProcessor/  # Lambda (Docker) – OpenCV 差分抽出
└─ function/presignUrl/     # Lambda@Edge – DL 用署名 URL
```

* **Auth:** Cognito + OAuth (Google / Apple 可)
* **Storage:** S3 (Amplify Storage) – バケット毎に versioning 有効
* **API:** AppSync GraphQL (Code-First schema) → DynamoDB
* **Functions:**

  * `diffProcessor` (Python 3.12, OpenCV‑contrib, imagick)
  * `presignUrl` (Node.js) – 短命 URL 生成
* **Observability:** AWS CloudWatch Logs + X‑Ray; エラー通知 SNS → Slack

### 3.3 データベース

* **DynamoDB** テーブル (PK: `scoreId`, SK: `version`)

  * GSI1: `ownerId` でユーザー毎の一覧
  * GSI2: `shareToken` で共有リンク解決

### 3.4 画像処理パイプライン

1. ユーザーが新規 PDF をアップロード
2. S3 **ObjectCreated** → EventBridge → `diffProcessor`
3. Lambda が「前バージョン」と差分比較 → 変更マスク PNG 生成
4. 結果ファイルを S3 `/diffs/{scoreId}/{version}.png` へ保存
5. DynamoDB レコードに diff URL 追加 → クライアントに Push (AppSync subscription)

### 3.5 CI/CD

* **Mobile/Web**: GitHub Actions → `expo export --platform web` & `eas build`
* **Backend**: `amplify push --yes` (Gen2) を Actions で実行
* **Hosting**: Amplify Hosting (Preview Branches 有効)

### 3.6 テスト

| レイヤ | ツール                               |
| --- | ------------------------------------- |
| 単体 | Jest, React Testing Library, PyTest   |
| E2E | Playwright (Web), Detox (Mobile)      |
| CI  | GitHub Actions Matrix (node 18/20/24) |

---

## 4. 開発環境

* **Node.js:** v24.1.0 (Amplify CLI Gen 2 は ≥18 対応)
* **npm:** v10.x もしくは **pnpm** 推奨
* **AWS CLI:** v2.15+ / **Amplify Gen2 CLI:** `@aws-amplify/cli@2`
* **Docker Desktop** (diffProcessor build)
* VSCode 推奨拡張：ESLint, Prettier, AWS Toolkit

### ローカル起動

```bash
# backend サンドボックス
amplify sandbox

# Expo (モバイル & Web)
cd apps/mobile
expo start --web   # http://localhost:19006
```

---

## 5. デプロイ環境

| ターゲット           | 手段                                | 備考                                     |
| --------------- | --------------------------------- | -------------------------------------- |
| **Web**         | Amplify Hosting (S3 + CloudFront) | Preview Branch 自動発行                    |
| **iOS/Android** | EAS Build & Submit                | TestFlight / Google Play 内部テスト         |
| **Backend**     | Amplify Gen2 CI (GitHub Actions)  | `amplify push` → CloudFormation スタック更新 |

---

## 6. 開発フロー

1. **Issue 立案** → GitHub Projects (Kanban)
2. **Feature Branch** で実装
3. PR 作成 → **GitHub Actions** で Lint/Test/Preview URL
4. QA OK で `main` にマージ → Amplify / EAS Production デプロイ

---

## 7. ライセンス

MIT
