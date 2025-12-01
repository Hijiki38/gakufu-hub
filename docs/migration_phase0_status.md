# Phase0 進捗メモ（AWSネイティブ移行）

## 完了チェックリスト
- [x] infrastructure/ に CDK プロジェクトを初期化
- [x] backend/functions/* と backend/shared/ の雛形追加
- [x] .env.example / src/config/env.sample.ts を作成
- [x] ルート package.json に CDK 用 npm scripts 追加
- [ ] `cd infrastructure && npm run build && npx cdk synth` を実行して初回テンプレート生成

## コマンドリファレンス（Phase0）
- 初回ビルド: `cd infrastructure && npm run build`
- テンプレート確認: `cd infrastructure && npx cdk synth`
- デプロイ先指定: 環境変数 `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION`, `STAGE`

## メモ
- スタック名は `gakufu-hub-${STAGE}`。STAGE 未指定時は `dev` を使用。
- Phase1 以降で `lib/` を Auth/Storage/API スタックに分割予定。
