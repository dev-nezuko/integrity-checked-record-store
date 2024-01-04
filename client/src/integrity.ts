export interface SignedVersion {
  version: number;
  data: string;
  signedAt: string;
  prevHash: string;
  hash: string;
  signature: string;
}

export type Verdict =
  | { status: "verified" }
  | { status: "tampered"; reason: string }
  | { status: "rollback"; reason: string };

export function isSignedVersion(value: unknown): value is SignedVersion {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return Number.isSafeInteger(v.version) &&
    ["data", "signedAt", "prevHash", "hash", "signature"].every(field => typeof v[field] === "string");
}

/** Must stay byte-identical to canonicalPayload in server/src/record-store.ts. */
export function canonicalPayload(v: SignedVersion): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({ version: v.version, data: v.data, signedAt: v.signedAt, prevHash: v.prevHash }));
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, b => b.toString(16).padStart(2, "0")).join("");
}

/** Imports a raw Ed25519 public key given as base64url (a JWK `x` value). */
export function importPublicKey(x: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", { kty: "OKP", crv: "Ed25519", x }, { name: "Ed25519" }, false, ["verify"]);
}

export async function verifyVersion(v: SignedVersion, key: CryptoKey): Promise<boolean> {
  const payload = canonicalPayload(v);
  if (await sha256Hex(payload) !== v.hash) return false;
  try {
    return await crypto.subtle.verify({ name: "Ed25519" }, key, base64ToBytes(v.signature), payload);
  } catch {
    // A signature that is not valid base64 or has the wrong length cannot verify.
    return false;
  }
}

/** Judges what the server served against the key and the newest version this client has verified before. */
export async function assessLatest(latest: SignedVersion, key: CryptoKey, lastVerified: SignedVersion | null): Promise<Verdict> {
  if (!await verifyVersion(latest, key)) {
    return { status: "tampered", reason: "The content no longer matches its signature." };
  }
  if (lastVerified && latest.version < lastVerified.version) {
    return { status: "rollback", reason: `The server returned version ${latest.version}, older than version ${lastVerified.version} verified earlier.` };
  }
  if (lastVerified && latest.version === lastVerified.version && latest.hash !== lastVerified.hash) {
    return { status: "tampered", reason: `Two different signed contents claim to be version ${latest.version}.` };
  }
  return { status: "verified" };
}

export interface CheckedVersion extends SignedVersion {
  valid: boolean;
  /** False when prevHash does not point at the next older version in the list. */
  linked: boolean;
}

/** Checks each version's signature and its hash link. Expects newest first. */
export async function checkHistory(versions: SignedVersion[], key: CryptoKey): Promise<CheckedVersion[]> {
  return Promise.all(versions.map(async (v, i) => {
    const older = versions[i + 1];
    return { ...v, valid: await verifyVersion(v, key), linked: !older || v.prevHash === older.hash };
  }));
}
