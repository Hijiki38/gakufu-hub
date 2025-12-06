# Phase 5 実装の動作確認ガイド

## 📋 前提条件

### 必要な環境
- Node.js (v18以降推奨)
- React Native開発環境
  - iOS: Xcode + Simulator
  - Android: Android Studio + Emulator
  - または Expo Go アプリ

### 現在の実装状態
- ✅ Phase 4: サービスレイヤー実装完了
- ✅ Phase 5: UI移行実装完了
- ❌ Phase 3: Lambda関数は**未実装**（プレースホルダのみ）
- ❌ CDKスタックは**未デプロイ**

## 🎯 テストシナリオ

### シナリオ1: Amplifyモードでの動作確認（推奨）

**このシナリオが最も簡単です。既存のAmplify環境を使用します。**

#### 1-1. 設定確認

```bash
# env.sample.ts を確認
cat src/config/env.sample.ts
```

`USE_NATIVE_API: 'false'` であることを確認。

#### 1-2. Amplify環境の確認

```bash
# amplify_outputs.json が存在するか確認
ls -la amplify_outputs.json

# 存在しない場合は、Amplify環境をセットアップ
# (既にセットアップ済みの場合はスキップ)
```

#### 1-3. 依存関係のインストール

```bash
# ルートディレクトリで
npm install

# 必要なパッケージが追加されていることを確認
npm list amazon-cognito-identity-js
```

#### 1-4. アプリ起動

```bash
# Expo開発サーバー起動
npm start

# 別のターミナルで iOS Simulator起動（Macの場合）
npm run ios

# または Android Emulator起動
npm run android

# または Expo Go でスキャン
# npm start 後に表示されるQRコードをExpo Goでスキャン
```

#### 1-5. 動作確認項目

- [ ] **認証**: Amplify Authenticatorでログイン・ログアウトできる
- [ ] **Work一覧**: 既存のWorkが表示される
- [ ] **PDFアップロード**: 新しいPDFをアップロードできる
- [ ] **エディタ**: ScoreEditorPocが開ける
- [ ] **注釈追加**: エディタで線が描ける
- [ ] **保存**: 注釈付きPDFが保存される
- [ ] **Diff生成**: (Amplify Diff APIが設定されていれば) Diffが生成される

---

### シナリオ2: Native APIモードの動作確認（開発中）

**⚠️ このモードは Lambda関数が必要です。現在は動作しません。**

#### 2-1. Lambda関数の実装（必須）

まず、バックエンドLambda関数を実装する必要があります。

```bash
# backend/functions/storage-operations/index.ts を実装
# backend/functions/diff-orchestrator/index.ts を実装
# backend/functions/pdf-diff-processor/index.py を実装
```

実装例は `docs/migration_plan_aws_native.md` の「実装の詳細とコード例」を参照。

#### 2-2. CDKスタックのデプロイ（必須）

```bash
# AWS認証情報を設定
export AWS_PROFILE=your-profile
export CDK_DEFAULT_ACCOUNT=123456789012
export CDK_DEFAULT_REGION=ap-northeast-1
export STAGE=dev

# CDKスタックをデプロイ
cd infrastructure
npm run build
npx cdk deploy --all

# デプロイ後、出力されるAPI URLとCognito IDをメモ
```

#### 2-3. 環境変数の設定

デプロイ後、CDKの出力から以下の値を取得して設定:

```bash
# src/config/env.ts を作成（env.sample.ts をコピー）
cp src/config/env.sample.ts src/config/env.ts

# env.ts を編集
```

```typescript
// src/config/env.ts
export const ENV = {
  STAGE: 'dev',
  AWS_REGION: 'ap-northeast-1',
  API_BASE_URL: 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com', // CDK出力から
  COGNITO_USER_POOL_ID: 'ap-northeast-1_xxxxxxxxx', // CDK出力から
  COGNITO_USER_POOL_CLIENT_ID: 'xxxxxxxxxxxxxxxxxxxxxxxxxx', // CDK出力から
  USE_NATIVE_API: 'true', // Native APIモードを有効化
};
```

#### 2-4. インポート先の変更

```typescript
// App.tsx, ScoreEditorPoc.tsx などで
// import { ENV } from "./src/config/env.sample";
// ↓
import { ENV } from "./src/config/env";
```

