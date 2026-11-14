import { useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../session";
import { API_PRESETS } from "../storage";
import { getSupabase, supabaseConfig } from "../supabase";
import { colors, DOCK_BODY } from "../theme";
import { glass, UsageMeter } from "../ui";

export function AccountScreen() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [server, setServer] = useState(session.apiBase);
  const supabaseReady = supabaseConfig() != null;
  const plan = session.usage?.plan ?? "free";

  async function sendLink() {
    const supabase = getSupabase();
    if (!supabase) {
      setNote(
        "Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
      );
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: "shalom://auth" },
    });
    setNote(error ? error.message : "Check your email for the sign-in link.");
  }

  return (
    <ScrollView
      contentContainerStyle={[
        styles.screen,
        { paddingBottom: DOCK_BODY + Math.max(insets.bottom, 16) },
      ]}
    >
      <Text style={styles.title}>
        {plan === "plus" ? "Shalom Plus" : "Free plan"}
      </Text>
      <View style={[glass, styles.card]}>
        <UsageMeter
          used={session.usage?.questionsUsed ?? 0}
          limit={session.usage?.questionsLimit ?? 8}
          label="Questions today"
        />
        <Text style={styles.meta}>
          Saved chats {session.chats.length} / {session.savedChatLimit}
        </Text>
      </View>
      <Pressable style={styles.primary} onPress={session.openPaywall}>
        <Text style={styles.primaryText}>
          {plan === "plus" ? "Plan and billing" : "See Shalom Plus"}
        </Text>
      </Pressable>
      <Text style={styles.section}>Connections</Text>
      <Status
        name="Guide"
        value={
          session.usage?.ai === "live"
            ? "Live, using the server OpenRouter key"
            : "Demo until OPENROUTER_API_KEY is set on the server"
        }
      />
      <Status
        name="Supabase"
        value={
          session.usage?.supabase === "configured" || supabaseReady
            ? "Keys are set"
            : "Add the public URL and publishable key when you have them"
        }
      />
      <Status
        name="Stripe"
        value={
          session.usage?.stripe.ready
            ? "Checkout is ready"
            : `Waiting for ${(session.usage?.stripe.missing ?? ["server keys"]).join(", ")}`
        }
      />
      <Text style={styles.section}>Sign in</Text>
      {supabaseReady ? (
        <View style={styles.sign}>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="rgba(255,255,255,0.65)"
            style={[glass, styles.input]}
          />
          <Pressable style={styles.secondary} onPress={() => void sendLink()}>
            <Text style={styles.secondaryText}>Email me a link</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.meta}>
          Sign-in uses Supabase. Chats stay on this phone until those keys are
          added. Allow shalom://auth in the Supabase redirect list.
        </Text>
      )}
      {note ? <Text style={styles.meta}>{note}</Text> : null}
      <Text style={styles.section}>Server</Text>
      <View style={styles.presets}>
        {(
          [
            ["This computer", API_PRESETS.local],
            ["This network", API_PRESETS.network],
            ["Production", API_PRESETS.production],
          ] as const
        ).map(([label, url]) => (
          <Pressable
            key={url}
            style={[styles.preset, session.apiBase === url && styles.presetOn]}
            onPress={() => {
              setServer(url);
              session.setApiBase(url);
              void session.refreshUsage();
            }}
          >
            <Text style={styles.presetText}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={server}
        onChangeText={setServer}
        autoCapitalize="none"
        autoCorrect={false}
        style={[glass, styles.input]}
      />
      <Pressable
        style={styles.secondary}
        onPress={() => {
          session.setApiBase(server);
          void session.refreshUsage();
        }}
      >
        <Text style={styles.secondaryText}>Use this server</Text>
      </Pressable>
      <Pressable onPress={session.replayOnboarding}>
        <Text style={styles.link}>Replay the intro</Text>
      </Pressable>
    </ScrollView>
  );
}

function Status({ name, value }: { name: string; value: string }) {
  return (
    <View style={styles.status}>
      <Text style={styles.statusName}>{name}</Text>
      <Text style={styles.meta}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 12 },
  title: { color: colors.white, fontSize: 28, fontWeight: "700" },
  card: { borderRadius: 24, padding: 16, gap: 10 },
  meta: { color: colors.textSoft, fontSize: 14, lineHeight: 20 },
  primary: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryText: { color: colors.ink, fontWeight: "700", fontSize: 16 },
  section: {
    color: colors.white,
    fontSize: 18,
    fontWeight: "700",
    marginTop: 8,
  },
  status: { gap: 2 },
  statusName: { color: colors.white, fontWeight: "600" },
  sign: { gap: 8 },
  input: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.white,
  },
  secondary: {
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  secondaryText: { color: colors.white, fontWeight: "600" },
  presets: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  preset: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  presetOn: { backgroundColor: "rgba(255,255,255,0.9)" },
  presetText: { color: colors.ink, fontWeight: "600" },
  link: { color: colors.white, textAlign: "center", paddingVertical: 8 },
});
