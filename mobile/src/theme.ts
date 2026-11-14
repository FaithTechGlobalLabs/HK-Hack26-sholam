export const colors = {
  skyTop: "#5a8ed6",
  skyMid: "#6c9ada",
  skyDeep: "#86a3cf",
  skyBottom: "#9eacc6",
  ink: "#1f4f9e",
  white: "#FFFFFF",
  glass: "rgba(116, 168, 240, 0.5)",
  glassBorder: "rgba(255, 255, 255, 0.38)",
  text: "#FFFFFF",
  textSoft: "rgba(255, 255, 255, 0.88)",
  dock: "rgba(120, 175, 255, 0.42)",
  user: "rgba(255, 255, 255, 0.28)",
  assistant: "rgba(70, 120, 200, 0.42)",
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
