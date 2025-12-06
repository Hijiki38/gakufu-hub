# Phase1 進捗メモ（Auth Stack）

## 完了チェックリスト
- [x] Auth Stack を CDK で作成（User Pool / User Pool Client / Identity Pool / IAM Roles）
- [x] スタック名を `gakufu-hub-{STAGE}-auth` に設定
- [x] 出力値: UserPoolId / UserPoolClientId / IdentityPoolId / Region / Stage
- [x] `npx cdk synth` が成功
- [ ] 実環境へのデプロイ（`npx cdk deploy`）

## 主なリソース設定
- UserPool: email サインイン、autoVerify(email)、パスワード minLength=8・数字/小文字必須
- UserPoolClient: secret なし、USER_PASSWORD_AUTH / USER_SRP_AUTH を許可
- IdentityPool: 未認証アクセス許可 (allowUnauthenticatedIdentities=true)
- IAM Roles: authenticated / unauthenticated ロールを Identity Pool に紐付け（AssumeRoleWithWebIdentity）

## コマンド例
```bash
# ビルド & テンプレート確認
cd infrastructure
npm run build
npx cdk synth

# デプロイ例 (dev)
STAGE=dev CDK_DEFAULT_ACCOUNT=123456789012 CDK_DEFAULT_REGION=ap-northeast-1 \
  npx cdk deploy gakufu-hub-dev-auth
```

## メモ
- Storage/API スタックと接続する際は、AuthenticatedRole/UnauthenticatedRole に S3・APIGW 権限を付与する。
- フロントエンド側では CfnOutput の ID を .env などに流用し、Amplify 依存を外す。
