/**
 * Every size, count and rate limit for a chat turn, in one place.
 * Sizes are characters, not tokens (about 4 characters per English token).
 * Safe to import from client code and tests: no server-only imports.
 * docs/ARCHITECTURE.md ("Limits") explains each group.
 */
export const LIMITS = {
  /** What the browser sends with each turn. */
  client: {
    historyTurns: 12,
    historyChars: 16_000,
  },
  /** What `/api/chat` accepts before trimming. Above these it answers 400. */
  request: {
    maxHistoryItems: 200,
    maxHistoryItemChars: 20_000,
    maxMessageChars: 8_000,
  },
  /** What reaches the model. */
  model: {
    historyTurns: 8,
    historyTurnChars: 1_200,
    historyChars: 6_000,
    priorQuestions: 4,
    priorQuestionChars: 200,
    matchedCards: 3,
    matchedCardChars: 280,
    /**
     * All message text per request, system prompt included. Tool
     * definitions are fixed and not counted. Oldest history goes first,
     * then tool results are clipped.
     */
    promptChars: 32_000,
    maxTokens: 900,
  },
  /** What a tool may return to the model. */
  tools: {
    versesPerLookup: 40,
    /** Chapters one lookup may touch, so "Genesis 1-50" is a few queries, not 50. */
    chaptersPerLookup: 6,
    searchHits: 10,
    cardHits: 5,
    resultChars: 6_000,
    /** Only for the no-database fallback (bible.helloao.org). */
    fetchTimeoutMs: 8_000,
    searchIndexTimeoutMs: 20_000,
    failedLoadRetryMs: 60_000,
  },
  /** Model calls per user turn. */
  turn: {
    maxModelCalls: 4,
    maxToolRounds: 2,
    /** Verses the server fetches for the one corrective rewrite. */
    correctionVerses: 8,
  },
  /**
   * Usage limits across all serverless instances (Postgres counters).
   * OpenRouter allows 1000 free-model requests a day to accounts that have
   * bought at least 10 credits (50 below that); this account has, so the
   * global ceiling stays under 1000. Override with SHOLAM_DAILY_MODEL_CALLS.
   */
  usage: {
    visitorTurnsPerHour: 20,
    visitorTurnsPerDay: 60,
    globalModelCallsPerDay: 800,
  },
} as const;

/** The global daily model-call ceiling, with the env override. */
export function dailyModelCallCeiling(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number(env.SHOLAM_DAILY_MODEL_CALLS);
  return Number.isInteger(raw) && raw > 0
    ? raw
    : LIMITS.usage.globalModelCallsPerDay;
}
