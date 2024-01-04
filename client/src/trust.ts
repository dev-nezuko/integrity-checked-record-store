import { isSignedVersion, type SignedVersion } from "./integrity";

const TRUSTED_KEY = "record-store.trusted-key";
const LAST_VERIFIED = "record-store.last-verified";

export interface TrustAnchor {
  publicKey: string;
  /** "build": pinned at build time. "first-use": remembered from the first key this browser saw. */
  source: "build" | "first-use";
}

function read(name: string): string | null {
  try {
    return localStorage.getItem(name);
  } catch {
    return null;
  }
}

function write(name: string, value: string) {
  try {
    localStorage.setItem(name, value);
  } catch {
    // Storage can be unavailable (private mode, quota); the session still works, it just won't remember.
  }
}

export async function resolveTrustAnchor(fetchServerKey: () => Promise<string>): Promise<TrustAnchor> {
  const pinned = import.meta.env.VITE_RECORD_PUBLIC_KEY;
  if (pinned) return { publicKey: pinned, source: "build" };
  const remembered = read(TRUSTED_KEY);
  if (remembered) return { publicKey: remembered, source: "first-use" };
  const publicKey = await fetchServerKey();
  write(TRUSTED_KEY, publicKey);
  return { publicKey, source: "first-use" };
}

/** The last verified version is stored per public key so a key change never mixes histories. */
export function loadLastVerified(publicKey: string): SignedVersion | null {
  const raw = read(`${LAST_VERIFIED}.${publicKey}`);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSignedVersion(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveLastVerified(publicKey: string, version: SignedVersion) {
  write(`${LAST_VERIFIED}.${publicKey}`, JSON.stringify(version));
}
