認証・アクセス制御は Amplify Auth と Storage 権限の組み合わせで実装されている。フロントエンドは `@aws-amplify/ui-react-native` の `Authenticator` でラップし、バックエンドは Gen2 定義 (`amplify/auth/resource.ts`, `amplify/storage/resource.ts`) でメールアドレス認証と S3 権限を構成する。

### 対象ユーザー・利用場面
対象: 楽団メンバー全般。個別アカウントでログインし、自パートの譜面にアクセス。
利用シーン: モバイル／Web どちらでも Cognito User Pool ログイン UI 経由でサインインし、譜面アップロードや注釈保存を行う。

### 実装詳細
- 認証方式: `defineAuth({ loginWith: { email: true } })` によりメール + 自動パスワードのサインアップ／サインインを提供。
- UI コンポーネント: `App.tsx` は `Authenticator.Provider` → `Authenticator` で全画面を覆い、認証完了後に `UploadSection` を表示。`SignOutButton` で `useAuthenticator().signOut()` を実行。
- 設定読み込み: `parseAmplifyConfig` で `amplify_outputs.json` を読み込み、Auth/Storage/API 設定を `Amplify.configure` に適用。REST API のリトライ戦略は `no-retry` に上書き。
- ストレージ権限: `defineStorage` で `data/*` に対し `guest` は read/write、`authenticated` は read/write/delete を許可。現状ゲストでも書き込み可能。
- API 権限: `amplify/backend.ts` で HTTP API に `HttpIamAuthorizer` を設定し、User Pool ロール・未認証ロールの双方に `execute-api:Invoke` を付与。

### 非機能要件・課題
- ゲスト書き込み許可は PoC 設定。実サービスでは未認証ユーザーの権限を制限し、Cognito グループや IAM Condition で細分化する必要がある。
- 多要素認証 (MFA) やパスワードポリシー、招待制フローは未設定。
- 認証状態が無い場合のローカルキャッシュ（譜面閲覧）は未整備。Authenticator がセッション断絶で即ログイン画面に戻る挙動となる。
