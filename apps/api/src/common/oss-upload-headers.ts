export function shouldServeInlineFromOss(mimeType?: string): boolean {
  const normalized = String(mimeType || '')
    .trim()
    .toLowerCase()
    .split(';', 1)[0];

  if (!normalized) {
    return false;
  }

  return (
    normalized.startsWith('image/') ||
    normalized.startsWith('video/') ||
    normalized.startsWith('audio/') ||
    normalized.startsWith('text/') ||
    normalized === 'application/pdf' ||
    normalized === 'application/json'
  );
}

export function buildOssUploadHeaders(
  mimeType: string,
  acl: string,
): Record<string, string> {
  const normalizedMimeType = String(mimeType || '').trim() || 'application/octet-stream';
  const headers: Record<string, string> = {
    'Content-Type': normalizedMimeType,
    'x-oss-object-acl': acl,
  };

  if (shouldServeInlineFromOss(normalizedMimeType)) {
    headers['Content-Disposition'] = 'inline';
  }

  return headers;
}
