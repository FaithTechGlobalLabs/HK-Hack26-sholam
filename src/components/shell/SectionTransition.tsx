import { type ReactNode, ViewTransition } from "react";

/**
 * Wrap each page's content so switching between Chat and Flashcards slides
 * it sideways (types from nav.ts; CSS in app/sky.css). It sits in the pages,
 * not the layout: layouts persist across navigations, so enter and exit
 * never fire there. Moves within a section have no type and do not slide.
 */
export function SectionTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      enter={{
        "to-cards": "slide-from-right",
        "to-chat": "slide-from-left",
        default: "none",
      }}
      exit={{
        "to-cards": "slide-to-left",
        "to-chat": "slide-to-right",
        default: "none",
      }}
      default="none"
    >
      {children}
    </ViewTransition>
  );
}