#### 2-5. アプリ起動とテスト

```bash
npm start
npm run ios  # または npm run android
```

#### 2-6. Native APIモード動作確認項目

- [ ] **カスタムログイン**: LoginScreenが表示される
- [ ] **Cognito認証**: メール・パスワードでログインできる
- [ ] **Work一覧**: `GET /storage/works` が呼ばれる
- [ ] **PDFアップロード**: プリサインドURL経由でS3にアップロードされる
- [ ] **エディタ**: プリサインドURL経由でPDFを取得できる
- [ ] **Diff生成**: `POST /diff/generate` が呼ばれる

---

## 🔍 デバッグ方法

### ログ確認

#### フロントエンド
```bash
# Expo開発サーバーのターミナルでログを確認
# console.log() が出力される

# Chrome DevToolsでデバッグ（Web版）
npm run web
# ブラウザのDevToolsを開く
```

#### バックエンド（Native APIモード）
```bash
# Lambda関数のログをCloudWatchで確認
aws logs tail /aws/lambda/gakufu-hub-dev-storage-ops --follow

# API Gatewayのログ（有効化されている場合）
aws logs tail /aws/apigateway/gakufu-hub-dev-api --follow
```

### ネットワークリクエスト確認

#### React Native Debugger
```bash
# React Native Debuggerをインストール
brew install --cask react-native-debugger

# アプリでDev Menuを開く（Cmd+D on iOS, Cmd+M on Android）
# "Debug" を選択
# React Native Debugger の Network タブでリクエストを確認
```

#### Flipper
```bash
# Flipperをインストール
# https://fbflipper.com/

# Network pluginでAPIリクエストを確認
```

### モード切り替えのデバッグ

App.tsx に以下のログが出力されます:

```typescript
// Amplifyモード
console.log("=== Amplify Mode ===");

// Native APIモード
console.log("=== Native API Mode ===");
```

起動時にどちらのモードで動作しているか確認してください。

---

## 🧪 段階的テストプラン

### ステップ1: Amplifyモードで既存機能確認（5分）
```bash
# env.sample.ts で USE_NATIVE_API: 'false' を確認
npm start
npm run ios
# ログイン → PDF アップロード → エディタ起動 → 注釈 → 保存
```

✅ **成功基準**: すべての機能が以前と同じように動作する

---

### ステップ2: Native APIモードのUI確認（Lambda未実装でもOK）（5分）
```bash
# env.sample.ts を編集
# USE_NATIVE_API: 'true' に変更

# App.tsx のインポートを一時的に変更
# import { ENV } from "./src/config/env.sample";

npm start
npm run ios
```

✅ **成功基準**:
- カスタムLoginScreenが表示される
- メール・パスワード入力欄がある
- "Sign In"ボタンがある

⚠️ **予想されるエラー**:
- ログインに失敗（Cognito未設定のため）
- API呼び出しに失敗（Lambda未実装のため）

これは**正常です**。UIだけ確認できればOK。

---

### ステップ3: Lambda実装 + CDKデプロイ（半日〜1日）

この段階では、以下の作業が必要です:

1. **Lambda関数の実装**
   ```bash
   # backend/functions/storage-operations/index.ts
   # 実装内容: プリサインドURL生成、ファイル一覧、削除

   # backend/functions/diff-orchestrator/index.ts
   # 実装内容: Diff生成リクエストの受付

   # backend/functions/pdf-diff-processor/index.py
   # 実装内容: PDF差分生成
   ```

2. **CDKスタックの更新**
   ```typescript
   // infrastructure/lib/api-stack.ts
   // Lambda関数のコードを Code.fromAsset() で読み込むように変更
   ```

3. **デプロイとテスト**
   ```bash
   cd infrastructure
   npm run build
   npx cdk deploy --all

   # 出力された値を env.ts に設定
   # Native APIモードでアプリ起動
   npm start
   npm run ios
   ```

✅ **成功基準**: Native APIモードで全機能が動作する

---

## 📊 テスト結果チェックリスト

