import { describe, expect, it } from "vitest";
import fixture from "./fixtures/server-signed.json";
import { assessLatest, checkHistory, importPublicKey, verifyVersion, type SignedVersion } from "./integrity";
import { makeSigner } from "./test-helpers";

const serverVersions = fixture.versions as SignedVersion[];

describe("verifyVersion", () => {
  it("accepts versions signed by the real server code", async () => {
    const key = await importPublicKey(fixture.publicKey);
    for (const v of serverVersions) expect(await verifyVersion(v, key)).toBe(true);
  });

  it("rejects altered data, metadata, hashes and signatures", async () => {
    const key = await importPublicKey(fixture.publicKey);
    const [v] = serverVersions;
    expect(await verifyVersion({ ...v, data: "Hello World!" }, key)).toBe(false);
    expect(await verifyVersion({ ...v, version: 7 }, key)).toBe(false);
    expect(await verifyVersion({ ...v, hash: "0".repeat(64) }, key)).toBe(false);
    expect(await verifyVersion({ ...v, signature: serverVersions[1].signature }, key)).toBe(false);
    expect(await verifyVersion({ ...v, signature: "not base64!" }, key)).toBe(false);
  });

  it("rejects a self-consistent version signed by a different key", async () => {
    const other = await makeSigner();
    const forged = await other.sign(1, "Hello World");
    expect(await verifyVersion(forged, await importPublicKey(fixture.publicKey))).toBe(false);
  });
});

describe("assessLatest", () => {
  it("flags tampering, rollback and forks", async () => {
    const signer = await makeSigner();
    const key = await importPublicKey(signer.publicKey);
    const v1 = await signer.sign(1, "one");
    const v2 = await signer.sign(2, "two", v1.hash);
    const v2b = await signer.sign(2, "two, forked", v1.hash);

    expect(await assessLatest(v2, key, v1)).toEqual({ status: "verified" });
    expect(await assessLatest(v1, key, null)).toEqual({ status: "verified" });
    expect((await assessLatest({ ...v2, data: "evil" }, key, v1)).status).toBe("tampered");
    expect((await assessLatest(v1, key, v2)).status).toBe("rollback");
    expect((await assessLatest(v2b, key, v2)).status).toBe("tampered");
  });
});

describe("checkHistory", () => {
  it("marks invalid signatures and broken hash links", async () => {
    const key = await importPublicKey(fixture.publicKey);
    const [v1, v2] = serverVersions;
    expect((await checkHistory([v2, v1], key)).map(v => [v.valid, v.linked])).toEqual([[true, true], [true, true]]);

    const result = await checkHistory([v2, { ...v1, data: "edited" }], key);
    expect(result.map(v => [v.valid, v.linked])).toEqual([[true, true], [false, true]]);

    const gap = await checkHistory([v2, { ...v2, version: 1 }], key);
    expect(gap[0].linked).toBe(false);
  });
});
