# Phase4 進捗メモ（Frontend Service Layer）

## 完了チェックリスト
- [x] `src/services/auth.ts` 雛形（amazon-cognito-identity-js でサインイン/サインアウト/セッション取得）
- [x] `src/services/storage.ts` 雛形（presigned upload/download/list/delete を API 経由で呼び出す）
- [x] `src/services/api.ts` 雛形（/diff/generate 呼び出し）
- [x] ENV キーを `src/config/env.sample.ts` に追加（API_BASE_URL, COGNITO_USER_POOL_ID, COGNITO_USER_POOL_CLIENT_ID）
- [ ] 実環境値を `src/config/env.ts` などで注入
- [ ] 既存 Amplify 呼び出しをサービス層に置換 (`App.tsx`, editor など)
- [ ] 実機/エミュレータで認証→アップロード→diff 呼び出し動作確認

## 利用方法メモ
- `ENV` はビルド時に実値へ置換する（dotenv + babel config または `app.config.ts` で注入）。
- `auth.ts` は AsyncStorage を CognitoUser に渡してセッションを保持。`getCurrentSession()` の戻り値から `IdToken` を取得し、API 呼び出しヘッダに付与。
- 現状は fetch + Bearer トークン前提。必要に応じてリトライ/タイムアウトをラップする。

## 次フェーズへの引き継ぎ
- UI 層 (`App.tsx` / `ScoreEditorPoc.tsx`) で Amplify SDK を外し、サービス層を経由した呼び出しに差し替え。
- エラーハンドリングやトークン更新（refresh）を追加。サインアップ/パスワードリセットが必要なら `amazon-cognito-identity-js` の各メソッドを薄くラップする。