### Amplifyモード（USE_NATIVE_API=false）
- [ ] アプリ起動
- [ ] Authenticatorでログイン
- [ ] Work一覧表示
- [ ] 新しいWork作成
- [ ] PDFアップロード（document picker → Amplify uploadData）
- [ ] エディタ起動
- [ ] 注釈追加（ペン描画）
- [ ] 注釈保存（uploadData）
- [ ] ログアウト

### Native APIモード - UIのみ（Lambda未実装）
- [ ] カスタムLoginScreen表示
- [ ] メール・パスワード入力欄
- [ ] "Sign In"ボタン
- [ ] ログイン試行（失敗してもOK）

### Native APIモード - 完全（Lambda実装後）
- [ ] Cognitoでログイン成功
- [ ] Work一覧取得（GET /storage/works）
- [ ] 新しいWork作成
- [ ] PDFアップロード（プリサインドURL → S3直接アップロード）
- [ ] エディタ起動（プリサインドURL → PDF取得）
- [ ] 注釈追加
- [ ] 注釈保存（プリサインドURL → S3直接アップロード）
- [ ] Diff生成（POST /diff/generate）
- [ ] ログアウト

---

## 🚨 よくある問題とトラブルシューティング

### 問題1: "Cannot find module '../config/env'"

**原因**: env.ts ファイルが存在しない

**解決策**:
```bash
cp src/config/env.sample.ts src/config/env.ts
# または、インポートを env.sample.ts のままにする
```

### 問題2: "Network request failed" (Native APIモード)

**原因**: Lambda関数が未実装 or CDK未デプロイ

**解決策**:
- Lambda関数を実装してデプロイ
- または、Amplifyモードに戻す（USE_NATIVE_API: 'false'）

### 問題3: Cognito認証エラー

**原因**: COGNITO_USER_POOL_ID が間違っている

**解決策**:
```bash
# CDKスタックの出力を確認
cd infrastructure
npx cdk deploy gakufu-hub-dev-auth --outputs-file outputs.json
cat outputs.json
# UserPoolId をコピーして env.ts に設定
```

### 問題4: CORS エラー

**原因**: S3バケットのCORS設定が不足

**解決策**:
```bash
# infrastructure/lib/storage-stack.ts の CORS設定を確認
# デプロイ済みの場合は再デプロイ
cd infrastructure
npx cdk deploy gakufu-hub-dev-storage
```

### 問題5: プリサインドURL生成エラー

**原因**: Lambda関数の IAM権限不足

**解決策**:
```typescript
// api-stack.ts で権限を追加
bucket.grantReadWrite(storageFn);
scoreTable.grantReadWriteData(storageFn);
```

---

## 📝 次のステップ

### すぐにできること（Lambda不要）
1. ✅ **Amplifyモードでの動作確認** - 今すぐ実行可能
2. ✅ **Native APIモードのUI確認** - 今すぐ実行可能（ログインは失敗する）

### Lambda実装後にできること
3. ⏳ **Native APIモードの完全テスト** - Lambda実装 + CDKデプロイ後
4. ⏳ **Phase 6: Integration Testing** - 全機能の統合テスト
5. ⏳ **Phase 7: Cleanup** - Amplifyパッケージ削除

---

## 💡 推奨テスト順序

```
1. Amplifyモードで動作確認（5分）
   ↓ 既存機能が壊れていないことを確認

2. Native APIモードのUI確認（5分）
   ↓ カスタムログイン画面が表示されることを確認

3. Lambda関数実装（半日〜1日）
   ↓ backend/functions/* を実装

4. CDKデプロイ（30分）
   ↓ スタックをAWSにデプロイ

5. Native APIモード完全テスト（1時間）
   ↓ 全機能をテスト

6. 両モード比較テスト（30分）
   ↓ Amplifyモードと Native APIモードで同じ動作を確認

7. Cleanup（Phase 7）
   ↓ Amplifyパッケージ削除、本番デプロイ
```

---

## 🎓 学習リソース

- [Expo開発ガイド](https://docs.expo.dev/)
- [React Native Debugger](https://github.com/jhen0409/react-native-debugger)
- [AWS CDKドキュメント](https://docs.aws.amazon.com/cdk/)
- [Amazon Cognito 開発者ガイド](https://docs.aws.amazon.com/cognito/)

---

**現在の推奨**: まず**Amplifyモード**で動作確認してください。これが最も簡単で、既存機能が壊れていないことを確認できます。
