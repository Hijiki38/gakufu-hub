# Phase3 進捗メモ（API Stack）

## 完了チェックリスト
- [x] HTTP API (API Gateway v2) を CDK に追加、ルート `/storage/*`, `/diff/generate` を作成
- [x] Lambda プレースホルダ3種を作成（storage-ops / diff-orchestrator / pdf-diff-processor）
- [x] Cognito User Pool Authorizer を設定
- [x] S3 バケット / DynamoDB テーブルの権限を Lambda に付与
- [x] Stack 名を `gakufu-hub-{STAGE}-api` に設定
- [x] `npx cdk synth` 成功
- [ ] 本番/開発環境へ `npx cdk deploy gakufu-hub-{STAGE}-api`
- [ ] Lambda コードを実装版に置き換え（後続フェーズ）

## ルート概要
- POST `/storage/presigned-upload`
- POST `/storage/presigned-download`
- GET `/storage/list`
- DELETE `/storage/delete`
- POST `/diff/generate`

## 現状の Lambda 実装
- すべて inline のプレースホルダ（200 OK を返す）。Phase4/Phase5 で実装を差し替え。

## コマンド例
```bash
cd infrastructure
npm run build
npx cdk synth
STAGE=dev CDK_DEFAULT_ACCOUNT=123456789012 CDK_DEFAULT_REGION=ap-northeast-1 \
  npx cdk deploy gakufu-hub-dev-api
```

## 次フェーズへの引き継ぎ
- Lambda コードを `backend/functions/*` に実装し、CDK で `Code.fromAsset` or `NodejsFunction` に置き換える。
- 認可詳細 (IAM) を route ごとに絞る。ゲスト許可/拒否を定義。
