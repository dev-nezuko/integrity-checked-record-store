import { vi } from "vitest";
import { canonicalPayload, type SignedVersion } from "./integrity";

const GENESIS = "0".repeat(64);

export interface TestSigner {
  publicKey: string;
  sign(version: number, data: string, prevHash?: string): Promise<SignedVersion>;
}

export async function makeSigner(): Promise<TestSigner> {
  const pair = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
  const { x } = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    publicKey: x!,
    async sign(version, data, prevHash = GENESIS) {
      const unsigned = { version, data, signedAt: `2026-01-0${Math.min(version, 9)}T10:00:00.000Z`, prevHash, hash: "", signature: "" };
      const payload = canonicalPayload(unsigned);
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", payload));
      const signature = new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, pair.privateKey, payload));
      return {
        ...unsigned,
        hash: Array.from(digest, b => b.toString(16).padStart(2, "0")).join(""),
        signature: btoa(String.fromCharCode(...signature)),
      };
    },
  };
}

/** A fetch stub backed by a mutable list of versions (oldest first), mirroring the server routes. */
export function stubServer(publicKey: string, versions: SignedVersion[], onPost?: (url: string, body: unknown) => Promise<SignedVersion>) {
  const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      const next = await onPost!(url, JSON.parse(String(init.body)));
      versions.push(next);
      return reply(201, next);
    }
    if (url === "/api/public-key") return reply(200, { algorithm: "Ed25519", publicKey, ephemeral: false });
    if (url === "/api/record") return reply(200, versions.at(-1));
    if (url === "/api/record/history") return reply(200, { versions: [...versions].reverse() });
    return reply(404, { error: "not found" });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
