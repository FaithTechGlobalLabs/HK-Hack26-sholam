export const SITE_ORIGIN = "https://sholam.vercel.app";
export const SUPPORT_EMAIL = "owenisas@gmail.com";
export const POLICY_UPDATED = "2026-11-18";
export const SUPPORT_PATH = "/support";
export const PRIVACY_PATH = "/privacy";

export function contactHref(kind: "support" | "privacy" = "support") {
  const subject =
    kind === "privacy" ? "Shalom privacy request" : "Shalom support";
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
}
