"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
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
import { passageLabel } from "@/lib/bible/refs";
import { queueChatQuestion } from "@/lib/chat/handoff";
import { CATEGORY_LABELS, type Flashcard } from "@/lib/flashcards/types";
import { cn } from "@/lib/utils";

/**
 * The flashcard deck: glass cards in a 3D carousel over the sky. The centred
 * card faces you; its neighbours turn toward it on either side. The front is
 * clear blue glass with the question; "Show answer" ("Where to start" on
 * discover cards) turns it over to a milky glass back with the answer, then
 * "Next card" and "Ask Shalom". On desktop the centred card tilts toward the
 * pointer. Swipe, the arrow keys, the ‹ › buttons or a tap on a side card
 * move between cards. The parent remounts this per deck (`key`).
 *
 * Glass needs nothing between it and the sky that flattens the backdrop, so
 * the carousel moves cards with transforms only (no `filter` or `opacity`
 * on their wrappers); fading is done on the faces themselves.
 */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
/** The ‹ 12 of 179 › row (44px targets) and the gap above it. */
const CONTROLS = 44 + 12;
/** Card size follows the stage (cq units), all in CSS so the server render
 * already has it. Neighbours sit a card away, turned toward the
 * centre, so they stand just clear of it. `strideFor` mirrors STRIDE. */
const CARD_W = "clamp(264px, 78cqw, 380px)";
const STRIDE = `calc(${CARD_W} * 1.06)`;
const CARD_H = `clamp(280px, calc(100cqh - ${CONTROLS}px), 440px)`;
const TURN_DEG = 30;
const DEPTH_PX = 160;
const TILT_DEG = 7;
const clampNum = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
const strideFor = (w: number) => clampNum(w * 0.78, 264, 380) * 1.06;

