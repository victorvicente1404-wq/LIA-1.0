import { describe, expect, it } from "vitest";
import { buildNativeReturn } from "./native-return";

describe("buildNativeReturn", () => {
  it("move os tokens do # para a query do liaapp://auth", () => {
    const r = buildNativeReturn("", "#access_token=abc&refresh_token=def");
    expect(r.scheme).toBe("liaapp://auth?access_token=abc&refresh_token=def");
  });

  it("monta o intent do Android com o scheme liaapp", () => {
    const r = buildNativeReturn("?code=xyz", "");
    expect(r.intent).toBe("intent://auth?code=xyz#Intent;scheme=liaapp;end");
  });
});
