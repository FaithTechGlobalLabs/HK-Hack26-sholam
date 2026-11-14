import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { streamChat } from "../api";
import { blocksOf, passageLabel, type Span } from "../format";
import { useSession } from "../session";
import { colors, DOCK_BODY } from "../theme";
import type { AgentEvent, ChatMessage, VerseRecord } from "../types";
import { titleFromMessage, uid } from "../types";
import { glass } from "../ui";

const SUGGESTIONS = [
  "Who is Jesus?",
  "Did a donkey really talk in the Bible?",
  "Why does God allow suffering?",
  "What if I have doubts about God?",
];

const TOOLS: Record<string, string> = {
  search_flashcards: "Searching flashcards",
  lookup_verses: "Looking up verses",
  search_bible: "Searching the Bible",
  propose_flashcard: "Drafting a flashcard",
};

function blank(role: ChatMessage["role"], text = ""): ChatMessage {
  return {
    id: uid(),
    role,
    text,
    verses: {},
    tools: [],
    cards: [],
    streaming: role === "assistant",
  };
}

function applyEvent(message: ChatMessage, event: AgentEvent): ChatMessage {
  switch (event.type) {
    case "text_delta":
      return { ...message, text: message.text + event.text };
    case "reset":
      return { ...message, text: event.text ?? "" };
    case "tool_start":
      return {
        ...message,
        tools: [
          ...message.tools,
          { id: event.id, name: event.name, done: false },
        ],
      };
    case "tool_result":
      return {
        ...message,
        tools: message.tools.map((tool) =>
          tool.id === event.id
            ? { ...tool, done: true, summary: event.summary }
            : tool,
        ),
      };
    case "verses":
      return {
        ...message,
        verses: {
          ...message.verses,
          ...Object.fromEntries(event.verses.map((verse) => [verse.id, verse])),
        },
      };
    case "flashcards":
      return { ...message, cards: event.cards };
    case "flashcard_proposal":
      return { ...message, proposal: event.draft };
    case "error":
      return { ...message, error: event.message, streaming: false };
    case "done":
    case "citations":
      return event.type === "done" ? { ...message, streaming: false } : message;
    default:
      return message;
  }
}

