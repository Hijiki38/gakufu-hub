import { ENV } from '../config/env.sample'; // 実装時に env.ts へ置換
import { getAuthHeader, fetchWithTimeout, handleApiResponse } from './utils';

const BASE_URL = ENV.API_BASE_URL?.replace(/\/$/, '') || '';

type DiffGenerateRequest = {
  work: string;
  part: string;
  baseKey: string;
  targetKey: string;
};

type DiffGenerateResponse = {
  diffKey: string;
  status: string;
  message?: string;
};

export async function requestDiffGenerate(body: DiffGenerateRequest): Promise<DiffGenerateResponse> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader()),
  };
  const res = await fetchWithTimeout(`${BASE_URL}/diff/generate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return handleApiResponse<DiffGenerateResponse>(res);
}
