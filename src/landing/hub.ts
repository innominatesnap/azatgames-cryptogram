export const HUB_LOGIN_URL = "https://login.azat.games/login";

export function signInHref(origin: string): string {
  const root = origin.replace(/\/$/, "");
  const target = `${root}/play`;
  return `${HUB_LOGIN_URL}?redirect_to=${encodeURIComponent(target)}`;
}
