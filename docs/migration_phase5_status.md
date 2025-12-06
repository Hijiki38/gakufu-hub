# Phase5 進捗メモ（Frontend UI Migration）

## 完了チェックリスト
- [x] カスタム認証UIの実装 (`src/components/auth/`)
  - [x] LoginScreen.tsx - カスタムログイン画面
  - [x] AuthContext.tsx - 認証状態管理
  - [x] index.ts - エクスポート
- [x] 共通ユーティリティの実装 (`src/services/utils.ts`)
  - [x] getAuthHeader() - 認証ヘッダー取得（共通化）
  - [x] fetchWithTimeout() - タイムアウト対応fetch
  - [x] handleApiResponse() - APIレスポンス処理
  - [x] fetchWithRetry() - リトライ機能
- [x] storage.ts と api.ts の改善
  - [x] 共通ユーティリティの使用
  - [x] 型定義の追加
  - [x] listAllWorks() 関数の追加
- [x] App.tsx の段階的移行実装
  - [x] USE_NATIVE_API フラグによる条件分岐
  - [x] カスタム認証UIの統合 (AuthProvider, LoginScreen)
  - [x] fetchWorks() の両モード対応
  - [x] fetchPartsForWork() の両モード対応
  - [x] handleDeleteWork() の両モード対応
  - [x] selectFile() (upload) の両モード対応
  - [x] SignOutButton の両モード対応
- [x] ScoreEditorPoc.tsx の新サービスレイヤー移行
  - [x] 新サービスレイヤーのインポート
  - [x] USE_NATIVE_API フラグの追加
  - [x] loadLatestPdf() の両モード対応 (list, getUrl)
  - [x] saveAnnotatedPdf() の両モード対応 (uploadData, post)
- [ ] 実環境でのテスト（次フェーズ）

## 実装済み機能

### 1. カスタム認証UI
- **LoginScreen.tsx**: Cognito認証を使ったカスタムログイン画面
  - メール・パスワード入力
  - ローディング状態表示
  - エラーハンドリング
- **AuthContext.tsx**: React Context による認証状態管理
  - isAuthenticated, isLoading 状態
  - signIn, signOut, checkAuthStatus メソッド
  - セッション自動チェック

### 2. 共通ユーティリティ (utils.ts)
- **getAuthHeader()**: Cognito IDトークンからAuthorizationヘッダーを生成
- **fetchWithTimeout()**: タイムアウト機能付きfetch（デフォルト30秒）
- **handleApiResponse()**: エラーレスポンスの統一的な処理
- **fetchWithRetry()**: 指数バックオフによるリトライ機能（最大3回）

### 3. App.tsx の段階的移行
**USE_NATIVE_API = "false" (Amplify モード)**:
- 既存のAmplify Authenticator使用
- Amplify Storage/API使用
- 既存動作を完全維持

**USE_NATIVE_API = "true" (Native API モード)**:
- カスタムLoginScreen使用
- AuthProvider による認証状態管理
- 新サービスレイヤー使用:
  - `listAllWorks()` - 全work一覧取得
  - `listScores()` - パート別ファイル一覧
  - `requestPresignedUpload()` - プリサインドURL取得 → S3直接アップロード
  - `requestDiffGenerate()` - Diff生成トリガー
  - `nativeDeleteWork()` - Work削除

### 4. ScoreEditorPoc.tsx の移行
**USE_NATIVE_API = "false" (Amplify モード)**:
- `list()`, `getUrl()`, `uploadData()`, `post()` 使用

**USE_NATIVE_API = "true" (Native API モード)**:
- `listScores()` - 最新PDF検索
- `requestPresignedDownload()` - PDF取得用プリサインドURL
- `requestPresignedUpload()` - 注釈付きPDFアップロード
- `requestDiffGenerate()` - Diff生成

## アーキテクチャ

### モード切り替え
```typescript
// src/config/env.sample.ts
export const ENV = {
  USE_NATIVE_API: 'false', // 'true' で Native API モード
  // ...
};
```

### 認証フロー (Native API モード)
```
1. App起動
2. AuthProvider が getCurrentSession() でセッションチェック
3. セッションなし → LoginScreen表示
4. ユーザーがログイン → signIn() 実行
5. 成功 → isAuthenticated=true → メイン画面表示
```

### ファイルアップロードフロー (Native API モード)
```
1. ユーザーがPDF選択
2. requestPresignedUpload() でプリサインドURL取得
3. fetch() でS3に直接アップロード（Cognito認証不要）
4. listScores() で既存ファイル確認
5. 既存ファイルあり → requestDiffGenerate() で差分生成
```

## 実装ファイル一覧

### 新規作成
- `src/components/auth/AuthContext.tsx`
- `src/components/auth/LoginScreen.tsx`
- `src/components/auth/index.ts`
- `src/services/utils.ts`
- `docs/migration_phase5_status.md` (本ファイル)

### 更新
- `src/services/storage.ts` - ユーティリティ使用、型追加、listAllWorks追加
- `src/services/api.ts` - ユーティリティ使用、型追加
- `App.tsx` - 段階的移行実装（USE_NATIVE_API条件分岐）
- `src/editor/ScoreEditorPoc.tsx` - 段階的移行実装
- `src/config/env.sample.ts` - USE_NATIVE_API フラグ追加済み
- `package.json` - amazon-cognito-identity-js 追加済み

## 次のステップ (Phase 6: Integration Testing)

### Lambda関数の実装が必要
現在、Native APIモードで以下のエンドポイントを呼び出しているが、Lambda関数は未実装:
- `POST /storage/presigned-upload`
- `POST /storage/presigned-download`
- `GET /storage/list`
- `GET /storage/works` (新規追加必要)
- `DELETE /storage/delete`
- `POST /diff/generate`

### テストシナリオ
1. **Amplify モードテスト** (USE_NATIVE_API=false)
   - [ ] ログイン・ログアウト
   - [ ] Work作成・削除
   - [ ] PDFアップロード
   - [ ] エディタでの注釈追加・保存
   - [ ] Diff生成

2. **Native API モードテスト** (USE_NATIVE_API=true)
   - [ ] カスタムログイン画面でログイン
   - [ ] Work一覧取得（listAllWorks）
   - [ ] PDFアップロード（プリサインドURL経由）
   - [ ] エディタでPDF読込（プリサインドURL経由）
   - [ ] 注釈保存とDiff生成

## 備考

### 段階的移行の利点
- **安全性**: Amplifyモードで既存機能を維持しつつ、Native APIモードを開発・テスト可能
- **切り戻し容易**: 問題発生時は env.sample.ts で即座にAmplifyモードに戻せる
- **並行テスト**: 両モードを比較しながら動作確認可能

### コード品質
- TypeScript型安全性: 全API関数に適切な型定義
- エラーハンドリング: タイムアウト、リトライ、統一的なエラーレスポンス処理
- 認証状態管理: React Contextによる一元管理
- コード重複削減: getAuthHeader() 等の共通化

### 技術的注意点
- プリサインドURL: セキュリティのため有効期限設定が必要（Lambda実装時）
- CORS設定: S3バケットのCORS設定がプリサインドURLアップロードに必要
- DynamoDB設計: listAllWorks() 用のScan/Queryパターンを検討
- Blob型変換: ScoreEditorPocでのUint8Array → Blob変換に型アサーション使用
