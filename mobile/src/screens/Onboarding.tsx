import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSession } from "../session";
import { colors, LIMITS } from "../theme";
import { glass, Mark } from "../ui";

const STEPS = [
  {
    kicker: "Shalom",
    title: "Ask about the Bible, Jesus, and faith.",
    body: "A guide that cites verses it looked up, and a deck of cards for the questions worth sitting with.",
  },
  {
    kicker: "Guide",
    title: "Answers you can check.",
    body: "Shalom Guide looks up the Berean Standard Bible. Verse chips open the text. It can still be wrong, so check what matters.",
  },
  {
    kicker: "Flashcards",
    title: "Quick facts and open questions.",
    body: "Flip a fact for the answer. Discover cards give Scripture starting points, then you can explore the question in chat.",
  },
] as const;

export function Onboarding() {
  const session = useSession();
  const [index, setIndex] = useState(0);
  const page = STEPS[index];
  const last = page == null;

  return (
    <View style={styles.screen}>
      <Mark size={72} />
      {page ? (
        <View style={styles.copy}>
          <Text style={styles.kicker}>{page.kicker}</Text>
          <Text style={styles.title}>{page.title}</Text>
          <Text style={styles.body}>{page.body}</Text>
        </View>
      ) : (
        <View style={[glass, styles.limitCard]}>
          <Text style={styles.kicker}>Free plan</Text>
          <Text style={styles.title}>
            Start here. Upgrade when you want more.
          </Text>
          <Text style={styles.body}>
            {LIMITS.freeQuestions} guide questions a day, and {LIMITS.freeChats}{" "}
            saved chats. Shalom Plus raises that to {LIMITS.plusQuestions}{" "}
            questions and {LIMITS.plusChats} chats. The count resets at midnight
            UTC.
          </Text>
        </View>
      )}
      <View style={styles.dots}>
        {[0, 1, 2, 3].map((dot) => (
          <View key={dot} style={[styles.dot, dot === index && styles.dotOn]} />
        ))}
      </View>
      {last ? (
        <View style={styles.actions}>
          <Pressable
            style={styles.primary}
            onPress={() => session.finishOnboarding(false)}
          >
            <Text style={styles.primaryText}>Continue free</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            onPress={() => session.finishOnboarding(true)}
          >
            <Text style={styles.secondaryText}>See Shalom Plus</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.primary} onPress={() => setIndex(index + 1)}>
          <Text style={styles.primaryText}>Continue</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 28,
    paddingTop: 64,
    paddingBottom: 110,
    justifyContent: "center",
    alignItems: "center",
    gap: 28,
  },
  copy: { gap: 12, alignItems: "center" },
  kicker: {
    color: colors.textSoft,
    fontSize: 14,
    textAlign: "center",
  },
  title: {
    color: colors.text,
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "600",
    textAlign: "center",
  },
  body: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 23,
    textAlign: "center",
  },
  limitCard: { borderRadius: 28, padding: 22, gap: 10, alignSelf: "stretch" },
  dots: { flexDirection: "row", gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  dotOn: { width: 22, backgroundColor: colors.white },
  actions: { gap: 10, alignSelf: "stretch" },
  primary: {
    alignSelf: "stretch",
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: { color: colors.ink, fontSize: 17, fontWeight: "700" },
  secondary: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  secondaryText: { color: colors.white, fontSize: 17, fontWeight: "600" },
});
