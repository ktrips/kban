/** GitHub の Website(homepage)。http(s) 以外は使わない。 */
export function homepageUrl(homepage: string | null | undefined): string | undefined {
  const t = (homepage ?? "").trim();
  return /^https?:\/\/\S+$/.test(t) ? t.slice(0, 500) : undefined;
}
