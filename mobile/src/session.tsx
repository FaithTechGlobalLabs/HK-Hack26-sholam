import * as WebBrowser from "expo-web-browser";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Linking } from "react-native";
import {
  confirmCheckout,
  createCheckout,
  createPortal,
  fetchUsage,
} from "./api";
import {
  loadSettings,
  saveApiBase,
  saveChats,
  saveCustomer,
  saveOnboarded,
} from "./storage";
import { LIMITS } from "./theme";
import type { BillingInterval, LocalChat, Tab, UsageSnapshot } from "./types";
import { uid } from "./types";

async function confirmFromUrl(apiBase: string, deviceId: string, url: string) {
  let sessionId: string | null = null;
  try {
    sessionId = new URL(url).searchParams.get("session_id");
  } catch {
    return null;
  }
  if (!sessionId) return null;
  return confirmCheckout(apiBase, deviceId, sessionId);
}

interface PendingAsk {
  id: string;
  text: string;
}

interface SessionValue {
  ready: boolean;
  onboarded: boolean;
  finishOnboarding: (openPlus: boolean) => void;
  replayOnboarding: () => void;
  tab: Tab;
  setTab: (tab: Tab) => void;
  apiBase: string;
  setApiBase: (url: string) => void;
  deviceId: string;
  customerId: string | null;
  usage: UsageSnapshot | null;
  refreshUsage: () => Promise<void>;
  paywall: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  chats: LocalChat[];
  activeChatId: string;
  newChat: () => void;
  openChat: (id: string) => void;
  deleteChat: (id: string) => void;
  saveChat: (chat: LocalChat) => Promise<void>;
  savedChatLimit: number;
  questionsLeft: number;
  atQuestionLimit: boolean;
  pending: PendingAsk | null;
  ask: (question: string) => void;
  clearPending: () => void;
  focusCardId: string | null;
  openCard: (id: string) => void;
  clearFocus: () => void;
  startCheckout: (interval: BillingInterval) => Promise<void>;
  openPortal: () => Promise<void>;
  billingError: string | null;
  billingBusy: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [tab, setTab] = useState<Tab>("chat");
  const [apiBase, setApiBaseState] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageSnapshot | null>(null);
  const [paywall, setPaywall] = useState(false);
  const [chats, setChats] = useState<LocalChat[]>([]);
  const [activeChatId, setActiveChatId] = useState("");
  const [pending, setPending] = useState<PendingAsk | null>(null);
  const [focusCardId, setFocusCardId] = useState<string | null>(null);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingBusy, setBillingBusy] = useState(false);

  const applyUsage = useCallback((next: UsageSnapshot) => {
    setUsage(next);
    if (next.customerId) {
      setCustomerId(next.customerId);
      void saveCustomer(next.customerId);
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!deviceId || !apiBase) return;
    try {
      applyUsage(await fetchUsage(apiBase, deviceId, customerId));
    } catch {
      // The paywall still shows the free caps when the server is unreachable.
    }
  }, [apiBase, applyUsage, customerId, deviceId]);

  useEffect(() => {
    let cancel = false;
    void loadSettings().then((settings) => {
      if (cancel) return;
      setDeviceId(settings.deviceId);
      setOnboarded(settings.onboarded);
      setApiBaseState(settings.apiBase);
      setCustomerId(settings.customerId);
      setChats(settings.chats);
      setActiveChatId(uid());
      setReady(true);
    });
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    if (ready) void refreshUsage();
  }, [ready, refreshUsage]);

  useEffect(() => {
    const onUrl = ({ url }: { url: string }) => {
      if (!deviceId || !apiBase) return;
      void confirmFromUrl(apiBase, deviceId, url)
        .then((result) => {
          if (!result) return;
          applyUsage(result.usage);
          if (result.usage.plan === "plus") setPaywall(false);
        })
        .catch((err: unknown) => {
          setBillingError(
            err instanceof Error ? err.message : "Could not confirm purchase.",
          );
        });
    };
    const sub = Linking.addEventListener("url", onUrl);
    return () => sub.remove();
  }, [apiBase, applyUsage, deviceId]);

  const finishOnboarding = useCallback((openPlus: boolean) => {
    setOnboarded(true);
    void saveOnboarded(true);
    if (openPlus) setPaywall(true);
  }, []);

  const replayOnboarding = useCallback(() => {
    setOnboarded(false);
    void saveOnboarded(false);
    setPaywall(false);
  }, []);

  const setApiBase = useCallback((url: string) => {
    const next = url.trim().replace(/\/$/, "");
    setApiBaseState(next);
    void saveApiBase(next);
  }, []);

  const savedChatLimit = usage?.savedChatLimit ?? LIMITS.freeChats;
  const questionsLeft = Math.max(
    (usage?.questionsLimit ?? LIMITS.freeQuestions) -
      (usage?.questionsUsed ?? 0),
    0,
  );
  const atQuestionLimit =
    usage != null && usage.questionsUsed >= usage.questionsLimit;

  const saveChat = useCallback(
    async (chat: LocalChat) => {
      const next = [chat, ...chats.filter((item) => item.id !== chat.id)]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .slice(0, savedChatLimit);
      setChats(next);
      await saveChats(next);
    },
    [chats, savedChatLimit],
  );

  const newChat = useCallback(() => {
    setActiveChatId(uid());
    setTab("chat");
  }, []);

  const openChat = useCallback((id: string) => {
    setActiveChatId(id);
    setTab("chat");
  }, []);

  const deleteChat = useCallback(
    (id: string) => {
      const next = chats.filter((chat) => chat.id !== id);
      setChats(next);
      void saveChats(next);
      if (id === activeChatId) setActiveChatId(uid());
    },
    [activeChatId, chats],
  );

  const ask = useCallback((question: string) => {
    setPending({ id: uid(), text: question });
    setTab("chat");
  }, []);

  const claimReturn = useCallback(
    async (url: string) => {
      const result = await confirmFromUrl(apiBase, deviceId, url);
      if (!result) return;
      applyUsage(result.usage);
      if (result.usage.plan === "plus") setPaywall(false);
      if (result.pending) {
        setBillingError("Stripe has not marked this payment as paid yet.");
      }
    },
    [apiBase, applyUsage, deviceId],
  );

  const startCheckout = useCallback(
    async (interval: BillingInterval) => {
      setBillingBusy(true);
      setBillingError(null);
      try {
        const url = await createCheckout(apiBase, deviceId, interval);
        const redirect = `${apiBase}/api/billing/return`;
        const result = await WebBrowser.openAuthSessionAsync(url, redirect);
        if (result.type === "success") await claimReturn(result.url);
      } catch (err) {
        setBillingError(
          err instanceof Error ? err.message : "Checkout failed.",
        );
      } finally {
        setBillingBusy(false);
      }
    },
    [apiBase, claimReturn, deviceId],
  );

  const openPortal = useCallback(async () => {
    if (!customerId) {
      setBillingError("Subscribe first, then you can manage the plan here.");
      setPaywall(true);
      return;
    }
    setBillingBusy(true);
    setBillingError(null);
    try {
      const url = await createPortal(apiBase, deviceId, customerId);
      await WebBrowser.openBrowserAsync(url);
      await refreshUsage();
    } catch (err) {
      setBillingError(
        err instanceof Error ? err.message : "Could not open billing.",
      );
    } finally {
      setBillingBusy(false);
    }
  }, [apiBase, customerId, deviceId, refreshUsage]);

  const value = useMemo<SessionValue>(
    () => ({
      ready,
      onboarded,
      finishOnboarding,
      replayOnboarding,
      tab,
      setTab,
      apiBase,
      setApiBase,
      deviceId,
      customerId,
      usage,
      refreshUsage,
      paywall,
      openPaywall: () => setPaywall(true),
      closePaywall: () => setPaywall(false),
      chats,
      activeChatId,
      newChat,
      openChat,
      deleteChat,
      saveChat,
      savedChatLimit,
      questionsLeft,
      atQuestionLimit,
      pending,
      ask,
      clearPending: () => setPending(null),
      focusCardId,
      openCard: (id: string) => {
        setFocusCardId(id);
        setTab("cards");
      },
      clearFocus: () => setFocusCardId(null),
      startCheckout,
      openPortal,
      billingError,
      billingBusy,
    }),
    [
      ready,
      onboarded,
      finishOnboarding,
      replayOnboarding,
      tab,
      apiBase,
      setApiBase,
      deviceId,
      customerId,
      usage,
      refreshUsage,
      paywall,
      chats,
      activeChatId,
      newChat,
      openChat,
      deleteChat,
      saveChat,
      savedChatLimit,
      questionsLeft,
      atQuestionLimit,
      pending,
      ask,
      focusCardId,
      startCheckout,
      openPortal,
      billingError,
      billingBusy,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
