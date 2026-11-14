import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { loadDeck } from "../api";
import { shuffle } from "../deck";
import { passageLabel } from "../format";
import { useSession } from "../session";
import { loadSettings, saveLocalCards } from "../storage";
import { colors, DOCK_BODY } from "../theme";
import type { Flashcard } from "../types";
import { categoryLabel, uid } from "../types";
import { glass } from "../ui";

type Kind = "all" | "fact" | "discover";

export function CardsScreen() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [local, setLocal] = useState<Flashcard[]>([]);
  const [kind, setKind] = useState<Kind>("all");
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState(0);
  const dragStart = useRef(0);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancel = false;
    void loadDeck(session.apiBase).then((deck) => {
      if (!cancel) setCards(shuffle(deck));
    });
    void loadSettings().then((settings) => {
      if (!cancel) setLocal(settings.localCards);
    });
    return () => {
      cancel = true;
    };
  }, [session.apiBase]);

  const deck = useMemo(() => {
    const all = [...local, ...cards];
    const needle = query.trim().toLowerCase();
    const filtered = all.filter((card) => {
      if (kind !== "all" && card.kind !== kind) return false;
      if (!needle) return true;
      return (
        card.question.toLowerCase().includes(needle) ||
        (card.answer ?? "").toLowerCase().includes(needle) ||
        categoryLabel(card.category).toLowerCase().includes(needle)
      );
    });
    if (!session.focusCardId) return filtered;
    const focus = filtered.findIndex((card) => card.id === session.focusCardId);
    const focused = filtered[focus];
    if (!focused || focus <= 0) return filtered;
    return [focused, ...filtered.filter((_, item) => item !== focus)];
  }, [cards, kind, local, query, session.focusCardId]);

  const card = deck[index] ?? deck[0];
  const filterKey = `${kind}\0${query}\0${session.focusCardId ?? ""}`;
  const [filterSeen, setFilterSeen] = useState(filterKey);
  if (filterSeen !== filterKey) {
    setFilterSeen(filterKey);
    setIndex(0);
    setFlipped(false);
  }

  function step(dir: number) {
    if (!deck.length) return;
    setFlipped(false);
    setIndex((current) => (current + dir + deck.length) % deck.length);
    void Haptics.selectionAsync();
  }

  return (
    <View
      style={[
        styles.screen,
        { paddingBottom: DOCK_BODY + Math.max(insets.bottom, 12) },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.title}>Flashcards</Text>
        <Pressable style={styles.newBtn} onPress={() => setCreating(true)}>
          <Text style={styles.newText}>+ New card</Text>
        </Pressable>
      </View>
      <View style={styles.kinds}>
        {(
          [
            ["all", "All"],
            ["fact", "Quick facts"],
            ["discover", "Discover"],
          ] as const
        ).map(([value, label]) => (
          <Pressable
            key={value}
            style={[styles.kind, kind === value && styles.kindOn]}
            onPress={() => setKind(value)}
          >
            <Text
              style={[styles.kindText, kind === value && styles.kindTextOn]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search the deck"
        placeholderTextColor="rgba(255,255,255,0.65)"
        style={[glass, styles.search]}
      />
      {session.focusCardId ? (
        <Pressable onPress={session.clearFocus}>
          <Text style={styles.link}>Show the full deck</Text>
        </Pressable>
      ) : null}
      {card ? (
        <View
          style={styles.stage}
          onStartShouldSetResponder={() => true}
          onResponderGrant={(event) => {
            dragStart.current = event.nativeEvent.pageX;
          }}
          onResponderMove={(event) => {
            setDrag(event.nativeEvent.pageX - dragStart.current);
          }}
          onResponderRelease={(event) => {
            const dx = event.nativeEvent.pageX - dragStart.current;
            if (dx < -70) step(1);
            else if (dx > 70) step(-1);
            setDrag(0);
          }}
        >
          {[-1, 0, 1].map((offset) => {
            const item = deck[index + offset];
            if (!item) return null;
            const front = offset === 0;
            return (
              <View
                key={item.id}
                pointerEvents={front ? "auto" : "none"}
                style={[
                  styles.slot,
                  {
                    zIndex: 10 - Math.abs(offset),
                    opacity: front ? 1 : 0.8,
                    transform: [
                      { perspective: 900 },
                      { translateX: offset * 250 + (front ? drag : 0) },
                      { rotateY: `${-offset * 30}deg` },
                      { scale: front ? 1 : 0.94 },
                    ],
                  },
                ]}
              >
                <View style={[glass, styles.card, front && styles.cardFront]}>
                  <Text style={styles.meta}>
                    {front
                      ? `${categoryLabel(item.category)} · ${
                          flipped
                            ? item.kind === "discover"
                              ? "Starting points"
                              : "Answer"
                            : item.kind === "discover"
                              ? "Discover"
                              : "Question"
                        }`
                      : item.kind === "discover"
                        ? "Discover"
                        : "Quick fact"}
                  </Text>
                  {front && !flipped ? (
                    <Text style={styles.question}>{item.question}</Text>
                  ) : null}
                  {front && flipped && item.kind === "fact" ? (
                    <>
                      <Text style={styles.question}>{item.answer}</Text>
                      {item.explanation ? (
                        <Text style={styles.body}>{item.explanation}</Text>
                      ) : null}
                    </>
                  ) : null}
                  {front && flipped && item.kind === "discover"
                    ? item.refs.map((ref) => (
                        <Text key={ref} style={styles.questionSmall}>
                          {passageLabel(ref)}
                        </Text>
                      ))
                    : null}
                  {!front ? (
                    <Text style={styles.question} numberOfLines={4}>
                      {item.question}
                    </Text>
                  ) : null}
                  {front ? (
                    <Pressable
                      style={styles.show}
                      onPress={() => {
                        setFlipped((value) => !value);
                        void Haptics.selectionAsync();
                      }}
                    >
                      <Text style={styles.showText}>
                        {flipped
                          ? "Show question"
                          : item.kind === "discover"
                            ? "Where to start"
                            : "Show answer"}
                      </Text>
                    </Pressable>
                  ) : null}
                  {front && flipped ? (
                    <Pressable onPress={() => session.ask(item.question)}>
                      <Text style={styles.link}>Ask Shalom</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.body}>No cards match.</Text>
      )}
      <View style={styles.pager}>
        <Pressable onPress={() => step(-1)} hitSlop={10}>
          <Text style={styles.navText}>‹</Text>
        </Pressable>
        <Text style={styles.count}>
          {deck.length ? (index % deck.length) + 1 : 0} of {deck.length}
        </Text>
        <Pressable onPress={() => step(1)} hitSlop={10}>
          <Text style={styles.navText}>›</Text>
        </Pressable>
      </View>
      {creating && (
        <NewCard
          onClose={() => setCreating(false)}
          onSave={(card) => {
            const next = [card, ...local];
            setLocal(next);
            void saveLocalCards(next);
            setCreating(false);
            setKind("fact");
            setIndex(0);
          }}
        />
      )}
    </View>
  );
}

function NewCard({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (card: Flashcard) => void;
}) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [refs, setRefs] = useState("JHN.3.16");
  const ready = question.trim().length >= 8 && answer.trim().length > 0;
  return (
    <View style={styles.formWrap}>
      <View style={[glass, styles.form]}>
        <Text style={styles.title}>New card</Text>
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Question"
          placeholderTextColor="rgba(255,255,255,0.65)"
          style={styles.field}
        />
        <TextInput
          value={answer}
          onChangeText={setAnswer}
          placeholder="Answer"
          placeholderTextColor="rgba(255,255,255,0.65)"
          style={styles.field}
        />
        <TextInput
          value={refs}
          onChangeText={setRefs}
          placeholder="JHN.3.16"
          placeholderTextColor="rgba(255,255,255,0.65)"
          autoCapitalize="characters"
          style={styles.field}
        />
        <Pressable
          style={[styles.save, !ready && styles.saveOff]}
          disabled={!ready}
          onPress={() =>
            onSave({
              id: `local-${uid()}`,
              kind: "fact",
              question: question.trim(),
              answer: answer.trim(),
              refs: refs
                .split(/[,\s]+/)
                .map((ref) => ref.trim())
                .filter(Boolean),
              category: "fun-facts",
            })
          }
        >
          <Text style={styles.saveText}>Save on this phone</Text>
        </Pressable>
        <Pressable onPress={onClose}>
          <Text style={styles.link}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 18, paddingTop: 8, gap: 10 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: colors.white, fontSize: 22, fontWeight: "600" },
  newBtn: {
    backgroundColor: "rgba(120,175,255,0.55)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  newText: { color: colors.white, fontWeight: "600" },
  kinds: { flexDirection: "row", gap: 8 },
  kind: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  kindOn: { backgroundColor: "rgba(255,255,255,0.92)" },
  kindText: { color: colors.white, fontSize: 13 },
  kindTextOn: { color: colors.ink, fontWeight: "700" },
  search: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.white,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  slot: {
    position: "absolute",
    width: "88%",
    maxWidth: 360,
  },
  cardFront: {
    backgroundColor: "rgba(30, 78, 176, 0.62)",
  },
  card: {
    width: "100%",
    minHeight: 390,
    borderRadius: 28,
    padding: 22,
    gap: 12,
    backgroundColor: "rgba(104, 158, 236, 0.55)",
  },
  meta: { color: colors.textSoft, fontSize: 13 },
  question: {
    color: colors.white,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
  },
  questionSmall: { color: colors.white, fontSize: 20, fontWeight: "600" },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  count: { color: colors.white, fontSize: 14 },
  pager: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  show: {
    marginTop: "auto",
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  showText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  navText: { color: colors.white, fontWeight: "600" },
  link: { color: colors.white, textAlign: "center" },
  formWrap: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(12, 36, 90, 0.45)",
    justifyContent: "flex-end",
  },
  form: { borderRadius: 28, padding: 18, gap: 10, margin: 12 },
  field: {
    color: colors.white,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.35)",
    paddingVertical: 8,
    fontSize: 16,
  },
  save: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  saveOff: { opacity: 0.45 },
  saveText: { color: colors.ink, fontWeight: "700" },
});
