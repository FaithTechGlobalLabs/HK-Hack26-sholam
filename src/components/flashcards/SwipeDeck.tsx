"use client";

import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { verseIdToLabel } from "@/lib/bible/refs";
import { CATEGORY_LABELS, type Flashcard } from "@/lib/flashcards/types";
import { countSwipe } from "@/lib/usage-stats";
import GradientASCII from "./GradientASCII";

/**
 * Carousel deck. The centred card is sharp, and its art and text panels are
 * joined by a gooey "bubble bridge"; neighbours sit blurred at the sides
 * with their two panels drifted apart. Swipe, arrow keys, a tap on a side
 * card or the ticks move between cards. Tap the centred card to reveal the
 * answer; hold it for two seconds to ask about it in chat.
 */

const HOLD_MS = 2000;
/** Glyphs are picked by brightness, and the sky is brightest high up, so
 * this runs horizon-first: trees low down, then birds, then clear sky. */
const SKY_GLYPHS = "♣⇞↟ʌvᵛ˙· ";
const PANEL = "#f5f8fd";
const GAP = 22;
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

function profoundQuestion(card: Flashcard) {
  const verses = card.refs.map(verseIdToLabel).join(" and ");
  return `Give a profound explanation of ${verses}, in answer to: ${card.question}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

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

export function SwipeDeck({ cards }: { cards: Flashcard[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [holding, setHolding] = useState(false);
  const [width, setWidth] = useState(800);
  const [viewH, setViewH] = useState(800);
  const stageRef = useRef<HTMLElement>(null);
  const dragRef = useRef(0);
  const start = useRef<{
    x: number;
    y: number;
    id: number;
    axis: "x" | "y" | null;
    card: number;
  } | null>(null);
  const holdTimer = useRef<number | null>(null);
  const asked = useRef(false);

  const deckKey = cards.map((card) => card.id).join("\n");
  const [seenDeck, setSeenDeck] = useState(deckKey);
  if (seenDeck !== deckKey) {
    setSeenDeck(deckKey);
    setIndex(0);
    setRevealed(false);
  }

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      setWidth(el.clientWidth);
      setViewH(window.innerHeight);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(
    () => () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
    },
    [],
  );

  const cardW = Math.max(240, Math.min(360, width * 0.6));
  // Shorter windows get a shorter art panel so the deck and ticks fit.
  const ART_H = Math.round(Math.max(120, Math.min(196, viewH * 0.24)));
  const stageH = ART_H + GAP + 190;
  const stride = cardW + Math.max(20, Math.min(56, width * 0.05));

  const go = (next: number) => {
    const n = Math.max(0, Math.min(cards.length - 1, next));
    if (n !== index) {
      setIndex(n);
      setRevealed(false);
      countSwipe();
    }
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
    clearHold();
    router.push(`/?q=${encodeURIComponent(profoundQuestion(card))}&send=1`);
  };

  const setDragPx = (px: number) => {
    dragRef.current = px;
    setDrag(px);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || asked.current) return;
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
    const card = el ? Number(el.dataset.card) : -1;
    start.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      axis: null,
      card,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    if (card === index) {
      setHolding(true);
      holdTimer.current = window.setTimeout(ask, HOLD_MS);
    }
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      clearHold();
      s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (s.axis === "x") setDragging(true);
    }
    if (s.axis !== "x") return;
    const atEdge =
      (index === 0 && dx > 0) || (index === cards.length - 1 && dx < 0);
    setDragPx(atEdge ? dx * 0.3 : dx);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLElement>) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    clearHold();
    if (asked.current) return;
    if (s.axis === "x") {
      const d = dragRef.current;
      if (Math.abs(d) > stride * 0.18) {
        const steps = Math.max(1, Math.round(Math.abs(d) / stride));
        go(index - Math.sign(d) * steps);
      }
      setDragging(false);
      setDragPx(0);
      return;
    }
    if (s.axis === null) {
      if (s.card === index) setRevealed((r) => !r);
      else if (s.card >= 0) go(s.card);
    }
  };

  // Arrow keys move between cards; Enter or Space flips the centred one.
  // Ignored while typing in a field.
  const keyRef = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  keyRef.current = (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable]")) return;
    if (e.key === "ArrowRight") go(index + 1);
    else if (e.key === "ArrowLeft") go(index - 1);
    else if (
      (e.key === "Enter" || e.key === " ") &&
      !target?.closest("button, a")
    ) {
      e.preventDefault();
      setRevealed((r) => !r);
    }
  };
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (cards.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm">
        No cards yet. Add one, or ask about it in Chat.
      </p>
    );
  }

  const transition = dragging
    ? "none"
    : `transform 700ms ${EASE}, filter 700ms ${EASE}, opacity 700ms ${EASE}`;
  const ticks = Array.from({ length: cards.length }, (_, i) => i).filter(
    (i) => Math.abs(i - index) <= 4,
  );

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <filter id="sholam-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="5" />
            <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -10" />
          </filter>
        </defs>
      </svg>

      <section
        ref={stageRef}
        aria-roledescription="carousel"
        aria-label="Flashcards"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ height: stageH }}
        className="relative w-full cursor-grab touch-pan-y overflow-x-clip outline-none select-none active:cursor-grabbing"
      >
        {cards.map((card, i) => {
          const p = i - index + drag / stride;
          const a = Math.abs(p);
          if (a > 2.6) return null;
          const near = Math.min(a, 1);
          const split = near * 16;
          const sky = SKIES[i % SKIES.length];
          const active = i === index;
          const showAnswer = active && revealed;
          return (
            <div
              key={card.id}
              data-card={i}
              className="absolute top-1/2 left-1/2"
              style={{
                width: cardW,
                transform: `translate(calc(-50% + ${p * stride}px), -50%) scale(${(1 - near * 0.08) * (active && holding ? 0.985 : 1)})`,
                filter: a > 0.04 ? `blur(${Math.min(a, 1.4) * 5}px)` : "none",
                opacity: 1 - Math.min(a, 2) * 0.22,
                zIndex: 20 - Math.round(a * 4),
                transition,
              }}
            >
              <div
                className="relative overflow-hidden rounded-2xl shadow-[0_18px_40px_rgb(35_75_150/0.22)]"
                style={{
                  height: ART_H,
                  transform: `translateY(${-split}px)`,
                  transition,
                }}
              >
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
                  <div className="text-[13px] tracking-[0.12em] text-white/40">
                    {TREES_FAR}
                  </div>
                  <div className="-mt-0.5 pb-2 text-[19px] tracking-[0.08em] text-white/60">
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
                className="min-h-40 rounded-2xl p-5 text-slate-800 shadow-[0_18px_40px_rgb(35_75_150/0.18)]"
                style={{
                  background: PANEL,
                  textShadow: "none",
                  transform: `translateY(${split}px)`,
                  transition,
                }}
              >
                <p className="font-mono text-[11px] text-slate-500 uppercase tracking-[0.2em]">
                  No. {pad(i + 1)} · {CATEGORY_LABELS[card.category]}
                </p>
                <h2 className="mt-2 font-semibold text-lg leading-snug">
                  {showAnswer ? card.answer : card.question}
                </h2>
                {showAnswer ? (
                  <p className="mt-2 text-slate-600 text-sm">
                    {card.refs.map(verseIdToLabel).join(" · ")}
                    {card.explanation ? ` — ${card.explanation}` : ""}
                  </p>
                ) : (
                  active && (
                    <p className="mt-2 text-slate-500 text-sm">
                      Tap to reveal · hold to ask in chat
                    </p>
                  )
                )}
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
            className="flex h-6 w-2.5 items-center justify-center"
          >
            <span
              className="block w-px rounded-full bg-white transition-all duration-500"
              style={{
                height: i === index ? 20 : 10,
                width: i === index ? 2 : 1,
                opacity: i === index ? 1 : 0.55,
              }}
            />
          </button>
        ))}
        <span className="ml-2 font-mono text-white/75 text-xs">
          {pad(index + 1)} / {pad(cards.length)}
        </span>
      </nav>
    </div>
  );
}
