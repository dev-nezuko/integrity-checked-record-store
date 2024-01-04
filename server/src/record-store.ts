import { createHash, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import type { SigningKey } from "./signing.js";

export const GENESIS_HASH = "0".repeat(64);

export interface SignedVersion {
  version: number;
  data: string;
  signedAt: string;
  prevHash: string;
  /** SHA-256 of the canonical payload; the next version's prevHash. */
  hash: string;
  /** Ed25519 signature over the canonical payload, base64. */
  signature: string;
}

/**
 * The exact bytes that are hashed and signed. Key order is fixed here and
 * mirrored in client/src/integrity.ts, so both sides produce identical bytes.
 */
export function canonicalPayload(v: Pick<SignedVersion, "version" | "data" | "signedAt" | "prevHash">): Buffer {
  return Buffer.from(JSON.stringify({ version: v.version, data: v.data, signedAt: v.signedAt, prevHash: v.prevHash }));
}

export function isSignedVersion(value: unknown): value is SignedVersion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.version) && (v.version as number) > 0 &&
    ["data", "signedAt", "prevHash", "hash", "signature"].every(field => typeof v[field] === "string");
}

export function verifyVersion(v: SignedVersion, publicKey: KeyObject): boolean {
  const payload = canonicalPayload(v);
  if (createHash("sha256").update(payload).digest("hex") !== v.hash) return false;
  return verify(null, payload, publicKey, Buffer.from(v.signature, "base64"));
}

export class RecordStore {
  private readonly versions: SignedVersion[] = [];
  private readonly publicKey: KeyObject;

  constructor(
    private readonly key: SigningKey,
    initialData: string,
    private readonly maxVersions: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.publicKey = createPublicKey(key.privateKey);
    this.append(initialData);
  }

  latest(): SignedVersion {
    return this.versions[this.versions.length - 1];
  }

  /** Newest first. */
  history(): SignedVersion[] {
    return [...this.versions].reverse();
  }

  append(data: string): SignedVersion {
    const previous = this.versions.at(-1);
    const unsigned = {
      version: (previous?.version ?? 0) + 1,
      data,
      signedAt: this.now().toISOString(),
      prevHash: previous?.hash ?? GENESIS_HASH,
    };
    const payload = canonicalPayload(unsigned);
    const next: SignedVersion = {
      ...unsigned,
      hash: createHash("sha256").update(payload).digest("hex"),
      signature: sign(null, payload, this.key.privateKey).toString("base64"),
    };
    this.versions.push(next);
    // Bounded memory: older versions fall off, the chain stays checkable from the oldest kept one.
    if (this.versions.length > this.maxVersions) this.versions.shift();
    return next;
  }

  /** True when this server's key signed the given version, whatever the stored history now says. */
  signedByUs(v: SignedVersion): boolean {
    return verifyVersion(v, this.publicKey);
  }

  /** Demo only: overwrite the latest data without re-signing, as an attacker without the key would. */
  tamperLatest(data: string): SignedVersion {
    const latest = this.latest();
    latest.data = data;
    return latest;
  }
}
