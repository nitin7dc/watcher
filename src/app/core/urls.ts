/** Why a URL may not be used as an endpoint, or null if it may: https anywhere, http only on localhost. */
export function endpointUrlProblem(url: unknown): string | null {
  if (typeof url !== 'string') return 'Enter a full URL, starting with https://';
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return 'Enter a full URL, starting with https://';
  }
  if (u.protocol === 'https:') return null;
  if (u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)$/.test(u.hostname)) return null;
  return 'Use an https:// endpoint (http is only allowed for localhost).';
}

export function assertHttpUrl(url: string): void {
  const problem = endpointUrlProblem(url);
  if (problem) throw new Error(problem);
}
