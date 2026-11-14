import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../session";
import { colors, DOCK_BODY } from "../theme";

export function ChatsScreen() {
  const session = useSession();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      contentContainerStyle={[
        styles.list,
        { paddingBottom: DOCK_BODY + Math.max(insets.bottom, 12) },
      ]}
    >
      <View style={styles.top}>
        <Text style={styles.title}>Chats</Text>
        <Pressable style={styles.newBtn} onPress={session.newChat}>
          <Text style={styles.newText}>New</Text>
        </Pressable>
      </View>
      <Text style={styles.meta}>
        {session.chats.length} / {session.savedChatLimit} saved
        {session.usage?.plan !== "plus"
          ? ". On the free plan a new chat replaces the oldest once the list is full."
          : "."}
      </Text>
      {session.chats.length === 0 ? (
        <Text style={styles.empty}>
          No saved chats yet. Ask something in Guide.
        </Text>
      ) : (
        session.chats.map((chat) => (
          <Pressable
            key={chat.id}
            style={styles.row}
            onPress={() => session.openChat(chat.id)}
          >
            <View style={styles.rowText}>
              <Text style={styles.chatTitle}>{chat.title}</Text>
              <Text style={styles.meta}>
                {new Date(chat.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <Pressable onPress={() => session.deleteChat(chat.id)} hitSlop={8}>
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
          </Pressable>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { padding: 18, gap: 12 },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { color: colors.white, fontSize: 28, fontWeight: "700" },
  newBtn: {
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newText: { color: colors.ink, fontWeight: "700" },
  meta: { color: colors.textSoft, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.text, fontSize: 16, lineHeight: 22 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.2)",
  },
  rowText: { flex: 1, gap: 4 },
  chatTitle: { color: colors.white, fontSize: 16, fontWeight: "600" },
  delete: { color: colors.white, fontSize: 13 },
});
