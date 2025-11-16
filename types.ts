/**
 * Type definitions and helper functions for Gakufu-hub
 * Hierarchical folder structure: data/{work}/{part}/{timestamp}-{filename}.pdf
 */

export interface S3Item {
  path: string;
  lastModified?: Date;
  size?: number;
}

export interface ParsedPath {
  work: string;
  part?: string;
  filename?: string;
  isDiff: boolean;
}

export interface Work {
  name: string;
  parts: string[];
}

export interface PartInfo {
  part: string;
  fileCount: number;
  latestModified?: Date;
}

export const VALID_PARTS = ['vn1', 'vn2', 'va', 'vc', 'cb'] as const;
export type PartType = typeof VALID_PARTS[number];

export const PART_LABELS: Record<PartType, string> = {
  vn1: 'Violin 1',
  vn2: 'Violin 2',
  va: 'Viola',
  vc: 'Cello',
  cb: 'Contrabass',
};

/**
 * Parse an S3 path into its components
 * @param path S3 path (e.g., "data/beethoven-symphony-5/vn1/1699876543210-score.pdf")
 * @returns Parsed path components
 * @throws Error if path format is invalid
 */
export function parseS3Path(path: string): ParsedPath {
  const parts = path.split('/');

  if (parts.length < 2 || parts[0] !== 'data') {
    throw new Error(`Invalid S3 path format: ${path}`);
  }

  const isDiff = path.includes('/diff/');

  return {
    work: parts[1],
    part: parts.length > 2 && !isDiff ? parts[2] : undefined,
    filename: parts.length > 3 ? parts.slice(3).join('/') : undefined,
    isDiff,
  };
}

/**
 * Build an S3 path from components
 * @param work Work name (e.g., "beethoven-symphony-5")
 * @param part Part identifier (e.g., "vn1")
 * @param filename Optional filename (e.g., "1699876543210-score.pdf")
 * @returns S3 path
 */
export function buildS3Path(work: string, part: string, filename?: string): string {
  if (filename) {
    return `data/${work}/${part}/${filename}`;
  }
  return `data/${work}/${part}/`;
}

/**
 * Validate if a part identifier is valid
 * @param part Part identifier to validate
 * @returns True if valid
 */
export function isValidPart(part: string): part is PartType {
  return VALID_PARTS.includes(part as PartType);
}

/**
 * Check if a path follows legacy 2-tier structure
 * @param path S3 path
 * @returns True if legacy format (data/{repo}/{file}.pdf)
 */
export function isLegacyPath(path: string): boolean {
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === 'data' && parts[2].endsWith('.pdf');
}

/**
 * Migrate legacy path to new 3-tier structure (defaults to vn1)
 * @param path Legacy S3 path
 * @returns New 3-tier path
 */
export function migrateLegacyPath(path: string): string {
  if (isLegacyPath(path)) {
    const parts = path.split('/');
    return `data/${parts[1]}/vn1/${parts[2]}`;
  }
  return path;
}
