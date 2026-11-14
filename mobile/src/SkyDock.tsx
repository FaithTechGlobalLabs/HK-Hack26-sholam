import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { IconCards, IconChat, IconChats, IconEnter } from "./icons";
import type { Tab } from "./types";

/** Same spring as the React Bits dock on the website (mass 0.1, stiffness 150, damping 12). */
const BASE = 50;
const PEAK = 70;
const DISTANCE = 200;
const GAP = 10;
const MASS = 0.1;
const STIFFNESS = 150;
const DAMPING = 12;

const ITEMS: { tab: Tab; label: string; Icon: typeof IconChat }[] = [
  { tab: "chat", label: "Chat", Icon: IconChat },
  { tab: "cards", label: "Flashcards", Icon: IconCards },
  { tab: "chats", label: "Chats", Icon: IconChats },
  { tab: "account", label: "Sign in", Icon: IconEnter },
];

export function SkyDock({
  tab,
  onTab,
  bottom,
}: {
  tab: Tab;
  onTab: (tab: Tab) => void;
  bottom: number;
}) {
  const rootRef = useRef<HTMLElement | null>(null);
  const sizes = useRef(ITEMS.map(() => BASE));
  const velocity = useRef(ITEMS.map(() => 0));
  const pointer = useRef({ x: 0, inside: false });
  const [drawn, setDrawn] = useState(ITEMS.map(() => BASE));
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (!alive) return;
      const dt = Math.min(1 / 30, Math.max(0.001, (now - last) / 1000));
      last = now;
      const node = rootRef.current as unknown as {
        getBoundingClientRect?: () => { left: number; width: number };
      } | null;
      const rect = node?.getBoundingClientRect?.();
      if (rect) {
        const center = rect.left + rect.width / 2;
        const focus = pointer.current.inside
          ? pointer.current.x - center
          : null;
        let cursor = -((BASE * ITEMS.length + GAP * (ITEMS.length - 1)) / 2);
        const rest = ITEMS.map(() => {
          const middle = cursor + BASE / 2;
          cursor += BASE + GAP;
          return middle;
        });
        const k = STIFFNESS / MASS;
        const c = DAMPING / MASS;
        const steps = Math.max(1, Math.ceil(dt * 240));
        const h = dt / steps;
        const next = sizes.current.map((size, index) => {
          const reach =
            focus === null
              ? 1
              : Math.abs(focus - (rest[index] ?? 0)) / DISTANCE;
          const influence =
            reach < 1 ? Math.cos((reach * Math.PI) / 2) ** 2 : 0;
          const target = BASE + (PEAK - BASE) * influence;
          let vel = velocity.current[index] ?? 0;
          let value = size;
          for (let step = 0; step < steps; step++) {
            vel = (vel + h * k * (target - value)) / (1 + h * c + h * h * k);
            value += vel * h;
          }
          velocity.current[index] = vel;
          return value;
        });
        sizes.current = next;
        setDrawn(next);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <View pointerEvents="box-none" style={[styles.slot, { bottom }]}>
      <View
        ref={rootRef as never}
        style={styles.panel}
        onPointerMove={(event) => {
          pointer.current = { x: event.nativeEvent.pageX, inside: true };
          const node = rootRef.current;
          const left = node?.getBoundingClientRect?.().left ?? 0;
          setHover(nearestIndex(event.nativeEvent.pageX - left));
        }}
        onPointerLeave={() => {
          pointer.current.inside = false;
          setHover(null);
        }}
      >
        {ITEMS.map((item, index) => {
          const size = drawn[index] ?? BASE;
          const active = item.tab === tab;
          return (
            <Pressable
              key={item.tab}
              accessibilityLabel={item.label}
              onPress={() => onTab(item.tab)}
              style={[
                styles.tile,
                {
                  width: size,
                  height: size,
                  transform: [{ translateY: -(size - BASE) * 0.45 }],
                },
                active && styles.tileOn,
              ]}
            >
              <item.Icon />
              {hover === index ? (
                <View style={styles.label}>
                  <Text style={styles.labelText}>{item.label}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function nearestIndex(localX: number) {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  let cursor = 8;
  for (let i = 0; i < ITEMS.length; i++) {
    const middle = cursor + BASE / 2;
    const dist = Math.abs(localX - middle);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
    cursor += BASE + GAP;
  }
  return best;
}

const styles = StyleSheet.create({
  slot: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  panel: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: GAP,
    padding: 8,
    borderRadius: 22,
    backgroundColor: "rgba(120, 175, 255, 0.5)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.4)",
    overflow: "visible",
  },
  tile: {
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  tileOn: {
    backgroundColor: "rgba(255,255,255,0.48)",
    borderColor: "rgba(255,255,255,0.75)",
  },
  label: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(74, 128, 214, 0.92)",
  },
  labelText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
