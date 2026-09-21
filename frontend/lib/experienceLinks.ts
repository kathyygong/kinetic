export const FULL_APP_URL = "https://kinetic-taupe.vercel.app";

export function resolveDemoUrl(configured: string | undefined, production: boolean): string | null {
  const value = configured?.trim();
  if (!value) return production ? null : "/demo";
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(!production && local && url.protocol === "http:")) return null;
    if (production && local) return null;
    return url.href;
  } catch {
    return null;
  }
}

export const DEMO_URL = resolveDemoUrl(process.env.NEXT_PUBLIC_DEMO_URL, process.env.NODE_ENV === "production");