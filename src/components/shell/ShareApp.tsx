"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Check, Link2, Share, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { APP_URL, BRAND_NAME } from "@/lib/brand";
import { SHARE_QR } from "./share-qr";

/**
 * "Share Shalom": a dialog with a QR code for the app's link (to scan from
 * a phone, e.g. off a projected screen), Copy link, and the device's own
 * share sheet where the browser has one. The sidebar passes its row as the
 * trigger, so the item matches the rest of the sidebar.
 */
export function ShareApp({
  triggerClassName,
  children,
}: {
  triggerClassName: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  // navigator.share exists only in the browser (and not in every browser):
  // checked after mount so the server and first client render match.
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator.share === "function"), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link stays on screen to copy by hand.
    }
  };

  const share = () =>
    navigator
      .share({
        title: BRAND_NAME,
        text: "Ask about the Bible and faith, and learn with flashcards.",
        url: APP_URL,
      })
      .catch(() => {
        // Closed the share sheet: nothing to do.
      });

  return (
    <Dialog.Root onOpenChange={(open) => !open && setCopied(false)}>
      <Dialog.Trigger
        title={`Share ${BRAND_NAME}`}
        className={triggerClassName}
      >
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-[rgb(18_48_110/0.35)] transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-white/20 bg-[rgb(24_58_128/0.94)] px-6 pt-5 pb-6 text-white shadow-[0_6px_16px_rgb(18_48_110/0.28)] outline-none backdrop-blur-xl transition-[opacity,scale] duration-150 ease-out data-ending-style:scale-[0.97] data-ending-style:opacity-0 data-starting-style:scale-[0.97] data-starting-style:opacity-0 motion-reduce:transition-none">
          <div className="flex items-start justify-between gap-4">
            <Dialog.Title className="font-semibold text-xl">
              Share {BRAND_NAME}
            </Dialog.Title>
            <Dialog.Close
              aria-label="Close"
              className="-mt-1 -mr-2 grid size-9 place-items-center rounded-xl text-white/90 hover:bg-white/15 hover:text-white focus-visible:outline-2 focus-visible:outline-white/80"
            >
              <X className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="mt-1 text-[15px] text-white/90">
            Scan with a phone camera to open it.
          </Dialog.Description>

          <AppQrCode />

          <p className="mt-4 text-center font-medium text-[15px] [overflow-wrap:anywhere]">
            {APP_URL.replace(/^https:\/\//, "")}
          </p>

          <button
            type="button"
            onClick={copy}
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-white font-semibold text-[#1f4f9e] text-[15px] transition-colors duration-150 hover:bg-white/90 focus-visible:outline-2 focus-visible:outline-white focus-visible:outline-offset-2"
          >
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Link2 className="size-4" aria-hidden />
            )}
            {copied ? "Link copied" : "Copy link"}
          </button>
          {canShare && (
            <p className="mt-4 text-center">
              <button
                type="button"
                onClick={share}
                className="inline-flex items-center gap-1.5 rounded-md text-sm underline decoration-white/55 underline-offset-4 hover:decoration-white focus-visible:outline-2 focus-visible:outline-white/80"
              >
                <Share className="size-3.5" aria-hidden />
                More ways to share
              </button>
            </p>
          )}
          <output className="sr-only" aria-live="polite">
            {copied ? "Link copied" : ""}
          </output>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * The code itself, dark modules on white with the 4-module quiet zone the
 * QR spec asks for, so phone cameras read it on any background.
 */
function AppQrCode() {
  const q = 4;
  const n = SHARE_QR.size + q * 2;
  return (
    <div className="mx-auto mt-5 w-[min(14rem,100%)] overflow-hidden rounded-2xl bg-white">
      <svg
        viewBox={`${-q} ${-q} ${n} ${n}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`QR code for ${APP_URL}`}
        className="block size-full"
      >
        <path stroke="#0d2350" d={SHARE_QR.path} />
      </svg>
    </div>
  );
}
