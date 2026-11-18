import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/Logo";
import {
  contactHref,
  PRIVACY_PATH,
  SUPPORT_EMAIL,
  SUPPORT_PATH,
} from "@/lib/site-info";
import "./InfoPage.css";
import "./tokens.css";

export const infoStyles = {
  page: "info-page",
  header: "info-header",
  brand: "info-brand",
  nav: "info-nav",
  footer: "info-footer",
  document: "info-document",
  article: "info-article",
  lead: "info-lead",
  updated: "info-updated",
  body: "info-body",
  toc: "info-toc",
  faq: "info-faq",
  skipLink: "info-skip-link",
} as const;

const styles = infoStyles;

export function InfoPage({
  title,
  lead,
  current,
  updated,
  children,
}: {
  title: string;
  lead: string;
  current: "support" | "privacy";
  updated?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#info-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <Link
          href="/"
          prefetch={false}
          className={styles.brand}
          aria-label="Shalom chat"
        >
          <Logo />
        </Link>
        <nav className={styles.nav} aria-label="Help and privacy">
          <Link
            href={SUPPORT_PATH}
            aria-current={current === "support" ? "page" : undefined}
          >
            Support
          </Link>
          <Link
            href={PRIVACY_PATH}
            aria-current={current === "privacy" ? "page" : undefined}
          >
            Privacy
          </Link>
        </nav>
      </header>
      <main id="info-content" className={styles.document} tabIndex={-1}>
        <article className={styles.article}>
          <header>
            <h1>{title}</h1>
            <p className={styles.lead}>{lead}</p>
            {updated && (
              <p className={styles.updated}>
                Last updated: <time dateTime={updated}>{updated}</time>
              </p>
            )}
          </header>
          <div className={styles.body}>{children}</div>
        </article>
      </main>
      <footer className={styles.footer}>
        <Link href="/" prefetch={false}>
          Back to Shalom
        </Link>
        <a href={contactHref()}>{SUPPORT_EMAIL}</a>
      </footer>
    </div>
  );
}
