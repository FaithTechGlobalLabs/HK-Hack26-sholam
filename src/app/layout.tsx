import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./sky.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Shalom",
  description:
    "Shalom Guide helps you explore the Bible and the Christian faith, with Bible flashcards to keep learning.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      // The launch screen's pre-paint script may add data-splash-seen.
      suppressHydrationWarning
    >
      <body className="h-full">{children}</body>
    </html>
  );
}
