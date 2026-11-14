import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import type { Flashcard, LocalChat } from "./types";
import { uid } from "./types";

const DEVICE = "shalom.device";
const ONBOARD = "shalom.onboarded";
const API = "shalom.api";
const CUSTOMER = "shalom.customer";
const CHATS = "shalom.chats.v1";
const CARDS = "shalom.localCards.v1";

export const API_PRESETS = {
  local: "http://localhost:5310",
  network: "http://192.168.0.114:5310",
  production: "https://sholam.vercel.app",
} as const;

export function defaultApiBase(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  return Platform.OS === "web" ? API_PRESETS.local : API_PRESETS.network;
}

export interface Settings {
  deviceId: string;
  onboarded: boolean;
  apiBase: string;
  customerId: string | null;
  chats: LocalChat[];
  localCards: Flashcard[];
}

export async function loadSettings(): Promise<Settings> {
  const [deviceId, onboarded, apiBase, customerId, chats, localCards] =
    await Promise.all([
      AsyncStorage.getItem(DEVICE),
      AsyncStorage.getItem(ONBOARD),
      AsyncStorage.getItem(API),
      AsyncStorage.getItem(CUSTOMER),
      AsyncStorage.getItem(CHATS),
      AsyncStorage.getItem(CARDS),
    ]);
  const nextDevice = deviceId ?? `dev_${uid().replace(/-/g, "").slice(0, 20)}`;
  if (!deviceId) await AsyncStorage.setItem(DEVICE, nextDevice);
  return {
    deviceId: nextDevice,
    onboarded: onboarded === "1",
    apiBase: (apiBase ?? defaultApiBase()).replace(/\/$/, ""),
    customerId: customerId || null,
    chats: parseJson<LocalChat[]>(chats, []),
    localCards: parseJson<Flashcard[]>(localCards, []),
  };
}

export function saveOnboarded(seen: boolean): Promise<void> {
  return AsyncStorage.setItem(ONBOARD, seen ? "1" : "0").then(() => undefined);
}

export function saveApiBase(url: string): Promise<void> {
  return AsyncStorage.setItem(API, url.replace(/\/$/, "")).then(
    () => undefined,
  );
}

export function saveCustomer(id: string | null): Promise<void> {
  return id
    ? AsyncStorage.setItem(CUSTOMER, id).then(() => undefined)
    : AsyncStorage.removeItem(CUSTOMER).then(() => undefined);
}

export function saveChats(chats: LocalChat[]): Promise<void> {
  return AsyncStorage.setItem(CHATS, JSON.stringify(chats.slice(0, 30))).then(
    () => undefined,
  );
}

export function saveLocalCards(cards: Flashcard[]): Promise<void> {
  return AsyncStorage.setItem(CARDS, JSON.stringify(cards)).then(
    () => undefined,
  );
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
