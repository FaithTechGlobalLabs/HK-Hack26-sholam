import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Mark } from "./src/icons";
import { SkyDock } from "./src/SkyDock";
import { AccountScreen } from "./src/screens/AccountScreen";
import { CardsScreen } from "./src/screens/CardsScreen";
import { ChatScreen } from "./src/screens/ChatScreen";
import { ChatsScreen } from "./src/screens/ChatsScreen";
import { Onboarding } from "./src/screens/Onboarding";
import { Paywall } from "./src/screens/Paywall";
import { SessionProvider, useSession } from "./src/session";
import { colors } from "./src/theme";
import { Sky } from "./src/ui";

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
          <Pressable
            style={styles.pill}
            onPress={() => session.setTab("account")}
          >
            <Text style={styles.pillText}>
              {session.usage?.plan === "plus" ? "Plus" : "Sign in"}
            </Text>
          </Pressable>
        </View>
        <View style={styles.body}>
          {session.tab === "chat" && <ChatScreen />}
          {session.tab === "cards" && <CardsScreen />}
          {session.tab === "chats" && <ChatsScreen />}
          {session.tab === "account" && <AccountScreen />}
        </View>
        <SkyDock
          tab={session.tab}
          onTab={session.setTab}
          bottom={Math.max(insets.bottom, 12)}
        />
      </View>
      {session.paywall ? <Paywall /> : null}
      <StatusBar style="light" />
    </Sky>
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
  wordSmall: {
    color: colors.white,
    fontSize: 17,
    fontWeight: "600",
    letterSpacing: -0.3,
  },
  pill: {
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  pillText: { color: colors.white, fontWeight: "600", fontSize: 14 },
  body: { flex: 1 },
  dockSlot: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 22,
    backgroundColor: "rgba(120, 175, 255, 0.46)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
  },
  dockFace: {
    width: 52,
    height: 46,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
  },
  dockFaceOn: {
    backgroundColor: "rgba(255,255,255,0.42)",
    borderColor: "rgba(255,255,255,0.7)",
  },
});
