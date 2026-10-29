import { vi } from "vitest";

// Route handlers read the session cookie through next/headers. Tests set `testCookies`
// to act as a given staff member (or nobody).
export const testCookies = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (testCookies.has(name) ? { name, value: testCookies.get(name)! } : undefined),
    set: (name: string, value: string) => testCookies.set(name, value),
    delete: (name: string) => testCookies.delete(name),
  }),
}));
