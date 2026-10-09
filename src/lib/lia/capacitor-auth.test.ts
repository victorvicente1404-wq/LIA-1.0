import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { parseAuthDeepLink } from "./capacitor-auth";

describe("parseAuthDeepLink", () => {
  it("reads ?code= from the query", () => {
    expect(parseAuthDeepLink("liaapp://auth?code=abc123")?.code).toBe("abc123");
  });

  it("reads access and refresh tokens from the hash", () => {
    const p = parseAuthDeepLink("liaapp://auth#access_token=AT&refresh_token=RT&token_type=bearer");
    expect(p?.access_token).toBe("AT");
    expect(p?.refresh_token).toBe("RT");
  });

  it("reads tokens moved into the query by the bridge page", () => {
    const p = parseAuthDeepLink("liaapp://auth?access_token=AT&refresh_token=RT");
    expect(p?.access_token).toBe("AT");
    expect(p?.refresh_token).toBe("RT");
  });

  it("ignores links that are not liaapp://auth", () => {
    expect(parseAuthDeepLink("https://example.com/?code=x")).toBeNull();
  });
});