export function ChatScreen() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [verse, setVerse] = useState<VerseRecord | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sentAsk = useRef<string | null>(null);
  const chatsRef = useRef(session.chats);
  chatsRef.current = session.chats;
  const bottom = DOCK_BODY + Math.max(insets.bottom, 12);

  useEffect(() => {
    const existing = chatsRef.current.find(
      (chat) => chat.id === session.activeChatId,
    );
    setMessages(
      existing
        ? existing.messages.map((message) => ({
            ...blank(message.role, message.text),
            id: message.id,
            streaming: false,
          }))
        : [],
    );
  }, [session.activeChatId]);

  const pendingId = session.pending?.id;
  const pendingText = session.pending?.text;
  const sendRef = useRef<(text: string) => Promise<void>>(
    async () => undefined,
  );
  useEffect(() => {
    if (!pendingId || !pendingText || sentAsk.current === pendingId) return;
    sentAsk.current = pendingId;
    session.clearPending();
    void sendRef.current(pendingText);
  }, [pendingId, pendingText, session]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (session.atQuestionLimit) {
      session.openPaywall();
      return;
    }
    setDraft("");
    const user = blank("user", trimmed);
    const assistant = blank("assistant");
    const snapshot = [...messages, user, assistant];
    setMessages(snapshot);
    setBusy(true);
    const history = snapshot
      .slice(0, -2)
      .filter((message) => message.text)
      .slice(-12)
      .map((message) => ({
        role: message.role,
        content: message.text.slice(0, 2000),
      }));
    const controller = new AbortController();
    abortRef.current = controller;
    let latest = snapshot;
    const updateAssistant = (event: AgentEvent) => {
      latest = latest.map((message) =>
        message.id === assistant.id ? applyEvent(message, event) : message,
      );
      setMessages(latest);
      if (event.type === "error" && event.code === "plan_limit") {
        session.openPaywall();
        void session.refreshUsage();
      }
    };
    try {
      await streamChat({
        apiBase: session.apiBase,
        deviceId: session.deviceId,
        customerId: session.customerId,
        chatId: session.activeChatId,
        message: trimmed,
        history,
        onEvent: updateAssistant,
        signal: controller.signal,
      });
    } catch (err) {
      updateAssistant({
        type: "error",
        message:
          err instanceof Error ? err.message : "Could not reach Shalom Guide.",
      });
    } finally {
      updateAssistant({ type: "done" });
      setBusy(false);
      abortRef.current = null;
      void session.refreshUsage();
      const saved = latest.find((message) => message.id === assistant.id);
      if (saved && !saved.error) {
        await session.saveChat({
          id: session.activeChatId,
          title: titleFromMessage(trimmed),
          updatedAt: new Date().toISOString(),
          messages: latest
            .filter((message) => message.text || message.role === "user")
            .map((message) => ({
              id: message.id,
              role: message.role,
              text: message.text,
            })),
        });
      }
    }
  }

  sendRef.current = send;

  const empty = messages.length === 0;

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[
          styles.thread,
          empty && styles.threadEmpty,
          { paddingBottom: 12 },
        ]}
      >
        {empty ? (
          <View style={styles.hero}>
            <Text style={styles.kicker}>Shalom Guide</Text>
            <Text style={styles.title}>
              Ask about the Bible, Jesus, faith, or anything you are curious
              about.
            </Text>
            <Text style={styles.sub}>
              {session.usage?.ai === "live"
                ? "Live answers, with verses looked up rather than remembered."
                : "Demo answers until an OpenRouter key is set on the server."}{" "}
              {session.questionsLeft} questions left today.
            </Text>
          </View>
        ) : (
          messages.map((message) =>
            message.role === "user" ? (
              <View key={message.id} style={styles.user}>
                <Text style={styles.userText}>{message.text}</Text>
              </View>
            ) : (
              <Assistant
                key={message.id}
                message={message}
                onVerse={setVerse}
                onCard={session.openCard}
              />
            ),
          )
        )}
      </ScrollView>
      {empty && (
        <View style={styles.suggestions}>
          {SUGGESTIONS.map((suggestion) => (
            <Pressable
              key={suggestion}
              style={styles.chip}
              onPress={() => void send(suggestion)}
            >
              <Text style={styles.chipText}>{suggestion}</Text>
            </Pressable>
          ))}
        </View>
      )}
      <View style={[styles.composerWrap, { marginBottom: bottom }]}>
        <View style={[glass, styles.composer]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Ask anything"
            placeholderTextColor="rgba(255,255,255,0.7)"
            style={styles.input}
            multiline
          />
          {busy ? (
            <Pressable
              style={styles.send}
              onPress={() => abortRef.current?.abort()}
              accessibilityLabel="Stop"
            >
              <View style={styles.stop} />
            </Pressable>
          ) : (
            <Pressable
              style={[styles.send, !draft.trim() && styles.sendOff]}
              onPress={() => {
                void Haptics.selectionAsync();
                void send(draft);
              }}
              accessibilityLabel="Send"
            >
              <Text style={styles.sendLabel}>↑</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.fine}>
          Verse text is from the Berean Standard Bible. Shalom Guide can still
          make mistakes.
        </Text>
      </View>
      <Modal visible={verse != null} transparent animationType="fade">
        <Pressable style={styles.modal} onPress={() => setVerse(null)}>
          <View style={[glass, styles.verseCard]}>
            <Text style={styles.verseLabel}>{verse?.label}</Text>
            <Text style={styles.verseText}>{verse?.text}</Text>
            <Text style={styles.fine}>{verse?.translation}</Text>
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function answerBlocks(
  message: ChatMessage,
  onVerse: (verse: VerseRecord) => void,
) {
  const nodes = [];
  let cursor = 0;
  for (const block of blocksOf(message.text)) {
    const key = `${message.id}:${cursor}:${block.kind}`;
    cursor += block.spans.reduce(
      (sum, span) =>
        sum + (span.kind === "verse" ? span.id.length : span.text.length),
      1,
    );
    const spans = [];
    let spanCursor = cursor;
    for (const span of block.spans) {
      const spanKey = `${spanCursor}:${span.kind}:${span.kind === "verse" ? span.id : span.text}`;
      spanCursor += span.kind === "verse" ? span.id.length : span.text.length;
      spans.push(
        <SpanView
          key={spanKey}
          span={span}
          verses={message.verses}
          onVerse={onVerse}
        />,
      );
    }
    nodes.push(
      <Text key={key} style={styles.answer}>
        {block.kind === "li" ? "• " : ""}
        {spans}
      </Text>,
    );
  }
  return nodes;
}

function Assistant({
  message,
  onVerse,
  onCard,
}: {
  message: ChatMessage;
  onVerse: (verse: VerseRecord) => void;
  onCard: (id: string) => void;
}) {
  const running = message.tools.filter((tool) => !tool.done);
  return (
    <View style={styles.assistant}>
      {running.map((tool) => (
        <Text key={tool.id} style={styles.tool}>
          {TOOLS[tool.name] ?? tool.name}…
        </Text>
      ))}
      {message.text ? (
        <View style={styles.blocks}>{answerBlocks(message, onVerse)}</View>
      ) : message.streaming ? (
        <Text style={styles.tool}>Thinking…</Text>
      ) : null}
      {message.error ? <Text style={styles.error}>{message.error}</Text> : null}
      {message.cards.map((card) => (
        <Pressable
          key={card.id}
          style={styles.chip}
          onPress={() => onCard(card.id)}
        >
          <Text style={styles.chipText}>{card.question}</Text>
        </Pressable>
      ))}
      {message.proposal ? (
        <View style={[glass, styles.proposal]}>
          <Text style={styles.kicker}>Flashcard</Text>
          <Text style={styles.answer}>{message.proposal.question}</Text>
          <Text style={styles.sub}>{message.proposal.answer}</Text>
          <Text style={styles.fine}>
            {message.proposal.refs.map(passageLabel).join(" · ")}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function SpanView({
  span,
  verses,
  onVerse,
}: {
  span: Span;
  verses: Record<string, VerseRecord>;
  onVerse: (verse: VerseRecord) => void;
}) {
  if (span.kind === "strong")
    return <Text style={styles.strong}>{span.text}</Text>;
  if (span.kind === "verse") {
    const record = verses[span.id];
    return (
      <Text
        style={styles.verseLink}
        onPress={() =>
          onVerse(
            record ?? {
              id: span.id,
              label: span.label,
              text: "This verse was cited, but its text was not loaded with the answer.",
              translation: "BSB",
            },
          )
        }
      >
        {span.label}
      </Text>
    );
  }
  return <Text>{span.text}</Text>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  thread: { paddingHorizontal: 18, paddingTop: 12, gap: 14 },
  threadEmpty: { flexGrow: 1, justifyContent: "center" },
  hero: { gap: 8 },
  kicker: { color: colors.textSoft, fontSize: 13, letterSpacing: 0.4 },
  title: {
    color: colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
  },
  sub: { color: colors.text, fontSize: 15, lineHeight: 21 },
  user: {
    alignSelf: "flex-end",
    maxWidth: "86%",
    backgroundColor: colors.user,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userText: { color: colors.text, fontSize: 16, lineHeight: 22 },
  assistant: { gap: 8, maxWidth: "100%" },
  blocks: {
    backgroundColor: colors.assistant,
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  answer: { color: colors.text, fontSize: 16, lineHeight: 23 },
  strong: { fontWeight: "700", color: colors.text },
  verseLink: {
    color: colors.white,
    textDecorationLine: "underline",
    fontWeight: "600",
  },
  tool: { color: colors.textSoft, fontSize: 13 },
  error: { color: colors.danger, fontSize: 14 },
  suggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(30,70,150,0.35)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  chipText: { color: colors.white, fontSize: 14 },
  composerWrap: { paddingHorizontal: 16, gap: 8 },
  composer: {
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    color: colors.white,
    fontSize: 16,
    maxHeight: 120,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  send: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  sendOff: { opacity: 0.4 },
  sendLabel: { color: colors.ink, fontSize: 18, fontWeight: "700" },
  stop: {
    width: 12,
    height: 12,
    borderRadius: 2,
    backgroundColor: colors.ink,
  },
  fine: { color: "rgba(255,255,255,0.75)", fontSize: 12, textAlign: "center" },
  proposal: { borderRadius: 18, padding: 14, gap: 6 },
  modal: {
    flex: 1,
    backgroundColor: "rgba(10,30,70,0.45)",
    justifyContent: "flex-end",
    padding: 16,
  },
  verseCard: { borderRadius: 24, padding: 20, gap: 8, marginBottom: 24 },
  verseLabel: { color: colors.white, fontSize: 18, fontWeight: "700" },
  verseText: { color: colors.text, fontSize: 16, lineHeight: 24 },
});
