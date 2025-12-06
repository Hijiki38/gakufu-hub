# Phase2 進捗メモ（Storage Stack）

## 完了チェックリスト
- [x] S3 バケット `gakufu-hub-storage-{STAGE}` を CDK で定義（CORS/Lifecycle/暗号化/BlockPublicAccess）
- [x] DynamoDB `ScoreMetadata-{STAGE}` を CDK で定義（PK: pk=work#part, SK: sk=timestamp、GSI1: uploadedBy/ uploadedAt）
- [x] Stack 名を `gakufu-hub-{STAGE}-storage` に設定
- [x] `npx cdk synth` 成功
- [ ] 本番/開発環境へ `npx cdk deploy gakufu-hub-{STAGE}-storage` デプロイ
- [ ] 既存 S3 データ移行（必要なら）

## バケット設定
- CORS: origins `*`, methods GET/PUT/POST/DELETE/HEAD, exposed `ETag`, maxAge 3000
- Lifecycle: 7日で未完了マルチパートを中断
- BlockPublicAccess: ALL, Encryption: S3_MANAGED, versioning: false（キー規約でバージョン管理）

## テーブル設計メモ
- PK: `pk` = `work#part`
- SK: `sk` = `timestamp` (string)
- GSI1: `uploadedBy` / `uploadedAt` でユーザー別検索

## コマンド例
```bash
cd infrastructure
npm run build
npx cdk synth
STAGE=dev CDK_DEFAULT_ACCOUNT=123456789012 CDK_DEFAULT_REGION=ap-northeast-1 \
  npx cdk deploy gakufu-hub-dev-storage
```

## 次フェーズへの引き継ぎ
- Storage Stack で作成した Bucket/Table ARN を API/Lambda 権限に付与（Phase3）
- S3 CORS の origin は本番ドメイン決定後に絞り込む
