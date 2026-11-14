"use client";

import { Mailbox } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  LETTER_TOPIC_LABELS,
  LETTER_TOPICS,
  type Letter,
  type LetterTopic,
} from "@/lib/letters";
import {
  countLetterRead,
  onStatsChange,
  readStats,
  type UsageStats,
} from "@/lib/usage-stats";
import { cn } from "@/lib/utils";

const DROP_OUT_MS = 420;

function pick(letters: Letter[], topic: LetterTopic | null, notId?: string) {
  const pool = letters.filter(
    (l) => (!topic || l.topic === topic) && l.id !== notId,
  );
  const from = pool.length
    ? pool
    : letters.filter((l) => !topic || l.topic === topic);
  return from[Math.floor(Math.random() * from.length)] ?? letters[0];
}

/** Counts up from zero when it first appears. */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1200);
      const eased = 1 - (1 - t) ** 3;
      const v = Math.round(begin + (value - begin) * eased);
      setShown(v);
      from.current = v;
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown.toLocaleString()}</>;
}

function LetterPaper({
  letter,
  className,
}: {
  letter: Letter;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "relative rounded-2xl px-7 py-9 text-slate-800 shadow-[0_24px_60px_-20px_rgb(35_75_150/0.45)] sm:px-12",
        className,
      )}
      style={{
        background: "linear-gradient(180deg, #fdfbf6 0%, #f8f4ec 100%)",
        textShadow: "none",
      }}
    >
      {/* A strip of tape holding the letter. */}
      <span
        aria-hidden
        className="absolute -top-3 left-1/2 h-7 w-28 -translate-x-1/2 -rotate-2 rounded-sm bg-white/70 shadow-sm backdrop-blur"
      />
      <p className="font-mono text-[11px] text-slate-500 uppercase tracking-[0.2em]">
        A letter about {LETTER_TOPIC_LABELS[letter.topic].toLowerCase()}
      </p>
      <div className="mt-6 space-y-4 font-serif text-[17px] leading-relaxed">
        <p>{letter.greeting}</p>
        {letter.body.map((para) => (
          <p key={para}>{para}</p>
        ))}
        <p className="pt-2 italic text-slate-600">{letter.signoff}</p>
      </div>
    </article>
  );
}

export function LettersView({ letters }: { letters: Letter[] }) {
  const [topic, setTopic] = useState<LetterTopic | null>(null);
  const [current, setCurrent] = useState<Letter | null>(null);
  const [leaving, setLeaving] = useState<Letter | null>(null);
  const [drop, setDrop] = useState(0);
  const [stats, setStats] = useState<UsageStats | null>(null);
  const busy = useRef(false);

  // Pick the first letter on the client so each visit gets a random one.
  useEffect(() => {
    setCurrent(pick(letters, null));
    countLetterRead();
  }, [letters]);

  useEffect(() => {
    const update = () => setStats(readStats());
    update();
    return onStatsChange(update);
  }, []);

  const next = (nextTopic: LetterTopic | null = topic) => {
    if (busy.current || !current) return;
    busy.current = true;
    setLeaving(current);
    setCurrent(null);
    window.setTimeout(() => {
      setLeaving(null);
      setCurrent(pick(letters, nextTopic, current.id));
      setDrop((d) => d + 1);
      countLetterRead();
      busy.current = false;
    }, DROP_OUT_MS);
  };

  const chooseTopic = (t: LetterTopic | null) => {
    setTopic(t);
    if (current && t && current.topic !== t) next(t);
  };

  const available = LETTER_TOPICS.filter((t) =>
    letters.some((l) => l.topic === t),
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pt-6 pb-16">
        <div className="flex items-center gap-3">
          <Mailbox className="size-6" />
          <h1 className="mr-auto font-semibold text-xl">Letters</h1>
        </div>
        <p className="mt-1 text-sm text-white/80">
          Words of encouragement written by others, delivered to you at random.
        </p>

        <div className="relative mt-8 min-h-[26rem]">
          {leaving && <LetterPaper letter={leaving} className="letter-out" />}
          {current && (
            <LetterPaper
              key={`${current.id}-${drop}`}
              letter={current}
              className="letter-drop"
            />
          )}
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => next()}
            className="glass-btn rounded-full px-5 py-2.5 text-sm"
          >
            Read another letter
          </button>
        </div>

        <section className="glass mt-8 rounded-2xl p-5">
          <h2 className="font-semibold">What would you like to read next?</h2>
          <p className="mt-1 text-sm text-white/80">
            Choose a topic, or keep letters coming at random.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[null, ...available].map((t) => (
              <button
                key={t ?? "any"}
                type="button"
                aria-pressed={topic === t}
                onClick={() => chooseTopic(t)}
                className={cn(
                  "glass-btn rounded-full px-3.5 py-1.5 text-sm",
                  topic === t && "bg-white/85 text-[#2f68c2] hover:bg-white",
                )}
              >
                {t ? LETTER_TOPIC_LABELS[t] : "Any topic"}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-12 grid gap-8 text-center sm:grid-cols-3">
          <div>
            <p className="font-mono font-semibold text-4xl">
              <CountUp value={letters.length} />
            </p>
            <p className="mt-2 text-sm text-white/80">
              Letters delivered to sholam
            </p>
          </div>
          <div>
            <p className="font-mono font-semibold text-4xl">
              {stats ? <CountUp value={stats.swipes} /> : "–"}
            </p>
            <p className="mt-2 text-sm text-white/80">
              Flashcards you've swiped
            </p>
          </div>
          <div>
            <p className="font-mono font-semibold text-4xl">
              {stats ? <CountUp value={stats.days} /> : "–"}
            </p>
            <p className="mt-2 text-sm text-white/80">
              {stats?.days === 1 ? "Day" : "Days"} you've spent with sholam
            </p>
          </div>
        </section>

        <p className="mt-12 text-center text-white/75 text-xs leading-relaxed">
          If you're thinking about ending your life or are in danger, please
          contact your local emergency number or a crisis line now, and tell
          someone you trust.
        </p>
      </div>
    </div>
  );
}
