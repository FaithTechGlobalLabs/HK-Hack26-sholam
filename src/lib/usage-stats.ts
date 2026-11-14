"use client";

/**
 * Per-device usage counters kept in localStorage: flashcard swipes, letters
 * opened and the distinct days sholam was opened. They move to the database
 * once accounts are wired up.
 */

const SWIPES = "sholam:stats:swipes";
const LETTERS_READ = "sholam:stats:letters-read";
const DAYS = "sholam:stats:days";
const EVENT = "sholam:stats";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // Storage unavailable: stats just won't persist.
  }
}

function bump(key: string) {
  write(key, String((Number(read(key)) || 0) + 1));
}

export const countSwipe = () => bump(SWIPES);
export const countLetterRead = () => bump(LETTERS_READ);

/** Record today as a day the app was used (local date). */
export function recordVisitDay() {
  const now = new Date();
  const today = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  let days: string[] = [];
  try {
    days = JSON.parse(read(DAYS) ?? "[]");
  } catch {}
  if (!days.includes(today)) write(DAYS, JSON.stringify([...days, today]));
}

export interface UsageStats {
  swipes: number;
  lettersRead: number;
  days: number;
}

export function readStats(): UsageStats {
  let days: string[] = [];
  try {
    days = JSON.parse(read(DAYS) ?? "[]");
  } catch {}
  return {
    swipes: Number(read(SWIPES)) || 0,
    lettersRead: Number(read(LETTERS_READ)) || 0,
    days: Math.max(1, days.length),
  };
}

/** Subscribe to stat changes in this tab and others. */
export function onStatsChange(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
