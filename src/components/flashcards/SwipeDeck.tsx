"use client";

import { useRouter } from "next/navigation";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { verseIdToLabel } from "@/lib/bible/refs";
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

function profoundQuestion(card: Flashcard) {
  const verses = card.refs.map(verseIdToLabel).join(" and ");
  return `Give a profound explanation of ${verses}, in answer to: ${card.question}`;
}

export function SwipeDeck({ cards }: { cards: Flashcard[] }) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [x, setX] = useState(0);
  const [animate, setAnimate] = useState(true);
  const [holding, setHolding] = useState(false);
  const xRef = useRef(0);
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
  indexRef.current = index;

  const deckKey = cards.map((card) => card.id).join("\n");
  const [seenDeck, setSeenDeck] = useState(deckKey);
  if (seenDeck !== deckKey) {
    setSeenDeck(deckKey);
    setIndex(0);
    setRevealed(false);
    xRef.current = 0;
    setX(0);
  }

  const clearHold = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const setDrag = (next: number) => {
    xRef.current = next;
    setX(next);
  };

  const nextCard = () => {
    if (leaving.current || indexRef.current >= cards.length) return;
    leaving.current = true;
    clearHold();
    setAnimate(true);
    setDrag(-560);
    timer.current = window.setTimeout(() => {
      leaving.current = false;
      setIndex((current) => current + 1);
      setRevealed(false);
      setAnimate(false);
      setDrag(0);
      requestAnimationFrame(() => setAnimate(true));
    }, 180);
  };

  const ask = () => {
    const card = cards[indexRef.current];
    if (!card || asked.current) return;
    asked.current = true;
    suppressClick.current = true;
    clearHold();
    const q = encodeURIComponent(profoundQuestion(card));
    router.push(`/?q=${q}&send=1`);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
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
        setDrag(0);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        return;
      }
    }
    if (axis.current === "x") setDrag(Math.min(0, dx));
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
    setDrag(0);
    if (Math.hypot(dx, dy) > 8) suppressClick.current = true;
  };

  const onClick = () => {
    if (suppressClick.current || asked.current || leaving.current) {
      suppressClick.current = false;
      return;
    }
    if (!revealed) setRevealed(true);
  };

  if (cards.length === 0) {
    return (
      <p className="text-center text-muted-foreground text-sm">
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
  const verses = card.refs.map(verseIdToLabel).join(" · ");

  return (
    <div className="w-full max-w-md">
      <button
        type="button"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={onClick}
        className="relative block h-[min(32rem,calc(100dvh-12rem))] w-full cursor-pointer overflow-hidden rounded-3xl text-left outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50"
        style={{
          transform: `translateX(${x}px) rotate(${x / 32}deg) scale(${holding ? 0.985 : 1})`,
          transition: animate ? "transform 180ms ease" : "none",
        }}
      >
        <div className="absolute inset-0">
          <GradientASCII
            colors={PALETTES[index % PALETTES.length]}
            shape="horizon"
            cellSize={12}
            density={1}
            glow={0.3}
            softness={0.9}
            scale={1.6}
            speed={0.5}
            clickEffect="none"
            mouseInteraction={false}
          />
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />
        <div className="relative flex h-full flex-col justify-end p-6 text-white">
          {revealed ? (
            <>
              <span className="block text-white/75 text-xs uppercase tracking-wide">
                Verse
              </span>
              <span className="mt-2 block font-semibold text-3xl">
                {verses}
              </span>
              <span className="mt-4 block text-lg">{card.answer}</span>
              {card.explanation && (
                <span className="mt-2 block text-sm text-white/80">
                  {card.explanation}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="block text-white/75 text-xs uppercase tracking-wide">
                {CATEGORY_LABELS[card.category]}
              </span>
              <span className="mt-2 block font-semibold text-3xl">
                {card.question}
              </span>
            </>
          )}
        </div>
      </button>
    </div>
  );
}
