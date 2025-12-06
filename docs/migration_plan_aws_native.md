# AWS Amplify から素のAWSサーバレスへの移行計画

> **ステータス**: 計画中（未実装）
> **作成日**: 2025-11-27
> **対象バージョン**: v0.3 以降

## 目次
1. [移行の目的](#1-移行の目的)
2. [技術選定](#2-技術選定確定事項)
3. [新アーキテクチャ設計](#3-新アーキテクチャ設計)
4. [プロジェクト構造](#4-プロジェクト構造)
5. [移行フェーズ](#5-移行フェーズ段階的実装計画)
6. [実装の詳細とコード例](#6-実装の詳細とコード例)
7. [リスクと対策](#7-リスクと対策)
8. [成功条件とチェックリスト](#8-成功条件とチェックリスト)

---

## 1. 移行の目的

### なぜAmplifyを外すのか
- **AI支援開発との相性向上**: 標準的なAWSサーバレスパターンは事例が豊富で、AIコーディングツールが適切なコード提案を行いやすい
- **アーキテクチャの柔軟性**: Amplifyの抽象化レイヤーを外し、AWS リソースを直接制御することで拡張性を確保
- **メンテナンス性の向上**: CDKによる明示的なインフラ定義で、AIがアーキテクチャを理解・修正しやすくなる
- **依存の排除**: `@aws-amplify/*` パッケージへの依存を完全に削除し、標準のAWS SDKのみで構成

## 2. 技術選定（確定事項）

### 2.1 Infrastructure as Code
**採用: AWS CDK (TypeScript)**

**理由:**
- 既存コードベースがTypeScriptであり、言語統一によるメンテナンス性向上
- Amplify Gen 2がCDKベースなので、既存の `amplify/` ディレクトリ構造の知見を活用可能
- AI支援開発ツール（Claude、GitHub Copilot）がCDKのパターンを理解しやすい
- 豊富なドキュメントとコミュニティサポート

**スタック分割方針:**
```
infrastructure/
├── lib/
│   ├── auth-stack.ts        # Cognito User Pool, Identity Pool, IAM Roles
│   ├── storage-stack.ts     # S3 Bucket, DynamoDB Tables
│   └── api-stack.ts         # API Gateway, Lambda Functions
└── bin/
    └── app.ts               # CDK App Entry Point
```

### 2.2 認証（Authentication）
**採用: Amazon Cognito + カスタムUI**

**フロントエンド:**
- `amazon-cognito-identity-js` を使用（Amplify UI コンポーネントは使わない）
- React Native でカスタム認証画面を実装
- 最終成果物では Amplify UI を完全削除

**バックエンド:**
- Cognito User Pool（メールログイン）
- Identity Pool（認証済み + ゲストアクセス）
- IAM ロール（認証済みユーザー、ゲストユーザー）

### 2.3 ストレージアクセスパターン
**採用: API Gateway 経由でのプリサインドURL方式**

**アーキテクチャ:**
```
Client (React Native)
    ↓
API Gateway (HTTP API v2)
    ↓
Lambda Function (presigned-url-generator)
    ↓
Returns presigned URL
    ↓
Client → Direct S3 Upload/Download
```

**理由:**
- セキュリティ: クライアントに S3 認証情報を持たせない
- 制御: API Gateway でレート制限、ログ収集が可能
- パス規約の隠蔽: S3 キーの命名規則をバックエンドで管理
- 権限管理の一元化: Lambda で適切なプリサインドURL生成ロジックを制御

### 2.4 メタデータ管理
**採用: DynamoDB によるメタデータ管理**

**テーブル設計:**

**ScoreMetadata Table:**
```
PK: work#part (例: beethoven-symphony-5#vn1)
SK: timestamp (例: 1699876543210)
Attributes:
  - s3Key: data/beethoven-symphony-5/vn1/1699876543210-score.pdf
  - fileName: score.pdf
  - uploadedBy: userId (Cognito Sub)
  - uploadedAt: ISO8601 timestamp
  - diffS3Key: data/beethoven-symphony-5/vn1/diff/score_diff.pdf (optional)
  - hasDiff: boolean
```

**GSI (Global Secondary Index):**
- GSI1: uploadedBy (ユーザーがアップロードしたファイル一覧)

**理由:**
- S3 List API は遅く、フィルタリングが困難
- 将来的にコメント機能、パート間リンク、バージョン管理の拡張が容易
- DynamoDB Streams を使った非同期処理（通知、ログ、分析）が可能

### 2.5 ローカル開発環境
**採用: CDK + 開発用AWSアカウント**

**開発フロー:**
1. `cdk deploy --profile dev` で開発環境にデプロイ
2. `cdk watch` でコード変更を自動デプロイ（ホットリロード）
3. Lambda 単体テストには `sam local invoke` を使用（オプション）

**環境分離:**
- dev: 開発環境（個人用AWSアカウント or 開発用アカウント）
- staging: ステージング環境（テスト用）
- prod: 本番環境

## 3. 新アーキテクチャ設計

### 3.1 全体構成図

```
┌─────────────────────────────────────────────────────────────┐
│                     Client (React Native)                    │
│  - Custom Auth UI (amazon-cognito-identity-js)              │
│  - Storage Service (API Client)                              │
│  - API Service (Diff Trigger)                                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                 Amazon Cognito User Pool                     │
│  - Email Login                                               │
│  - Identity Pool (Guest + Authenticated)                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│              API Gateway (HTTP API v2)                       │
│  Routes:                                                     │
│    POST   /storage/presigned-upload                          │
│    POST   /storage/presigned-download                        │
│    GET    /storage/list                                      │
│    DELETE /storage/delete                                    │
│    POST   /diff/generate                                     │
│  Authorizer: Cognito User Pool + IAM                         │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                      Lambda Functions                        │
│                                                               │
│  1. storage-operations (Node.js/TypeScript)                  │
│     - Generate presigned URLs for upload/download            │
│     - List files with metadata from DynamoDB                 │
│     - Delete files (S3 + DynamoDB)                           │
│                                                               │
│  2. diff-orchestrator (Node.js/TypeScript)                   │
│     - Receive diff request                                   │
│     - Invoke pdf-diff-processor Lambda                       │
│     - Update DynamoDB with diff metadata                     │
│                                                               │
│  3. pdf-diff-processor (Python/Docker)                       │
│     - Download PDFs from S3                                  │
│     - Generate visual diff using PyMuPDF + PIL               │
│     - Upload diff PDF to S3                                  │
│     - Return diff metadata                                   │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                         Amazon S3                            │
│  Bucket: gakufu-hub-storage-{env}                            │
│  Structure:                                                  │
│    data/{work}/{part}/{timestamp}-{filename}.pdf             │
│    data/{work}/{part}/diff/{filename}_diff.pdf               │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│                       DynamoDB                               │
│  Table: ScoreMetadata                                        │
│  - work#part → timestamp → metadata                          │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 API エンドポイント設計

#### POST /storage/presigned-upload
プリサインドURLを生成し、クライアントがS3に直接アップロードできるようにする。

**Request:**
```json
{
  "work": "beethoven-symphony-5",
  "part": "vn1",
  "fileName": "score.pdf"
}
```

**Response:**
```json
{
  "uploadUrl": "https://s3.amazonaws.com/...",
  "s3Key": "data/beethoven-symphony-5/vn1/1699876543210-score.pdf"
}
```

#### POST /storage/presigned-download
S3からファイルをダウンロードするためのプリサインドURLを生成。

#### GET /storage/list
特定の work + part のファイル一覧をDynamoDBから取得。

#### DELETE /storage/delete
指定した work の全ファイルを S3 と DynamoDB から削除（認証済みユーザーのみ）。

#### POST /diff/generate
2つのPDFバージョン間の差分を生成。

詳細な API 仕様は、計画書の元ファイルを参照してください。

## 4. プロジェクト構造

```
gakufu-hub/
├── infrastructure/              # CDK Infrastructure Code
│   ├── bin/
│   │   └── app.ts
│   ├── lib/
│   │   ├── auth-stack.ts
│   │   ├── storage-stack.ts
│   │   └── api-stack.ts
│   └── package.json
│
├── backend/                     # Lambda Functions
│   ├── functions/
│   │   ├── storage-operations/  # Node.js Lambda
│   │   ├── diff-orchestrator/   # Node.js Lambda
│   │   └── pdf-diff-processor/  # Python Lambda (Docker)
│   └── shared/
│
├── src/                         # React Native Frontend
│   ├── services/                # New service layer
│   │   ├── auth.ts
│   │   ├── storage.ts
│   │   └── api.ts
│   └── components/
│       └── auth/                # Custom auth UI
│
└── docs/
    └── migration_plan_aws_native.md  # This file
```

## 5. 移行フェーズ（段階的実装計画）

### Phase 0: 準備（1-2日）
- CDK プロジェクトの初期化（`infrastructure/` 配下で `npx cdk init app --language typescript`）
- バックエンドディレクトリの作成（`backend/functions/*`, `backend/shared/` の雛形設置）
- 環境変数ファイルの準備（`.env.example`, `src/config/env.sample.ts`）
- Git ブランチの作成（例: `chore/aws-native-phase0`）
- ルート `package.json` に CDK 用 npm script を追加（`cdk`, `cdk:synth`, `cdk:diff`, `cdk:deploy`）
- 完了条件: `cd infrastructure && npm run build && npx cdk synth` が成功し、上記雛形ファイルが揃っていること

### Phase 1: Infrastructure - Auth Stack（2-3日）
- Cognito User Pool + Identity Pool の構築（email サインイン、ゲスト許可）
- IAM ロールの設定（authenticated / unauthenticated）
- デプロイとテスト
- 進捗: CDK スタック雛形を実装済み（`gakufu-hub-{stage}-auth`）

### Phase 2: Infrastructure - Storage Stack（2-3日）
- S3 Bucket の作成（CORS設定、Lifecycle Policy）
- DynamoDB Table の作成（ScoreMetadata + GSI）
- 既存データの移行（オプション）
- 進捗: CDK スタック雛形を実装済み（`gakufu-hub-{stage}-storage`）。Bucket: `gakufu-hub-storage-{stage}` / Table: `ScoreMetadata-{stage}`

### Phase 3: Infrastructure - API Stack（3-4日）
- API Gateway HTTP API v2 の構築
- Lambda 関数（3つ）の実装とデプロイ
- Cognito Authorizer の設定
- 進捗: スタック雛形を実装（`gakufu-hub-{stage}-api`）。Routes `/storage/*`, `/diff/generate` を作成し、プレースホルダ Lambda を接続済み。

### Phase 4: Frontend - Service Layer（3-4日）
- `src/services/auth.ts` の実装
- `src/services/storage.ts` の実装
- `src/services/api.ts` の実装
- 進捗: サービス層の雛形を追加（Cognito JS SDK + fetch ベース）。`ENV` は `env.sample.ts` でキー定義済み。

### Phase 5: Frontend - UI Migration（4-5日）
- カスタム認証画面の実装
- `App.tsx` の書き換え（Amplify SDK → 新サービスレイヤー）
- `ScoreEditorPoc.tsx` の書き換え
- 進捗: サービス層を読み込むフラグ (`USE_NATIVE_API`) を追加し、UI 移行の足場を作成（切替処理は未実装）。

### Phase 6: Integration Testing（2-3日）
- エンドツーエンドの動作確認
- 全ユースケースのテスト

### Phase 7: Cleanup（1-2日）
- Amplify パッケージのアンインストール
- `amplify/` ディレクトリの削除
- ドキュメントの更新

### Phase 8: Production Deployment（1-2日）
- 本番環境へのデプロイ
- モニタリング設定

**推定工数:** 15-20日（1人のフルタイム開発者）

## 6. 実装の詳細とコード例

詳細なコード例（CDK Stack、Lambda関数、Frontend Service Layer）は、以下のセクションを参照：

- **CDK Stack 実装例**: auth-stack.ts, storage-stack.ts, api-stack.ts
- **Lambda 実装例**: storage-operations/index.ts
- **Frontend Service 実装例**: src/services/auth.ts, storage.ts

完全なコード例は、計画書の元ファイル（`/Users/takumi/.claude/plans/melodic-painting-harbor.md`）に記載されています。

## 7. リスクと対策

### 7.1 データ移行リスク
- 既存バケットは削除せず、新しいバケットを並行運用
- S3 Sync でデータをコピー
- バックアップを取得してから移行

### 7.2 認証フローの互換性
- Cognito User Pool を既存のものからインポート（可能な場合）
- 段階的なロールアウト

### 7.3 API エンドポイントの変更
- 環境変数で API エンドポイントを切り替え可能にする
- 並行運用期間を設ける

### 7.4 Lambda コールドスタート
- Provisioned Concurrency の使用を検討
- クライアント側でタイムアウトを長めに設定

### 7.5 コスト増加
- API Gateway のキャッシング設定
- Lambda のメモリ最適化
- CloudWatch でコストモニタリング

## 8. 成功条件とチェックリスト

### 移行完了の定義
- [ ] Amplify 関連パッケージが `package.json` から削除されている
- [ ] `amplify/` ディレクトリが削除されている
- [ ] 全ての AWS リソースが CDK で管理されている
- [ ] フロントエンドが新しいサービスレイヤーを使用している
- [ ] 既存の全機能が動作する（認証、アップロード、ダウンロード、Diff生成）
- [ ] エンドツーエンドテストが全て通る
- [ ] 本番環境にデプロイされ、ユーザーが使用できる

### 品質チェックリスト
- [ ] TypeScript の型エラーがない
- [ ] ESLint の警告がない
- [ ] API レスポンスタイムが平均1秒以内
- [ ] エラーハンドリングが適切に実装されている
- [ ] ログが適切に出力されている（CloudWatch Logs）
- [ ] セキュリティベストプラクティスに従っている

## 9. まとめ

この移行計画は、Gakufu Hub を Amplify から素のAWSサーバレスアーキテクチャへ段階的に移行するための包括的なガイドです。

**主要な利点:**
1. **AI支援開発の容易性**: 標準的なAWSパターンでAIツールが効果的に機能
2. **完全な制御**: AWS リソースを直接管理し、柔軟な拡張が可能
3. **メンテナンス性**: CDK による明示的なインフラ定義
4. **コスト最適化**: 細かいチューニングが可能

**次のステップ:**
1. Phase 0: プロジェクト構造の準備
2. Phase 1: Auth Stack の実装とデプロイ
3. 各フェーズを順次進める

移行作業は段階的に進め、各フェーズで十分なテストを実施することで、リスクを最小化できます。

---

## 参考資料

- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Amazon Cognito Developer Guide](https://docs.aws.amazon.com/cognito/)
- [API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [DynamoDB Best Practices](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/best-practices.html)
