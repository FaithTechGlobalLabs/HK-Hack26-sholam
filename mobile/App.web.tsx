import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

/**
 * Web preview of the iOS app. It loads the Shalom website itself, so the
 * sky, React Bits dock, splash, glass, and flashcard carousel are the
 * original components rather than a second drawing of them.
 */
const SITE = "http://127.0.0.1:5310/";

export default function App() {
  useEffect(() => {
    const frame = document.createElement("iframe");
    frame.src = SITE;
    frame.title = "Shalom";
    frame.style.cssText =
      "position:fixed;inset:0;width:100%;height:100%;border:0;background:#5a8ed6";
    document.body.appendChild(frame);
    document.body.style.margin = "0";
    document.body.style.background = "#5a8ed6";
    return () => frame.remove();
  }, []);

  return <View style={styles.fill} />;
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#5a8ed6" },
});
