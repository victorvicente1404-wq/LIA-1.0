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

import { describe as d2, it as i2, expect as e2 } from "vitest";
import { parseAuthDeepLink as p2 } from "./capacitor-auth";
d2("intent:// do Android", () => {
  i2("extrai tokens de intent://auth", () => {
    const r = p2("intent://auth?access_token=a&refresh_token=b#Intent;scheme=liaapp;end");
    e2(r?.access_token).toBe("a");
    e2(r?.refresh_token).toBe("b");
  });
  i2("aceita liaapp:auth sem barras", () => {
    e2(p2("liaapp:auth?code=x")?.code).toBe("x");
  });
});
