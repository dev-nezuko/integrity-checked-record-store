import { isSignedVersion, type SignedVersion } from "./integrity";

async function readJson(response: Response): Promise<unknown> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (body as { error?: unknown } | null)?.error;
    throw new Error(typeof message === "string" ? message : `Request failed (${response.status})`);
  }
  return body;
}

function asVersion(body: unknown): SignedVersion {
  if (!isSignedVersion(body)) throw new Error("The server returned something that is not a signed record.");
  return body;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchPublicKey(): Promise<string> {
  const body = await readJson(await fetch("/api/public-key")) as { publicKey?: unknown };
  if (typeof body.publicKey !== "string") throw new Error("The server did not return a public key.");
  return body.publicKey;
}

export async function fetchLatest(): Promise<SignedVersion> {
  return asVersion(await readJson(await fetch("/api/record")));
}

export async function fetchHistory(): Promise<SignedVersion[]> {
  const body = await readJson(await fetch("/api/record/history")) as { versions?: unknown };
  if (!Array.isArray(body.versions)) throw new Error("The server returned an invalid history.");
  return body.versions.map(asVersion);
}

export async function saveRecord(data: string): Promise<SignedVersion> {
  return asVersion(await readJson(await fetch("/api/record", json({ data }))));
}

export async function restoreVersion(version: SignedVersion): Promise<SignedVersion> {
  return asVersion(await readJson(await fetch("/api/record/restore", json({ version }))));
}
