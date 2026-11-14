import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { AccountScreen } from "./src/screens/AccountScreen";
import { CardsScreen } from "./src/screens/CardsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { Onboarding } from "./src/screens/Onboarding";
import { Paywall } from "./src/screens/Paywall";
import { SessionProvider, useSession } from "./src/session";
import { colors, DOCK_BODY } from "./src/theme";
import type { Tab } from "./src/types";
import { Mark, Sky } from "./src/ui";

WebBrowser.maybeCompleteAuthSession();

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  if (!session.ready) {
    return (
      <Sky>
        <View style={styles.splash}>
          <Mark size={84} />
          <Text style={styles.word}>Shalom</Text>
        </View>
        <StatusBar style="light" />
      </Sky>
    );
  }
  if (!session.onboarded) {
    return (
      <Sky>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <Onboarding />
        </View>
        <StatusBar style="light" />
      </Sky>
    );
  }
  return (
    <Sky>
      <View style={[styles.shell, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.brand}>
            <Mark size={28} />
            <Text style={styles.wordSmall}>Shalom</Text>
          </View>
          <Pressable style={styles.pill} onPress={session.openPaywall}>
            <Text style={styles.pillText}>
              {session.usage?.plan === "plus" ? "Plus · " : ""}
              {session.questionsLeft} left
            </Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          {session.tab === "chat" && <ChatScreen />}
          {session.tab === "cards" && <CardsScreen />}
          {session.tab === "chats" && <ChatsScreen />}
          {session.tab === "account" && <AccountScreen />}
        </View>
        <View style={[styles.dock, { bottom: Math.max(insets.bottom, 10) }]}>
          <DockButton tab="chat" label="Chat" />
          <DockButton tab="cards" label="Cards" />
          <DockButton tab="chats" label="Chats" />
          <DockButton tab="account" label="Account" />
        </View>
      </View>
      {session.paywall ? <Paywall /> : null}
      <StatusBar style="light" />
    </Sky>
  );
}

function DockButton({ tab, label }: { tab: Tab; label: string }) {
  const session = useSession();
  const active = session.tab === tab;
  return (
    <Pressable style={styles.dockItem} onPress={() => session.setTab(tab)}>
      <View style={[styles.dockFace, active && styles.dockFaceOn]}>
        <Text style={[styles.dockLabel, active && styles.dockLabelOn]}>
          {label}
        </Text>
      </View>
      {active ? (
        <View style={styles.underline} />
      ) : (
        <View style={styles.underlineGap} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  word: { color: colors.white, fontSize: 40, fontWeight: "600" },
  shell: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8 },
  wordSmall: { color: colors.white, fontSize: 20, fontWeight: "700" },
  pill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  pillText: { color: colors.white, fontWeight: "600", fontSize: 13 },
  body: { flex: 1 },
  dock: {
    position: "absolute",
    left: 16,
    right: 16,
    height: DOCK_BODY - 16,
    borderRadius: 28,
    backgroundColor: colors.dock,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  dockItem: { flex: 1, alignItems: "center", gap: 4 },
  dockFace: {
    borderRadius: 16,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  dockFaceOn: {
    backgroundColor: "rgba(255,255,255,0.55)",
  },
  dockLabel: { color: colors.white, fontSize: 12, fontWeight: "600" },
  dockLabelOn: { color: colors.ink },
  underline: {
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.white,
  },
  underlineGap: { width: 18, height: 3 },
});
