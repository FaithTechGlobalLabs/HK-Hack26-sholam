import { LinearGradient } from "expo-linear-gradient";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSession } from "../session";
import { colors, LIMITS } from "../theme";
import { glass, UsageMeter } from "../ui";

export function Paywall() {
  const session = useSession();
  const plan = session.usage?.plan ?? "free";
  const used = session.usage?.questionsUsed ?? 0;
  const limit = session.usage?.questionsLimit ?? LIMITS.freeQuestions;
  const missing = session.usage?.stripe.missing ?? [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRICE_PLUS_MONTH",
    "STRIPE_PRICE_PLUS_YEAR",
  ];
  const ready = session.usage?.stripe.ready === true;

  return (
    <LinearGradient
      colors={[colors.skyTop, colors.skyMid, colors.skyDeep]}
      locations={[0, 0.46, 1]}
      style={styles.backdrop}
    >
      <ScrollView contentContainerStyle={styles.sheet}>
        <Text style={styles.kicker}>
          {plan === "plus" ? "Shalom Plus" : "Free plan"}
        </Text>
        <Text style={styles.title}>
          {plan === "plus" ? "Your daily room is higher." : "More room to ask."}
        </Text>
        <View style={[glass, styles.card]}>
          <UsageMeter used={used} limit={limit} label="Questions today" />
          <Text style={styles.soft}>
            Saved chats {session.chats.length} / {session.savedChatLimit}.
            Resets{" "}
            {session.usage?.resetsAt
              ? new Date(session.usage.resetsAt).toUTCString()
              : "at midnight UTC"}
            .
          </Text>
        </View>
        <View style={styles.compare}>
          <PlanColumn
            name="Free"
            questions={`${LIMITS.freeQuestions}/day`}
            chats={`${LIMITS.freeChats} chats`}
            active={plan === "free"}
          />
          <PlanColumn
            name="Plus"
            questions={`${LIMITS.plusQuestions}/day`}
            chats={`${LIMITS.plusChats} chats`}
            active={plan === "plus"}
          />
        </View>
        <Pressable
          style={[styles.primary, session.billingBusy && styles.disabled]}
          disabled={session.billingBusy}
          onPress={() => void session.startCheckout("month")}
        >
          <Text style={styles.primaryText}>
            {session.usage?.prices.month
              ? `Monthly · ${session.usage.prices.month}`
              : "Subscribe monthly"}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.secondary, session.billingBusy && styles.disabled]}
          disabled={session.billingBusy}
          onPress={() => void session.startCheckout("year")}
        >
          <Text style={styles.secondaryText}>
            {session.usage?.prices.year
              ? `Yearly · ${session.usage.prices.year}`
              : "Subscribe yearly"}
          </Text>
        </Pressable>
        {plan === "plus" && (
          <Pressable onPress={() => void session.openPortal()}>
            <Text style={styles.link}>Manage subscription</Text>
          </Pressable>
        )}
        {!ready && (
          <Text style={styles.note}>
            Checkout waits for server keys: {missing.join(", ")}. Put a
            restricted Stripe key in the server env, not in the app. The webhook
            is required so renewals, failed payments, and cancellations update
            Plus.
          </Text>
        )}
        <Text style={styles.note}>
          Stripe Tax is off until you have an active tax registration. The price
          you pay is the Stripe Price, shown on Checkout.
        </Text>
        {session.billingError ? (
          <Text style={styles.error}>{session.billingError}</Text>
        ) : null}
        <Pressable onPress={() => void session.refreshUsage()}>
          <Text style={styles.link}>Refresh purchase status</Text>
        </Pressable>
        <Pressable onPress={session.closePaywall}>
          <Text style={styles.link}>Not now</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

function PlanColumn({
  name,
  questions,
  chats,
  active,
}: {
  name: string;
  questions: string;
  chats: string;
  active: boolean;
}) {
  return (
    <View style={[glass, styles.plan, active && styles.planOn]}>
      <Text style={styles.planName}>{name}</Text>
      <Text style={styles.planFact}>{questions}</Text>
      <Text style={styles.planFact}>{chats}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.skyMid,
  },
  sheet: { padding: 24, paddingTop: 72, gap: 14 },
  kicker: {
    color: colors.textSoft,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    fontSize: 13,
  },
  title: { color: colors.text, fontSize: 32, fontWeight: "600" },
  card: { borderRadius: 24, padding: 18, gap: 12 },
  soft: { color: colors.textSoft, fontSize: 13, lineHeight: 18 },
  compare: { flexDirection: "row", gap: 10 },
  plan: { flex: 1, borderRadius: 22, padding: 16, gap: 6 },
  planOn: { backgroundColor: "rgba(255,255,255,0.28)" },
  planName: { color: colors.white, fontSize: 18, fontWeight: "700" },
  planFact: { color: colors.text, fontSize: 15 },
  primary: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
  },
  primaryText: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  secondary: {
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.45)",
  },
  secondaryText: { color: colors.white, fontWeight: "600", fontSize: 16 },
  disabled: { opacity: 0.45 },
  note: { color: colors.textSoft, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger, fontSize: 14 },
  link: {
    color: colors.white,
    textAlign: "center",
    fontSize: 16,
    paddingVertical: 6,
  },
});
