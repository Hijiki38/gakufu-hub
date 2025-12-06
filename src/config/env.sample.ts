// 環境変数サンプル（実値はビルド時に注入）
export const ENV = {
  STAGE: 'dev',
  AWS_REGION: 'ap-northeast-1',
  API_BASE_URL: 'https://example.execute-api.ap-northeast-1.amazonaws.com',
  COGNITO_USER_POOL_ID: 'ap-northeast-1_example',
  COGNITO_USER_POOL_CLIENT_ID: 'exampleclientid',
  USE_NATIVE_API: 'true', // true にするとフロントを新API/サービス層で動かすフラグ（段階的移行用）
};
