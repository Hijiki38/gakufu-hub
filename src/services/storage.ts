import { ENV } from '../config/env.sample'; // 実装時に env.ts へ置換
import { getAuthHeader, fetchWithTimeout, handleApiResponse } from './utils';

const BASE_URL = ENV.API_BASE_URL?.replace(/\/$/, '') || '';

type UploadRequest = {
  work: string;
  part: string;
  fileName: string;
};

type PresignedUploadResponse = {
  uploadUrl: string;
  s3Key: string;
};

type PresignedDownloadResponse = {
  downloadUrl: string;
};

type ListScoresResponse = {
  items: Array<{
    s3Key: string;
    fileName: string;
    uploadedBy: string;
    uploadedAt: string;
    timestamp: string;
  }>;
};

export async function requestPresignedUpload(body: UploadRequest): Promise<PresignedUploadResponse> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader()),
  };
  const res = await fetchWithTimeout(`${BASE_URL}/storage/presigned-upload`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return handleApiResponse<PresignedUploadResponse>(res);
}

export async function requestPresignedDownload(body: { s3Key: string }): Promise<PresignedDownloadResponse> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader()),
  };
  const res = await fetchWithTimeout(`${BASE_URL}/storage/presigned-download`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return handleApiResponse<PresignedDownloadResponse>(res);
}

export async function listScores(work: string, part: string): Promise<ListScoresResponse> {
  const headers = {
    ...(await getAuthHeader()),
  };
  const url = `${BASE_URL}/storage/list?work=${encodeURIComponent(work)}&part=${encodeURIComponent(part)}`;
  const res = await fetchWithTimeout(url, { headers });
  return handleApiResponse<ListScoresResponse>(res);
}

export async function listAllWorks(): Promise<{ works: Array<{ name: string; parts: string[] }> }> {
  const headers = {
    ...(await getAuthHeader()),
  };
  const url = `${BASE_URL}/storage/works`;
  const res = await fetchWithTimeout(url, { headers });
  return handleApiResponse(res);
}

export async function deleteWork(work: string): Promise<{ success: boolean }> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await getAuthHeader()),
  };
  const res = await fetchWithTimeout(`${BASE_URL}/storage/delete`, {
    method: 'DELETE',
    headers,
    body: JSON.stringify({ work }),
  });
  return handleApiResponse(res);
}
