import { StyleSheet, View } from "react-native";

/** Native fallback. The web preview uses the same vapour sky as the site. */
export function CloudSky() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.puff} />
      <View style={styles.cross} />
    </View>
  );
}

const styles = StyleSheet.create({
  puff: {
    position: "absolute",
    width: 220,
    height: 70,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.55)",
    top: 70,
    left: -30,
  },
  cross: {
    position: "absolute",
    width: 90,
    height: 160,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.72)",
    right: 24,
    top: "38%",
  },
});
