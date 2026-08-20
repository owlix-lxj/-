export function isApiCloudMode() {
  const raw = process.env.IS_CLOUD ?? process.env.NEXT_PUBLIC_IS_CLOUD ?? 'false';
  return String(raw).trim().toLowerCase() === 'true';
}
