import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useState } from "react";
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
          <Text style={styles.newText}>New card</Text>
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
        <Pressable
          style={[glass, styles.card]}
          onPress={() => {
            setFlipped((value) => !value);
            void Haptics.selectionAsync();
          }}
        >
          <Text style={styles.meta}>
            {categoryLabel(card.category)} ·{" "}
            {flipped
              ? card.kind === "discover"
                ? "Starting points"
                : "Answer"
              : card.kind === "discover"
                ? "Discover"
                : "Question"}
          </Text>
          {!flipped ? (
            <Text style={styles.question}>{card.question}</Text>
          ) : card.kind === "fact" ? (
            <>
              <Text style={styles.question}>{card.answer}</Text>
              {card.explanation ? (
                <Text style={styles.body}>{card.explanation}</Text>
              ) : null}
              <Text style={styles.meta}>
                {card.refs.map(passageLabel).join(" · ")}
              </Text>
            </>
          ) : (
            <>
              {card.refs.map((ref) => (
                <Text key={ref} style={styles.questionSmall}>
                  {passageLabel(ref)}
                </Text>
              ))}
              {card.takeaway ? (
                <Text style={styles.body}>{card.takeaway}</Text>
              ) : null}
              <Text style={styles.meta}>
                Places to start, not a fixed answer.
              </Text>
            </>
          )}
          <Text style={styles.count}>
            {deck.length ? (index % deck.length) + 1 : 0} / {deck.length}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.body}>No cards match.</Text>
      )}
      <View style={styles.nav}>
        <Pressable style={styles.navBtn} onPress={() => step(-1)}>
          <Text style={styles.navText}>Previous</Text>
        </Pressable>
        <Pressable
          style={styles.navBtn}
          onPress={() => card && session.ask(card.question)}
        >
          <Text style={styles.navText}>Ask</Text>
        </Pressable>
        <Pressable style={styles.navBtn} onPress={() => step(1)}>
          <Text style={styles.navText}>Next</Text>
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
  title: { color: colors.white, fontSize: 28, fontWeight: "700" },
  newBtn: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newText: { color: colors.ink, fontWeight: "700" },
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
  card: { flex: 1, borderRadius: 28, padding: 22, gap: 12 },
  meta: { color: colors.textSoft, fontSize: 13 },
  question: {
    color: colors.white,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
  },
  questionSmall: { color: colors.white, fontSize: 20, fontWeight: "600" },
  body: { color: colors.text, fontSize: 16, lineHeight: 22 },
  count: { marginTop: "auto", color: colors.textSoft, fontSize: 13 },
  nav: { flexDirection: "row", gap: 8 },
  navBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
  },
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
