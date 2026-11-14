import { LinearGradient } from "expo-linear-gradient";
import { type ReactNode, useEffect } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { CloudSky } from "./CloudSky";
import { colors } from "./theme";

export function Sky({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.textContent =
      "@import url('https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap'); #root, #root * { font-family: Geist, ui-sans-serif, sans-serif; }";
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  return (
    <View style={styles.fill}>
      <LinearGradient
        colors={[
          colors.skyTop,
          colors.skyMid,
          colors.skyDeep,
          colors.skyBottom,
        ]}
        locations={[0, 0.4, 0.75, 1]}
        style={StyleSheet.absoluteFill}
      />
      <CloudSky />
      <View style={styles.front}>{children}</View>
    </View>
  );
}

/** The cloud cross from the website mark, drawn with views. */
export function Mark({ size = 64 }: { size?: number }) {
  const unit = size / 32;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.bar,
          {
            left: 12.5 * unit,
            top: 5.85 * unit,
            width: 7 * unit,
            height: 23.3 * unit,
            borderRadius: 3.5 * unit,
          },
        ]}
      />
      <View
        style={[
          styles.bar,
          {
            left: 3.5 * unit,
            top: 11.15 * unit,
            width: 25 * unit,
            height: 7 * unit,
            borderRadius: 3.5 * unit,
          },
        ]}
      />
      {[
        [16.6, 6.25, 3.4],
        [13.9, 8.35, 2.1],
        [7.2, 11.65, 2.4],
        [10.3, 10.85, 2.2],
        [21.9, 10.75, 2.3],
        [25, 11.75, 2.3],
      ].map(([x, y, r]) => (
        <View
          key={`${x}-${y}`}
          style={{
            position: "absolute",
            left: ((x ?? 0) - (r ?? 0)) * unit,
            top: ((y ?? 0) - (r ?? 0)) * unit,
            width: (r ?? 0) * 2 * unit,
            height: (r ?? 0) * 2 * unit,
            borderRadius: (r ?? 0) * unit,
            backgroundColor: colors.white,
          }}
        />
      ))}
    </View>
  );
}

export const glass = {
  backgroundColor: "rgba(116, 168, 240, 0.48)",
  borderColor: "rgba(255,255,255,0.4)",
  borderWidth: 1,
  // Web-only frost. Native keeps the translucent fill.
  backdropFilter: "blur(22px) saturate(1.6)",
} as const;

export function UsageMeter({
  used,
  limit,
  label,
}: {
  used: number;
  limit: number;
  label: string;
}) {
  const ratio = limit > 0 ? Math.min(used / limit, 1) : 0;
  return (
    <View style={styles.meter}>
      <View style={styles.meterRow}>
        <Text style={styles.meterLabel}>{label}</Text>
        <Text style={styles.meterCount}>
          {used} / {limit}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[styles.fillBar, { width: `${Math.round(ratio * 100)}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.skyTop },
  front: { flex: 1 },
  bar: {
    position: "absolute",
    backgroundColor: colors.white,
  },
  meter: { gap: 8 },
  meterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  meterLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  meterCount: { color: colors.textSoft, fontSize: 14 },
  track: {
    height: 8,
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
  },
  fillBar: {
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.white,
  },
});
