"use client";

import { useRouter } from "next/navigation";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { passageLabel } from "@/lib/bible/refs";
import { queueChatQuestion } from "@/lib/chat/handoff";
import { CATEGORY_LABELS, type Flashcard } from "@/lib/flashcards/types";
import GradientASCII from "./GradientASCII";

const SWIPE_THRESHOLD = 88;
const HOLD_MS = 2000;

/** Horizon glows only. No pale center, so the card stays one color. */
const PALETTES = [
  ["#1e1b4b", "#4338ca", "#818cf8", "#a5b4fc"],
  ["#082f49", "#0369a1", "#38bdf8", "#7dd3fc"],
  ["#3b0764", "#7e22ce", "#d946ef", "#e879f9"],
  ["#431407", "#c2410c", "#fb923c", "#fdba74"],
];

/** What "ask in chat" sends. Discover cards are open questions, so the
 *  request is to explore them from their starting points, not to answer. */
function chatRequest(card: Flashcard) {
  const passages = card.refs.map(passageLabel).join(" and ");
  if (card.kind === "discover") {
    return `Help me explore this question: ${card.question} Start from ${passages}.`;
  }
  return `Give a profound explanation of ${passages}, in answer to: ${card.question}`;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One card at a time (Ricky's design): tap to reveal, swipe left for the
 * next card, hold to ask in chat. The Next and Ask buttons and the arrow
 * keys do the same for keyboard, screen-reader and mouse users.
 * The parent remounts this per deck (`key`), so no deck-change bookkeeping.
 */
export function SwipeDeck({ cards }: { cards: Flashcard[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [x, setX] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [holding, setHolding] = useState(false);
  const [hinted, setHinted] = useState(false);
  const dragging = useRef(false);
  const originX = useRef(0);
  const originY = useRef(0);
  const pointerId = useRef<number | null>(null);
  const axis = useRef<"x" | "y" | null>(null);
  const leaving = useRef(false);
  const asked = useRef(false);
  const suppressClick = useRef(false);
  const timer = useRef<number | null>(null);
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // Next 16 keeps visited pages alive (hidden) instead of unmounting them.
  // When this deck is hidden mid-gesture (a hold that opened chat, a swipe
  // then a dock tap), clear every in-flight flag so it works on return.
  useLayoutEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      pointerId.current = null;
      asked.current = false;
      leaving.current = false;
      suppressClick.current = false;
      dragging.current = false;
      setHolding(false);
      setAnimate(true);
      setX(0);
    },
    [],
  );

  const clearHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  const nextCard = () => {
    if (leaving.current || indexRef.current >= cards.length) return;
    setHinted(true);
    clearHold();
    const advance = () => {
      leaving.current = false;
      setIndex((current) => current + 1);
      setRevealed(false);
      setAnimate(false);
      setX(0);
      requestAnimationFrame(() => setAnimate(true));
    };
    if (prefersReducedMotion()) return advance();
    leaving.current = true;
    setAnimate(true);
    setX(-560);
    timer.current = window.setTimeout(advance, 180);
  };

  const ask = () => {
    const card = cards[indexRef.current];
    if (!card || asked.current) return;
    asked.current = true;
    suppressClick.current = true;
    clearHold();
    queueChatQuestion(chatRequest(card));
    router.push("/", { transitionTypes: ["to-chat"] });
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    // Primary button only, and one pointer at a time.
    if (event.button !== 0 || pointerId.current !== null) return;
    if (leaving.current || asked.current) return;
    pointerId.current = event.pointerId;
    originX.current = event.clientX;
    originY.current = event.clientY;
    axis.current = null;
    dragging.current = true;
    setAnimate(false);
    setHolding(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(ask, HOLD_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!dragging.current || event.pointerId !== pointerId.current) return;
    const dx = event.clientX - originX.current;
    const dy = event.clientY - originY.current;
    if (!axis.current) {
      if (Math.hypot(dx, dy) < 8) return;
      clearHold();
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (axis.current === "y") {
        dragging.current = false;
        setAnimate(true);
        setX(0);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }
    }
    if (axis.current === "x") setX(Math.min(0, dx));
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== pointerId.current) return;
    const dx = event.clientX - originX.current;
    const dy = event.clientY - originY.current;
    const horizontal = axis.current === "x";
    dragging.current = false;
    pointerId.current = null;
    clearHold();
    if (asked.current) return;
    if (horizontal && dx <= -SWIPE_THRESHOLD) {
      suppressClick.current = true;
      nextCard();
      return;
    }
    setAnimate(true);
    setX(0);
    if (Math.hypot(dx, dy) > 8) suppressClick.current = true;
  };

  /** A cancelled gesture never advances; it just snaps back. */
  const onPointerCancel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.pointerId !== pointerId.current) return;
    dragging.current = false;
    pointerId.current = null;
    clearHold();
    setAnimate(true);
    setX(0);
  };

  const onClick = () => {
    if (suppressClick.current || asked.current || leaving.current) {
      suppressClick.current = false;
      return;
    }
    if (!revealed) setRevealed(true);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      nextCard();
    }
  };

  if (cards.length === 0) {
    return (
      <p className="text-center text-sm text-white/90">
        No cards yet. Add one, or ask about it in Chat.
      </p>
    );
  }

  if (index >= cards.length) {
    return (
      <div className="text-center">
        <p className="font-medium">That's the deck.</p>
        <Button
          className="mt-4"
          onClick={() => {
            setIndex(0);
            setRevealed(false);
          }}
        >
          Start over
        </Button>
      </div>
    );
  }

  const card = cards[index];
  const palette = PALETTES[index % PALETTES.length];
  const passages = card.refs.map(passageLabel);

  return (
    <div className="flex h-full max-h-[34rem] w-full max-w-md flex-col gap-3">
      <button
        type="button"
        aria-label={
          revealed
            ? undefined
            : "Flashcard. Press to reveal; arrow keys for the next card."
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(event) => event.preventDefault()}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="relative block min-h-0 w-full flex-1 cursor-pointer touch-pan-y overflow-hidden rounded-3xl text-left outline-none select-none [-webkit-touch-callout:none] focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
        style={{
          transform: `translateX(${x}px) rotate(${x / 32}deg) scale(${holding ? 0.985 : 1})`,
          transition: animate ? "transform 180ms ease" : "none",
          // Shows when WebGL is unavailable and the ASCII field cannot draw.
          backgroundImage: `linear-gradient(180deg, ${palette[1]}, ${palette[0]})`,
        }}
      >
        <div className="absolute inset-0">
          <GradientASCII
            colors={palette}
            shape="horizon"
            cellSize={12}
            density={1}
            glow={0.3}
            softness={0.9}
            scale={1.6}
            speed={0.5}
            dpr={1.5}
            clickEffect="none"
            mouseInteraction={false}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />
        <div
          className="relative flex h-full flex-col justify-end p-6 text-white"
          aria-live="polite"
        >
          {revealed && card.kind === "fact" && (
            <>
              <span className="line-clamp-2 block text-sm text-white/75">
                {card.question}
              </span>
              <span className="mt-3 block text-white/80 text-xs uppercase tracking-wide">
                Answer
              </span>
              <span className="mt-1 block text-balance font-semibold text-2xl">
                {card.answer}
              </span>
              {card.explanation && (
                <span className="mt-2 block text-sm text-white/85">
                  {card.explanation}
                </span>
              )}
              <span className="mt-3 block text-sm text-white/85">
                {passages.join(" · ")}
              </span>
            </>
          )}
          {revealed && card.kind === "discover" && (
            <>
              <span className="line-clamp-2 block text-sm text-white/75">
                {card.question}
              </span>
              <span className="mt-3 block text-white/80 text-xs uppercase tracking-wide">
                Start reading
              </span>
              <span className="mt-1 block font-semibold text-2xl leading-snug">
                {passages.map((label) => (
                  <span key={label} className="block">
                    {label}
                  </span>
                ))}
              </span>
              <span className="mt-3 block text-sm text-white/85">
                An open question with no single answer. Explore it with Ask in
                chat.
              </span>
            </>
          )}
          {!revealed && (
            <>
              <span className="block text-white/80 text-xs uppercase tracking-wide">
                {CATEGORY_LABELS[card.category]}
              </span>
              <span className="mt-2 block text-balance font-semibold text-2xl sm:text-3xl">
                {card.question}
              </span>
              {card.kind === "discover" && card.tags.length > 0 && (
                <span className="mt-3 block text-white/80 text-xs">
                  {card.tags.join(" · ")}
                  {card.minutes ? ` · ${card.minutes} min` : ""}
                </span>
              )}
            </>
          )}
        </div>
        {/* Hold progress: fills over the 2 s hold that sends the card to chat. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-6 bottom-3 h-0.5 origin-left rounded-full bg-white/85"
          style={{
            transform: `scaleX(${holding ? 1 : 0})`,
            transition: holding
              ? `transform ${HOLD_MS}ms linear`
              : "transform 120ms ease-out",
          }}
        />
      </button>

      <div className="flex items-center gap-2">
        <span className="mr-auto text-xs text-white/90 tabular-nums">
          {index + 1} / {cards.length}
        </span>
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
          onClick={nextCard}
          className="bg-[rgb(30_70_150/0.45)]"
        >
          Next
        </Button>
      </div>
      {!hinted && (
        <p className="text-center text-xs text-white/85">
          Tap to reveal · swipe left for the next card · hold to ask in chat
        </p>
      )}
    </div>
  );
}
