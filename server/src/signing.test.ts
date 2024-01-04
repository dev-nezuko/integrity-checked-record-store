import { describe, expect, it } from "vitest";
import { exportPrivateKey, generateSigningKey, loadSigningKey } from "./signing.js";

describe("loadSigningKey", () => {
  it("round-trips a key through its base64 PKCS#8 form", () => {
    const key = generateSigningKey();
    const loaded = loadSigningKey(exportPrivateKey(key));
    expect(loaded.publicKey).toBe(key.publicKey);
    expect(loaded.ephemeral).toBe(false);
  });

  it("falls back to an ephemeral key when none is configured", () => {
    expect(loadSigningKey(undefined).ephemeral).toBe(true);
    expect(loadSigningKey("").ephemeral).toBe(true);
  });

  it("rejects malformed key material", () => {
    expect(() => loadSigningKey("bm90IGEga2V5")).toThrow();
  });
});
