"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Button } from "@/components/ui/button";
import { passageLabel } from "@/lib/bible/refs";
import { queueChatQuestion } from "@/lib/chat/handoff";
import { CATEGORY_LABELS, type Flashcard } from "@/lib/flashcards/types";
import GradientASCII from "./GradientASCII";

/**
 * Carousel deck (Jeff's design). The centred card is sharp, and its art and
 * text panels are joined by a gooey "bubble bridge"; neighbours sit blurred
 * at the sides with their two panels drifted apart. Swipe, arrow keys, a tap
 * on a side card, the ticks or Next move between cards. Tap the centred card
 * to reveal it: the white panel softens as the new face appears, then
 * sharpens. Hold it for two seconds (or press Ask in chat) to
 * ask about it in chat. The parent remounts this per deck (`key`), so there
 * is no deck-change bookkeeping here.
 */

const HOLD_MS = 2000;
/** Glyphs are picked by brightness, and the sky is brightest high up, so
 * this runs horizon-first: trees low down, then birds, then clear sky. */
const SKY_GLYPHS = "♣⇞↟ʌvᵛ˙· ";
const PANEL = "#f5f8fd";
/** Soft blue edge at the top or bottom of a scrolling panel, shown only
 *  while there is more to scroll that way (the panel-coloured covers move
 *  with the content and hide it at each end). */
const SCROLL_HINT = [
  `linear-gradient(${PANEL} 30%, rgb(245 248 253 / 0)) top / 100% 24px no-repeat local`,
  `linear-gradient(rgb(245 248 253 / 0), ${PANEL} 70%) bottom / 100% 24px no-repeat local`,
  "linear-gradient(rgb(47 104 194 / 0.12), transparent) top / 100% 10px no-repeat scroll",
  "linear-gradient(transparent, rgb(47 104 194 / 0.12)) bottom / 100% 10px no-repeat scroll",
].join(", ");
const GAP = 22;
/** Text panel height the stage reserves under the art. */
const PANEL_SPACE = 190;
/** Ticks row, the Next / Ask row and the two gaps under the stage. */
const CONTROLS = 24 + 28 + 2 * 12;
/** Tree line along the horizon: a far, faint row and a nearer one. */
const TREES_FAR = "↟ ↟⇞↟ ♣↟ ↟↟⇞ ↟♣ ⇞↟↟ ↟♣↟ ⇞↟ ↟↟♣ ↟⇞↟ ♣↟";
const TREES_NEAR = "♣↟ ⇞♣ ↟↟♣ ⇞ ♣↟⇞ ↟♣ ♣⇞↟ ↟♣ ⇞♣↟";
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Soft skies, deep at the top and pale at the horizon. `drip` is the
 * colour the art fades to at its bottom edge, so the bubbles match it. */
const SKIES = [
  { colors: ["#6f9fe0", "#9cc3f2", "#d3e6fb", "#fff6e5"], drip: "#d6e7fb" },
  { colors: ["#8796dc", "#c3aee6", "#f6cdb9", "#fff1df"], drip: "#f4d6c8" },
  { colors: ["#4f8ad8", "#80b4ee", "#bfe0fb", "#f2fbff"], drip: "#cbe5fb" },
  { colors: ["#6d7fcf", "#a690d6", "#f0aaa1", "#ffdcb8"], drip: "#f6c7b4" },
  { colors: ["#5d9bc9", "#8ccbd6", "#c9eadf", "#f4fbef"], drip: "#d4eee4" },
];

/** Bubble positions (left %, size px, duration s, delay s). */
const DRIPS = [
  { x: 14, s: 16, d: 3.4, t: 0 },
  { x: 36, s: 22, d: 4.1, t: 0.6 },
  { x: 61, s: 14, d: 3.1, t: 1.2 },
  { x: 82, s: 19, d: 3.8, t: 0.3 },
];
const RISES = [
  { x: 24, s: 18, d: 3.6, t: 0.9 },
  { x: 48, s: 26, d: 4.4, t: 0.2 },
  { x: 72, s: 16, d: 3.3, t: 1.5 },
];