/** What "Ask Shalom" sends. Discover cards are open questions, so the
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

/** Ends with a full stop unless it already ends a sentence. */
const sentence = (t: string) => (/[.!?]["'”’)]?$/.test(t.trim()) ? t : `${t}.`);

/** Discover tags, minus any that only repeat the category ("Big Question"
 * under "Big questions"). */
const sameLabel = (a: string, b: string) =>
  a.toLowerCase().replace(/s$/, "") === b.toLowerCase().replace(/s$/, "");
const extraTags = (card: Flashcard) =>
  card.kind === "discover"
    ? card.tags.filter((t) => !sameLabel(t, CATEGORY_LABELS[card.category]))
    : [];

const kindLabel = (card: Flashcard) =>
  card.kind === "discover" ? "Discover" : "Quick fact";

/** Where card `p` (its offset from the centre, in cards) sits in the 3D row.
 * On narrow stages a neighbour is only a sliver at the screen edge, so its
 * words fade out completely; wider stages keep a faint read of them. */
function placement(p: number, narrow: boolean) {
  const a = Math.abs(p);
  const side = clampNum(p, -1, 1);
  return {
    transform: `translate(-50%, -50%) translateX(calc(${p} * ${STRIDE})) translateZ(${-Math.min(a, 2) * DEPTH_PX}px) rotateY(${-side * TURN_DEG}deg)`,
    zIndex: 20 - Math.round(a * 4),
    fade: 1 - Math.min(a, 2) * 0.36,
    words: 1 - Math.min(a, 1) * (narrow ? 1 : 0.8),
  };
}

/**
 * The carousel with no card in it yet: a glass card at its real size and the
 * room for the position row. FlashcardsView shows it until the browser
 * renders the shuffled deck, so nothing moves when the cards arrive.
 */
export function SwipeDeckPlaceholder() {
  return (
    <div
      aria-busy="true"
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      style={{ containerType: "size" }}
    >
      <span className="sr-only">Shuffling the deck…</span>
      <div
        className="flashcard-stage relative w-full"
        style={{ height: CARD_H, containerType: "inline-size" }}
      >
        <div
          data-placeholder-card
          className="flashcard absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ width: CARD_W, height: CARD_H }}
        >
          <div className="flashcard-face flashcard-front" />
        </div>
      </div>
      <div className="h-11" />
    </div>
  );
}

export function SwipeDeck({ cards }: { cards: Flashcard[] }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const stageRef = useRef<HTMLElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const showRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const [stride, setStride] = useState(() => strideFor(400));
  const [narrow, setNarrow] = useState(true);
  const dragRef = useRef(0);
  const gesture = useRef<{
    x: number;
    y: number;
    id: number;
    axis: "x" | "y" | null;
  } | null>(null);
  const asked = useRef(false);
  const suppressClick = useRef(false);
  /** Where keyboard focus goes after the next render, if anywhere. */
  const focusNext = useRef<"show" | "next" | null>(null);

  // Next 16 keeps visited pages alive (hidden) instead of unmounting them.
  // When this deck is hidden mid-gesture (a swipe then a nav tap, or Ask
  // Shalom), clear every in-flight flag so it works on return.
  useLayoutEffect(
    () => () => {
      gesture.current = null;
      asked.current = false;
      suppressClick.current = false;
      dragRef.current = 0;
      setDragging(false);
      setDrag(0);
    },
    [],
  );

  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      setStride(strideFor(el.clientWidth));
      setNarrow(el.clientWidth < 640);
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    return () => ro.disconnect();
  }, []);

  // Keep keyboard focus on the card's main button as it changes.
  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    (target === "next" ? nextRef : showRef).current?.focus({
      preventScroll: true,
    });
  });

  const focusInDeck = () =>
    !!stageRef.current?.parentElement?.contains(document.activeElement) &&
    document.activeElement !== document.body;

  /** Settle the centred card's tilt (pointer left, or a new card). */
  const untilt = () => {
    const el = tiltRef.current;
    if (!el) return;
    el.removeAttribute("data-live");
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
    el.style.removeProperty("--light-x");
    el.style.removeProperty("--light-y");
  };

  const go = (next: number) => {
    const n = clampNum(next, 0, cards.length - 1);
    if (n === index) return;
    if (focusInDeck()) focusNext.current = "show";
    untilt();
    setIndex(n);
    setRevealed(false);
  };

  const reveal = () => {
    if (revealed) return;
    if (focusInDeck()) focusNext.current = "next";
    setRevealed(true);
  };

  const ask = () => {
    const card = cards[index];
    if (!card || asked.current) return;
    asked.current = true;
    queueChatQuestion(chatRequest(card));
    router.push("/", { transitionTypes: ["to-chat"] });
  };

  const setDragPx = (px: number) => {
    dragRef.current = px;
    setDrag(px);
  };

  /** Mouse only: the centred card leans toward the pointer, and a soft
   * light follows it across the glass. Written straight to CSS variables,
   * so it never re-renders the deck. */
  const tiltToward = (e: ReactPointerEvent<HTMLElement>) => {
    const el = tiltRef.current;
    if (!el || reduce || e.pointerType !== "mouse" || gesture.current) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < -0.15 || x > 1.15 || y < -0.15 || y > 1.15) return untilt();
    el.setAttribute("data-live", "");
    el.style.setProperty("--tilt-x", `${(x - 0.5) * 2 * TILT_DEG}deg`);
    el.style.setProperty("--tilt-y", `${(0.5 - y) * 2 * TILT_DEG}deg`);
    el.style.setProperty("--light-x", `${clampNum(x, 0, 1) * 100}%`);
    el.style.setProperty("--light-y", `${clampNum(y, 0, 1) * 100}%`);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    // Primary button only, and one pointer at a time.
    if (e.button !== 0 || gesture.current !== null || asked.current) return;
    gesture.current = {
      x: e.clientX,
      y: e.clientY,
      id: e.pointerId,
      axis: null,
    };
    suppressClick.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) {
      tiltToward(e);
      return;
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (!g.axis) {
      if (Math.hypot(dx, dy) < 8) return;
      suppressClick.current = true;
      g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (g.axis === "y") return;
      // Capture only once it is a drag, so a plain tap still clicks the
      // button or card under the finger.
      e.currentTarget.setPointerCapture(e.pointerId);
      untilt();
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
    if (g.axis === "x") {
      const d = dragRef.current;
      if (Math.abs(d) > stride * 0.2) {
        const steps = Math.max(1, Math.round(Math.abs(d) / stride));
        go(index - Math.sign(d) * steps);
      }
      endDrag();
    }
  };

  /** A cancelled gesture (the page scrolled, the OS took over) never moves
   * or opens a card; it just snaps back. */
  const onPointerCancel = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    suppressClick.current = true;
    endDrag();
  };

  /** True for a click that ends a drag. Keyboard clicks (detail 0) never are. */
  const afterDrag = (e: ReactMouseEvent) => {
    if (!suppressClick.current || e.detail === 0) return false;
    suppressClick.current = false;
    return true;
  };

  /** Taps on a card face (not its buttons): a side card comes to the centre;
   * the centred card turns over to its answer. */
  const onStageClick = (e: ReactMouseEvent<HTMLElement>) => {
    if (asked.current || afterDrag(e)) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a")) return;
    const el = target.closest<HTMLElement>("[data-card]");
    if (!el) return;
    const i = Number(el.dataset.card);
    if (i === index) reveal();
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
  const transition = dragging || reduce ? "none" : `transform 600ms ${EASE}`;
  const passagesText = current.refs.map(passageLabel).join(", ");
  const announcement = !revealed
    ? `Card ${index + 1} of ${cards.length}. ${current.question}`
    : current.kind === "discover"
      ? `Start reading: ${passagesText}.`
      : `Answer: ${sentence(current.answer ?? "")} ${passagesText}.`;

  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-3"
      style={{ containerType: "size" }}
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* biome-ignore lint/a11y/useKeyWithClickEvents: taps on a card face are a shortcut; every action has its own button, and the arrow keys are handled on window */}
      <section
        ref={stageRef}
        aria-roledescription="carousel"
        aria-label="Flashcards. Arrow keys move between cards."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={untilt}
        onClick={onStageClick}
        style={{ height: CARD_H, containerType: "inline-size" }}
        className="flashcard-stage relative w-full touch-pan-y select-none [-webkit-touch-callout:none]"
      >
        {cards.map((card, i) => {
          const p = i - index + drag / stride;
          if (Math.abs(p) > 2.6) return null;
          const { transform, zIndex, fade, words } = placement(p, narrow);
          const active = i === index;
          const open = active && revealed;
          const discover = card.kind === "discover";
          return (
            <article
              key={card.id}
              data-card={i}
              data-kind={card.kind}
              aria-hidden={active ? undefined : true}
              aria-label={
                active ? `Card ${i + 1} of ${cards.length}` : undefined
              }
              className={cn(
                "flashcard absolute top-1/2 left-1/2",
                active ? "cursor-default" : "cursor-pointer",
              )}
              style={{
                width: CARD_W,
                height: CARD_H,
                transform,
                zIndex,
                transition,
              }}
            >
              <div
                ref={active ? tiltRef : undefined}
                className="flashcard-tilt"
                data-open={open ? "" : undefined}
              >
                {/* Front: the question on clear glass. */}
                <div
                  className="flashcard-face flashcard-front flex flex-col p-6"
                  style={{ "--face-fade": fade } as CSSProperties}
                  inert={open}
                >
                  <span aria-hidden className="flashcard-light" />
                  <div
                    className="relative flex min-h-0 flex-1 flex-col"
                    style={{
                      opacity: words,
                      transition: dragging ? "none" : `opacity 600ms ${EASE}`,
                    }}
                  >
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      <p className="text-[13px] leading-[1.35]">
                        <span className="font-semibold">{kindLabel(card)}</span>{" "}
                        · {CATEGORY_LABELS[card.category]}
                      </p>
                      <h2
                        className={cn(
                          "mt-4 text-balance font-semibold",
                          card.question.length > 70
                            ? "text-[22px] leading-[1.25]"
                            : "text-[26px] leading-[1.2]",
                        )}
                      >
                        {card.question}
                      </h2>
                      {discover && (
                        <p className="mt-3 text-[14px]">
                          {[
                            ...extraTags(card),
                            card.minutes ? `${card.minutes} min` : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                    </div>
                    {active && (
                      <button
                        ref={showRef}
                        type="button"
                        onClick={(e) => {
                          if (!afterDrag(e)) reveal();
                        }}
                        className="flashcard-show mt-4 h-12 w-full shrink-0 rounded-2xl font-semibold text-[15px]"
                      >
                        {discover ? "Where to start" : "Show answer"}
                      </button>
                    )}
                  </div>
                </div>

                {/* Back: the answer on milky glass. Only the centred card has one. */}
                {active && (
                  <div
                    className="flashcard-face flashcard-back flex flex-col p-6"
                    inert={!open}
                  >
                    <span aria-hidden className="flashcard-light" />
                    <p className="relative text-[13px] leading-[1.35]">
                      <span className="font-semibold text-[color:var(--card-accent)]">
                        {kindLabel(card)}
                      </span>
                      <span className="text-[color:var(--card-muted)]">
                        {" "}
                        · {CATEGORY_LABELS[card.category]}
                      </span>
                    </p>
                    <p className="relative mt-2 line-clamp-2 text-balance font-medium text-[15px] text-[color:var(--card-muted)] leading-snug">
                      {card.question}
                    </p>
                    <div className="flashcard-scroll relative mt-3 flex min-h-0 flex-1 flex-col overflow-y-auto border-[color:var(--card-rule)] border-t pt-3">
                      {discover ? (
                        <>
                          <p className="font-semibold text-[13px] text-[color:var(--card-accent)]">
                            Start reading
                          </p>
                          <ul className="mt-1.5 flex flex-col gap-1">
                            {card.refs.map((ref) => (
                              <li
                                key={ref}
                                className="font-semibold text-[20px] leading-snug"
                              >
                                {passageLabel(ref)}
                              </li>
                            ))}
                          </ul>
                          <p className="mt-2 text-pretty text-[15px] text-[color:var(--card-muted)] leading-relaxed">
                            An open question, so there is no single answer.
                          </p>
                        </>
                      ) : (
                        <>
                          <p
                            className={cn(
                              "text-balance font-semibold leading-snug",
                              (card.answer?.length ?? 0) > 60
                                ? "text-[19px]"
                                : "text-[23px]",
                            )}
                          >
                            {card.answer}
                          </p>
                          <p className="mt-2 font-medium text-[14px] text-[color:var(--card-accent)]">
                            {card.refs.map(passageLabel).join(" · ")}
                          </p>
                          {card.explanation && (
                            <p className="mt-2 text-pretty text-[14px] text-[color:var(--card-muted)] leading-relaxed">
                              {card.explanation}
                            </p>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          if (!afterDrag(e)) ask();
                        }}
                        className="flashcard-ask -ml-3 mt-1 h-11 shrink-0 self-start rounded-xl px-3 text-left font-semibold text-[15px]"
                      >
                        {discover
                          ? "Talk it through with Shalom"
                          : "Ask Shalom about this"}
                      </button>
                    </div>
                    <button
                      ref={nextRef}
                      type="button"
                      onClick={(e) => {
                        if (!afterDrag(e)) go(last ? 0 : index + 1);
                      }}
                      className="flashcard-primary relative mt-3 h-12 w-full shrink-0 rounded-2xl font-semibold text-[15px]"
                    >
                      {last ? "Start over" : "Next card"}
                    </button>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <nav
        aria-label="Card position"
        className="flex h-11 items-center gap-1 text-white"
      >
        <button
          type="button"
          aria-label="Previous card"
          disabled={index === 0}
          onClick={() => go(index - 1)}
          className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/80 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-24 text-center text-[14px] tabular-nums">
          {index + 1} of {cards.length}
        </span>
        <button
          type="button"
          aria-label="Next card"
          disabled={last}
          onClick={() => go(index + 1)}
          className="grid size-11 place-items-center rounded-full hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white/80 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <ChevronRight className="size-5" />
        </button>
      </nav>
    </div>
  );
}
