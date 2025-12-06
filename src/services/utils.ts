import { getCurrentSession } from './auth';

/**
 * 認証ヘッダーを取得する共通関数
 */
export async function getAuthHeader(): Promise<{ Authorization?: string }> {
  try {
    const session: any = await getCurrentSession();
    const token = session?.getIdToken?.()?.getJwtToken?.();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch (error) {
    console.warn('Failed to get auth token:', error);
    return {};
  }
}

/**
 * APIリクエストのラッパー（タイムアウト、リトライ、エラーハンドリング）
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('Request timeout');
    }
    throw error;
  }
}

/**
 * APIレスポンスのエラーハンドリング
 */
export async function handleApiResponse<T = any>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `API Error: ${response.status}`;
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch {
      // JSON parse failed, use status text
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  try {
    return await response.json();
  } catch {
    // Response might not be JSON
    return {} as T;
  }
}

/**
 * リトライ付きfetch
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<Response> {
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fetchWithTimeout(url, options);
    } catch (error: any) {
      lastError = error;
      if (i < maxRetries - 1) {
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, retryDelay * Math.pow(2, i)));
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}
