export const colors = {
  skyTop: "#9CC6FF",
  skyMid: "#4C86E0",
  skyDeep: "#1E4F9E",
  ink: "#1F4F9E",
  white: "#FFFFFF",
  glass: "rgba(116, 170, 245, 0.42)",
  glassBorder: "rgba(255, 255, 255, 0.4)",
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.8)",
  dock: "rgba(18, 48, 110, 0.42)",
  user: "rgba(255, 255, 255, 0.22)",
  assistant: "rgba(16, 46, 110, 0.48)",
  danger: "#FFE1E1",
};

export const DOCK_BODY = 74;

/** Same caps as src/lib/billing/plans.ts on the server. */
export const LIMITS = {
  freeQuestions: 8,
  plusQuestions: 60,
  freeChats: 5,
  plusChats: 30,
} as const;
