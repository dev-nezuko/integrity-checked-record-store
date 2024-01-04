import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from "node:crypto";

export interface SigningKey {
  privateKey: KeyObject;
  /** Raw Ed25519 public key, base64url, as it appears in the key's JWK `x` field. */
  publicKey: string;
  ephemeral: boolean;
}

function fromPrivateKey(privateKey: KeyObject, ephemeral: boolean): SigningKey {
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("RECORD_SIGNING_KEY must be an Ed25519 private key");
  }
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  return { privateKey, publicKey: jwk.x as string, ephemeral };
}

/** Reads a base64 PKCS#8 DER Ed25519 key from the environment, or makes a throwaway one. */
export function loadSigningKey(encoded: string | undefined): SigningKey {
  if (!encoded) return generateSigningKey(true);
  const privateKey = createPrivateKey({ key: Buffer.from(encoded, "base64"), format: "der", type: "pkcs8" });
  return fromPrivateKey(privateKey, false);
}

export function generateSigningKey(ephemeral = false): SigningKey {
  return fromPrivateKey(generateKeyPairSync("ed25519").privateKey, ephemeral);
}

export function exportPrivateKey(key: SigningKey): string {
  return key.privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
}
