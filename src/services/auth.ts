import { CognitoUserPool, AuthenticationDetails, CognitoUser } from 'amazon-cognito-identity-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ENV } from '../config/env.sample'; // 実装側で env.ts に差し替えることを想定

// シンプルなラッパー。実装時に env.ts を生成し、pool/client ID を注入する。
const poolData = {
  UserPoolId: ENV.COGNITO_USER_POOL_ID || '',
  ClientId: ENV.COGNITO_USER_POOL_CLIENT_ID || '',
};

const userPool = new CognitoUserPool(poolData);

export type SignInResult = {
  success: boolean;
  message?: string;
};

export async function signIn(email: string, password: string): Promise<SignInResult> {
  return new Promise((resolve) => {
    const authDetails = new AuthenticationDetails({ Username: email, Password: password });
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: AsyncStorage as any });
    user.authenticateUser(authDetails, {
      onSuccess: () => resolve({ success: true }),
      onFailure: (err) => resolve({ success: false, message: err.message }),
    });
  });
}

export async function signOut() {
  const user = userPool.getCurrentUser();
  user?.signOut();
}

export function getCurrentSession() {
  return new Promise((resolve, reject) => {
    const user = userPool.getCurrentUser();
    if (!user) return resolve(null);
    user.getSession((err: any, session: any) => {
      if (err) return reject(err);
      resolve(session);
    });
  });
}
