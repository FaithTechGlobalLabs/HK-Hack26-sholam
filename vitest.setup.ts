import { vi } from "vitest";

// server-only throws in Vitest; route handlers still get the real package via Next.
vi.mock("server-only", () => ({}));