/** Card width and spacing follow the stage width (cqw), and the art takes
 * whatever height the deck has left after the text panel and controls (cqh),
 * so short phones get a shorter sky instead of overflowing. All in CSS, so
 * the server render already has the right sizes. `strideFor` mirrors the
 * stride for drag maths. */
const CARD_W = "clamp(240px, 60cqw, 360px)";
const STRIDE = `calc(${CARD_W} + clamp(20px, 5cqw, 56px))`;
const ART_H = `clamp(96px, calc(100cqh - ${GAP + PANEL_SPACE + CONTROLS}px), 196px)`;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const strideFor = (w: number) =>
  clampNum(w * 0.6, 240, 360) + clampNum(w * 0.05, 20, 56);

/** What "ask in chat" sends. Discover cards are open questions, so the
 *  request is to explore them from their starting points, not to answer. */
function chatRequest(card: Flashcard) {
  const passages = card.refs.map(passageLabel).join(" and ");
  if (card.kind === "discover") {
    return `Help me explore this question: ${card.question} Start from ${passages}.`;
  }
  return `Give a profound explanation of ${passages}, in answer to: ${card.question}`;
}

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const mq = window.matchMedia?.(REDUCE_QUERY);
  mq?.addEventListener("change", onChange);
  return () => mq?.removeEventListener("change", onChange);
}
function useReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia?.(REDUCE_QUERY).matches ?? false,
    () => false,
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Ends with a full stop unless it already ends a sentence. */
const sentence = (t: string) => (/[.!?]["'”’)]?$/.test(t.trim()) ? t : `${t}.`);

function Bridge({ top, play }: { top: string; play: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none relative"
      style={{ height: GAP }}
    >
      {play && (
        <div className="goo-connect absolute inset-x-4 -top-3 -bottom-3">
          {/* Melting down from the art. */}
          <div
            className="absolute inset-0"
            style={{ filter: "url(#sholam-goo)" }}
          >
            <span
              className="absolute inset-x-0 top-0 h-4"
              style={{ background: top }}
            />
            {DRIPS.map((b) => (
              <span
                key={b.x}
                className="goo-drip absolute top-1 rounded-full"
                style={
                  {
                    background: top,
                    left: `${b.x}%`,
                    width: b.s,
                    height: b.s,
                    "--dur": `${b.d}s`,
                    "--delay": `${b.t}s`,
                    "--travel": `${GAP - 2}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
          {/* Bubbling up from the text panel. */}
          <div
            className="absolute inset-0"
            style={{ filter: "url(#sholam-goo)" }}
          >
            <span
              className="absolute inset-x-0 bottom-0 h-4"
              style={{ background: PANEL }}
            />
            {RISES.map((b) => (
              <span
                key={b.x}
                className="goo-drip absolute bottom-1 rounded-full"
                style={
                  {
                    background: PANEL,
                    left: `${b.x}%`,
                    width: b.s,
                    height: b.s,
                    "--dur": `${b.d}s`,
                    "--delay": `${b.t}s`,
                    "--travel": `${-(GAP - 4)}px`,
                  } as CSSProperties
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The carousel with no card in it yet: the centred card's art and panel at
 * their real size, and room for the ticks and buttons. FlashcardsView shows
 * it until the browser renders the shuffled deck, so nothing moves when the
 * cards arrive. Built from the same constants as the deck below.
 */
export function SwipeDeckPlaceholder() {
  const sky = SKIES[0];
  return (
    <div
      aria-busy="true"
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      style={{ containerType: "size" }}
    >
      <span className="sr-only">Shuffling the deck…</span>
      <div
        className="relative w-full"
        style={{
          height: `calc(${ART_H} + ${GAP + PANEL_SPACE}px)`,
          containerType: "inline-size",
        }}
      >
        <div
          data-placeholder-card
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: CARD_W }}
        >
          <div
            className="rounded-2xl shadow-[0_18px_40px_rgb(35_75_150/0.22)]"
            style={{
              height: ART_H,
              background: `linear-gradient(180deg, ${sky.colors[0]} 0%, ${sky.colors[1]} 40%, ${sky.colors[2]} 78%, ${sky.colors[3]} 100%)`,
            }}
          />
          <div style={{ height: GAP }} />
          <div
            className="min-h-40 rounded-2xl shadow-[0_18px_40px_rgb(35_75_150/0.18)]"
            style={{ background: PANEL }}
          />
        </div>
      </div>
      <div className="h-6" />
      <div className="h-7" />
    </div>
  );
}

export function SwipeDeck({ cards }: { cards: Flashcard[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [shift, setShift] = useState<{
    phase: "idle" | "in";
    dir: "forward" | "back";
  }>({ phase: "idle", dir: "forward" });
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [holding, setHolding] = useState(false);
  const [hinted, setHinted] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const flipRef = useRef<HTMLButtonElement>(null);
  const [stride, setStride] = useState(() => strideFor(800));
  const dragRef = useRef(0);
  const gesture = useRef<{
    x: number;
    y: number;
    id: number;
    axis: "x" | "y" | null;
    card: number;
  } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const shiftGen = useRef(0);
  const revealTarget = useRef(false);
  const asked = useRef(false);
  const suppressClick = useRef(false);
  const refocus = useRef(false);

  // Next 16 keeps visited pages alive (hidden) instead of unmounting them.
  // When this deck is hidden mid-gesture (a hold that opened chat, a swipe
  // then a dock tap), clear every in-flight flag so it works on return.
  useLayoutEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
      shiftGen.current += 1;
      gesture.current = null;
      asked.current = false;
      suppressClick.current = false;
      dragRef.current = 0;
      setHolding(false);
      setDragging(false);
      setDrag(0);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => setStride(strideFor(el.clientWidth));
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Keyboard users keep focus on the centred card as it changes (`go` sets
  // the flag; the new card's button exists after this render).
  useEffect(() => {
    if (!refocus.current) return;
    refocus.current = false;
    flipRef.current?.focus({ preventScroll: true });
  });

  const go = (next: number) => {
    const n = clampNum(next, 0, cards.length - 1);
    if (n === index) return;
    refocus.current =
      !!stageRef.current?.contains(document.activeElement) &&
      document.activeElement !== stageRef.current;
    setIndex(n);
    setRevealed(false);
    revealTarget.current = false;
    shiftGen.current += 1;
    setShift((s) => (s.phase === "idle" ? s : { ...s, phase: "idle" }));
    setHinted(true);
  };

  /** The new face paints soft, then the white panel sharpens. No lead-in. */
  const toggleReveal = () => {
    setHinted(true);
    const next = !revealTarget.current;
    revealTarget.current = next;
    if (reduce) {
      setRevealed(next);
      return;
    }
    const gen = ++shiftGen.current;
    const dir = next ? "forward" : "back";
    setRevealed(next);
    setShift({ phase: "in", dir });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (shiftGen.current !== gen) return;
        setShift({ phase: "idle", dir });
      });
    });
  };

  const clearHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
    setHolding(false);
  };

  const ask = () => {
    const card = cards[index];
    if (!card || asked.current) return;
    asked.current = true;
    suppressClick.current = true;
    clearHold();
    queueChatQuestion(chatRequest(card));
    router.push("/", { transitionTypes: ["to-chat"] });
  };

  const setDragPx = (px: number) => {
    dragRef.current = px;
    setDrag(px);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // Primary button only, and one pointer at a time.
    if (e.button !== 0 || gesture.current !== null || asked.current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
    const card = el ? Number(el.dataset.card) : -1;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      axis: null,
      card,
    };
    suppressClick.current = false;
    if (card === index) {
      setHolding(true);
      holdTimer.current = window.setTimeout(ask, HOLD_MS);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      clearHold();
      suppressClick.current = true;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.axis === "y") return;
      // Capture only once it is a drag, so a plain tap still clicks the
      // element under the finger (the side card or the centred one).
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
    }
    if (g.axis !== "x") return;
    const atEdge =
      (index === 0 && dx > 0) || (index === cards.length - 1 && dx < 0);
    setDragPx(atEdge ? dx * 0.3 : dx);
  };

  const endDrag = () => {
    setDragging(false);
    setDragPx(0);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    clearHold();
    if (asked.current) return;
    if (g.axis === "x") {
      const d = dragRef.current;
      if (Math.abs(d) > stride * 0.18) {
        const steps = Math.max(1, Math.round(Math.abs(d) / stride));
        go(index - Math.sign(d) * steps);
      }
      endDrag();
    }
  };

  /** A cancelled gesture (the page scrolled, the OS took over) never moves
   * or flips a card; it just snaps back. */
  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    suppressClick.current = true;
    clearHold();
    endDrag();
  };

  /** Taps, Enter/Space on the centred card's button and screen-reader
   * activation all arrive here as a click. Clicks that follow a drag or a
   * hold are dropped; keyboard clicks (detail 0) never are. */
  const onClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (asked.current) return;
    if (suppressClick.current && e.detail !== 0) {
      suppressClick.current = false;
      return;
    }
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
    if (!el) return;
    const i = Number(el.dataset.card);
    if (i === index) toggleReveal();
    else go(i);
  };

  // Arrow keys move between cards anywhere on the page, except while typing,
  // inside a dialog, or with a modifier held (browser back/forward).
  const keyRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const target = e.target instanceof Element ? e.target : null;
    if (
      target?.closest(
        "input, textarea, select, [contenteditable], dialog, [role=dialog]",
      )
    )
      return;
    e.preventDefault();
    go(index + (e.key === "ArrowRight" ? 1 : -1));
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (cards.length === 0) {
    return (
      <p className="text-center text-sm text-white/90">
        No cards yet. Add one, or ask about it in Chat.
      </p>
    );
  }

  const current = cards[index];
  const last = index === cards.length - 1;
  const transition =
    dragging || reduce
      ? "none"
      : `transform 700ms ${EASE}, filter 700ms ${EASE}, opacity 700ms ${EASE}`;
  const ticks = Array.from({ length: cards.length }, (_, i) => i).filter(
    (i) => Math.abs(i - index) <= 4,
  );
  const passagesText = current.refs.map(passageLabel).join(", ");
  const announcement = !revealed
    ? `Card ${index + 1} of ${cards.length}. ${current.question}`
    : current.kind === "discover" && !current.answer
      ? `Start reading: ${passagesText}.`
      : `Answer: ${sentence(current.answer ?? "")} ${current.kind === "discover" && current.takeaway ? `${sentence(current.takeaway)} ` : ""}${passagesText}.`;

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      style={{ containerType: "size" }}
    >
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <filter id="sholam-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
          </filter>
        </defs>
      </svg>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: delegated taps; keyboard users press the centred card's button (its click bubbles here) and the arrow keys are handled on window */}
      <section
        ref={stageRef}
        aria-roledescription="carousel"
        aria-label="Flashcards. Arrow keys move between cards."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          height: `calc(${ART_H} + ${GAP + PANEL_SPACE}px)`,
          containerType: "inline-size",
        }}
        className="relative w-full cursor-grab touch-pan-y overflow-x-clip outline-none select-none [-webkit-touch-callout:none] active:cursor-grabbing"
      >
        {cards.map((card, i) => {
          const p = i - index + drag / stride;
          const a = Math.abs(p);
          if (a > 2.6) return null;
          const near = Math.min(a, 1);
          const split = near * 16;
          const sky = SKIES[i % SKIES.length];
          const active = i === index;
          const open = active && revealed;
          const passages = card.refs.map(passageLabel);
          const label = !open
            ? CATEGORY_LABELS[card.category]
            : card.kind === "discover" && !card.answer
              ? "Start reading"
              : "Answer";
          return (
            <div
              key={card.id}
              data-card={i}
              aria-hidden={active ? undefined : true}
              className="absolute top-1/2 left-1/2"
              style={{
                width: CARD_W,
                transform: `translate(calc(-50% + ${p} * ${STRIDE}), -50%) scale(${(1 - near * 0.08) * (active && holding && !reduce ? 0.985 : 1)})`,
                filter: a > 0.04 ? `blur(${Math.min(a, 1.4) * 5}px)` : "none",
                opacity: 1 - Math.min(a, 2) * 0.22,
                zIndex: 20 - Math.round(a * 4),
                transition,
              }}
            >
              <div
                className="deck-face"
                data-shift={
                  active && shift.phase !== "idle" ? shift.phase : undefined
                }
                data-dir={
                  active && shift.phase !== "idle" ? shift.dir : undefined
                }
              >
                <div
                  className="relative overflow-hidden rounded-2xl shadow-[0_18px_40px_rgb(35_75_150/0.22)]"
                  style={{
                    height: ART_H,
                    transform: `translateY(${-split}px)`,
                    transition,
                  }}
                >
                  {/* Also what shows when WebGL is unavailable and the ASCII
                    field cannot draw. */}
                  <div
                    className="absolute inset-0"
                    style={{
                      background: `linear-gradient(180deg, ${sky.colors[0]} 0%, ${sky.colors[1]} 40%, ${sky.colors[2]} 78%, ${sky.colors[3]} 100%)`,
                    }}
                  />
                  {a < 1.6 ? (
                    <GradientASCII
                      colors={sky.colors}
                      shape="horizon"
                      characters={SKY_GLYPHS}
                      cellSize={15}
                      density={0.75}
                      glyphOpacity={0.55}
                      glow={0.18}
                      softness={0.95}
                      flicker={0.08}
                      scale={1.4}
                      speed={0.3}
                      grain={0.03}
                      gradientOpacity={1}
                      clickEffect="none"
                      mouseInteraction={false}
                      intro={false}
                    />
                  ) : null}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 bottom-0 overflow-hidden whitespace-nowrap text-center leading-none"
                    style={{ textShadow: "none" }}
                  >
                    <div className="text-[13px] text-white/40 tracking-[0.12em]">
                      {TREES_FAR}
                    </div>
                    <div className="-mt-0.5 pb-2 text-[19px] text-white/60 tracking-[0.08em]">
                      {TREES_NEAR}
                    </div>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background: `linear-gradient(180deg, rgb(255 255 255 / 0.12) 0%, transparent 70%, ${sky.drip} 100%)`,
                    }}
                  />
                </div>

                <Bridge
                  key={active ? `on-${index}` : "off"}
                  top={sky.drip}
                  play={active && !dragging}
                />

                <div
                  style={{
                    transform: `translateY(${split}px)`,
                    transition:
                      dragging || reduce ? "none" : `transform 700ms ${EASE}`,
                  }}
                >
                  <div
                    className="deck-panel relative min-h-40 rounded-2xl p-5 text-slate-800 shadow-[0_18px_40px_rgb(35_75_150/0.18)]"
                    style={{ background: PANEL, textShadow: "none" }}
                  >
                    <div className="deck-copy">
                      <p className="font-mono text-[11px] text-slate-600 uppercase tracking-[0.2em]">
                        No. {pad(i + 1)} · {label}
                      </p>
                      {active ? (
                        <button
                          ref={flipRef}
                          type="button"
                          aria-pressed={revealed}
                          className="-mx-1 mt-1 block w-[calc(100%+0.5rem)] cursor-[inherit] rounded-md px-1 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#2f68c2]"
                        >
                          {open && card.kind === "discover" && card.answer ? (
                            // The team's answers run to ~470 characters. Keep
                            // the panel inside the space the stage reserves
                            // (so the ticks and buttons stay clear) and
                            // scroll the rest; the takeaway leads.
                            <span
                              className="block overflow-y-auto overscroll-contain"
                              style={{
                                maxHeight: PANEL_SPACE - 70,
                                background: SCROLL_HINT,
                              }}
                            >
                              {card.takeaway && (
                                <span className="block font-semibold text-[15px] text-slate-900 leading-snug">
                                  {card.takeaway}
                                </span>
                              )}
                              <span className="mt-1.5 block text-slate-800 text-sm leading-snug">
                                {card.answer}
                              </span>
                              <span className="mt-1.5 block text-slate-600 text-xs">
                                {passages.join(" · ")}
                              </span>
                            </span>
                          ) : open && card.kind === "discover" ? (
                            <span className="block font-semibold text-lg leading-snug">
                              {passages.map((ref) => (
                                <span key={ref} className="block">
                                  {ref}
                                </span>
                              ))}
                            </span>
                          ) : (
                            <span className="line-clamp-4 block text-balance font-semibold text-lg leading-snug">
                              {open && card.kind === "fact"
                                ? card.answer
                                : card.question}
                            </span>
                          )}
                          {!open && (
                            <span className="sr-only">. Press to reveal.</span>
                          )}
                        </button>
                      ) : (
                        <p className="mt-2 line-clamp-4 text-balance font-semibold text-lg leading-snug">
                          {card.question}
                        </p>
                      )}
                      {open && card.kind === "fact" && (
                        <>
                          <p className="mt-2 text-slate-600 text-sm">
                            {passages.join(" · ")}
                          </p>
                          {card.explanation && (
                            <p className="mt-1 line-clamp-3 text-slate-700 text-sm">
                              {card.explanation}
                            </p>
                          )}
                        </>
                      )}
                      {open && card.kind === "discover" && !card.answer && (
                        <p className="mt-2 text-slate-600 text-sm">
                          An open question with no single answer. Explore it
                          with Ask in chat.
                        </p>
                      )}
                      {!open &&
                        card.kind === "discover" &&
                        card.tags.length > 0 && (
                          <p className="mt-2 text-slate-600 text-xs">
                            {card.tags.join(" · ")}
                            {card.minutes ? ` · ${card.minutes} min` : ""}
                          </p>
                        )}
                      {active && !open && !hinted && (
                        <p className="mt-2 text-pretty text-slate-600 text-sm">
                          Tap to reveal · hold to ask in chat
                        </p>
                      )}
                    </div>
                    {/* Hold progress: fills over the 2 s hold that opens chat. */}
                    {active && (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-x-5 bottom-2.5 h-0.5 rounded-full bg-[#2f68c2]/70"
                        style={{
                          clipPath: `inset(0 ${holding ? 0 : 100}% 0 0 round 9999px)`,
                          transition: holding
                            ? `clip-path ${HOLD_MS}ms linear`
                            : "clip-path 120ms ease-out",
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <nav aria-label="Card position" className="flex items-center gap-2">
        {ticks.map((i) => (
          <button
            key={i}
            type="button"
            aria-label={`Card ${i + 1}`}
            aria-current={i === index ? "true" : undefined}
            onClick={() => go(i)}
            className="flex h-6 w-2.5 items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <span
              className="block w-px rounded-full bg-white transition-all duration-500 motion-reduce:transition-none"
              style={{
                height: i === index ? 20 : 10,
                width: i === index ? 2 : 1,
                opacity: i === index ? 1 : 0.6,
              }}
            />
          </button>
        ))}
        <span className="ml-2 font-mono text-white/90 text-xs tabular-nums">
          {pad(index + 1)} / {pad(cards.length)}
        </span>
      </nav>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={ask}
          className="bg-[rgb(30_70_150/0.3)]"
        >
          Ask in chat
        </Button>
        <Button
          size="sm"
          onClick={() => (last ? go(0) : go(index + 1))}
          className="bg-[rgb(30_70_150/0.45)]"
        >
          {last ? "Start over" : "Next"}
        </Button>
      </div>
    </div>
  );
}
