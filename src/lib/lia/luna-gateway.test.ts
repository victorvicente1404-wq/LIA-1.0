import { describe, expect, it } from "vitest";
import { estimateInputTokens } from "./luna-gateway";

describe("Luna Gateway token preflight", () => {
  it("applies a conservative minimum for short prompts", () => {
    expect(estimateInputTokens("", [])).toBe(256);
  });

  it("includes the system prompt and every message in its estimate", () => {
    const short = estimateInputTokens("system", [{ role: "user", content: "oi" }]);
    const long = estimateInputTokens("system".repeat(100), [
      { role: "user", content: "mensagem".repeat(100) },
      { role: "assistant", content: "resposta".repeat(100) },
    ]);
    expect(long).toBeGreaterThan(short);
  });

  it("uses a conservative character-to-token factor", () => {
    expect(estimateInputTokens("a".repeat(1_000), [])).toBe(881);
  });
});
