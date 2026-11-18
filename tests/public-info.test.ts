import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage, {
  metadata as privacyMetadata,
} from "@/app/(information)/privacy/page";
import SupportPage, {
  metadata as supportMetadata,
} from "@/app/(information)/support/page";
import {
  contactHref,
  PRIVACY_PATH,
  SITE_ORIGIN,
  SUPPORT_EMAIL,
  SUPPORT_PATH,
} from "@/lib/site-info";

const source = (path: string) =>
  readFileSync(fileURLToPath(new URL(`../${path}`, import.meta.url)), "utf8");

describe("public support and privacy pages", () => {
  it("uses the explicitly approved contact without attaching private text", () => {
    expect(SUPPORT_EMAIL).toBe("owenisas@gmail.com");
    for (const kind of ["support", "privacy"] as const) {
      const url = new URL(contactHref(kind));
      expect(url.protocol).toBe("mailto:");
      expect(url.pathname).toBe(SUPPORT_EMAIL);
      expect([...url.searchParams.keys()]).toEqual(["subject"]);
      expect(url.searchParams.has("body")).toBe(false);
      expect(url.searchParams.get("subject")).toBe(
        kind === "privacy" ? "Shalom privacy request" : "Shalom support",
      );
    }
  });

  it("renders complete support content with usable FAQ controls and privacy navigation", () => {
    const html = renderToStaticMarkup(createElement(SupportPage));
    expect(html).toContain("Help with Shalom");
    expect(html).toContain('class="info-page"');
    expect(html).toContain('class="info-document"');
    expect(html).toContain(SUPPORT_EMAIL);
    expect(html).toContain("<details>");
    expect(html).toContain("<summary>");
    expect(html).toContain(`href="${PRIVACY_PATH}"`);
    expect(html).toContain("no one-click server account-deletion feature");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("keeps the policy honest about providers, signed-in storage and local deletion", () => {
    const html = renderToStaticMarkup(createElement(PrivacyPage));
    for (const text of [
      "Privacy policy",
      "OpenRouter",
      "Supabase",
      "Vercel",
      "Gmail",
      "zero retention",
      "best-effort",
      "2026-11-18",
      "Older builds may not have these controls",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(`href="${SUPPORT_PATH}"`);
    expect(html).toContain("does not have an automatic expiry");
    expect(html).toContain("automatically when you continue one");
    expect(html).toContain("copied to the account");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<input");
  });

  it("sets canonical metadata and stays independent of account/model calls", () => {
    expect(supportMetadata.alternates?.canonical).toBe(
      `${SITE_ORIGIN}${SUPPORT_PATH}`,
    );
    expect(privacyMetadata.alternates?.canonical).toBe(
      `${SITE_ORIGIN}${PRIVACY_PATH}`,
    );
    for (const file of [
      "src/app/(information)/support/page.tsx",
      "src/app/(information)/privacy/page.tsx",
      "src/components/info/InfoPage.tsx",
    ]) {
      const text = source(file);
      expect(text).not.toContain('"use client"');
      expect(text).not.toContain("getAccount(");
      expect(text).not.toContain("streamChat(");
      expect(text).not.toContain("/api/chat");
      expect(text).not.toContain("<iframe");
    }
  });
});
