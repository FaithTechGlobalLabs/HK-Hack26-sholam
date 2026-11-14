/**
 * The two places in the app and the view-transition types that animate the
 * move between them. Chat sits left of Flashcards (in the toggle, the
 * sidebar and the dock), so going to Flashcards slides the page left and
 * coming back slides it right. Moves inside one section carry no type, so
 * the page does not slide (the sidebar highlight still glides).
 */
export type Section = "chat" | "cards";

export function sectionOf(pathname: string | null): Section | null {
  if (pathname === null) return null;
  if (pathname.startsWith("/flashcards")) return "cards";
  if (pathname === "/" || pathname.startsWith("/c/")) return "chat";
  return null;
}

export function sectionTransition(
  from: string | null,
  to: string,
): string[] | undefined {
  const a = sectionOf(from);
  const b = sectionOf(to);
  if (a === "chat" && b === "cards") return ["to-cards"];
  if (a === "cards" && b === "chat") return ["to-chat"];
  return undefined;
}
