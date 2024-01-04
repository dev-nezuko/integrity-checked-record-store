import { createPublicKey } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { GENESIS_HASH, verifyVersion, type SignedVersion } from "./record-store.js";
import { generateSigningKey } from "./signing.js";

const key = generateSigningKey();
// Verify with the published key only, the way an independent client would.
const publicKey = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: key.publicKey }, format: "jwk" });
const fixedClock = () => new Date("2026-01-01T00:00:00.000Z");
const makeApp = (allowTamperDemo = false) => createApp({ signingKey: key, allowTamperDemo, now: fixedClock });

describe("record API", () => {
  it("publishes the Ed25519 public key", async () => {
    const res = await request(makeApp()).get("/api/public-key").expect(200);
    expect(res.body).toEqual({ algorithm: "Ed25519", publicKey: key.publicKey, ephemeral: false });
  });

  it("starts with a signed genesis version", async () => {
    const res = await request(makeApp()).get("/api/record").expect(200);
    const v: SignedVersion = res.body;
    expect(v).toMatchObject({ version: 1, data: "Hello World", prevHash: GENESIS_HASH, signedAt: "2026-01-01T00:00:00.000Z" });
    expect(verifyVersion(v, publicKey)).toBe(true);
  });

  it("appends signed versions that chain to their predecessor", async () => {
    const app = makeApp();
    const first = (await request(app).get("/api/record")).body as SignedVersion;
    const res = await request(app).post("/api/record").send({ data: "Synthetic revision" }).expect(201);
    expect(res.body).toMatchObject({ version: 2, data: "Synthetic revision", prevHash: first.hash });
    expect(verifyVersion(res.body, publicKey)).toBe(true);

    const history = (await request(app).get("/api/record/history").expect(200)).body.versions as SignedVersion[];
    expect(history.map(v => v.version)).toEqual([2, 1]);
  });

  it.each([null, 42, {}, "x".repeat(4097)])("rejects %j without adding a version", async (data) => {
    const app = makeApp();
    await request(app).post("/api/record").send({ data }).expect(400);
    expect((await request(app).get("/api/record")).body.version).toBe(1);
  });

  it("answers malformed JSON and oversized bodies with JSON errors", async () => {
    const app = makeApp();
    const bad = await request(app).post("/api/record").set("Content-Type", "application/json").send("{").expect(400);
    expect(bad.body).toEqual({ error: "malformed JSON body" });
    const big = await request(app).post("/api/record").send({ data: "x".repeat(20000) }).expect(413);
    expect(big.body).toEqual({ error: "request body too large" });
  });

  it("keeps state per app instance", async () => {
    await request(makeApp()).post("/api/record").send({ data: "changed" }).expect(201);
    expect((await request(makeApp()).get("/api/record")).body.data).toBe("Hello World");
  });

  it("drops the oldest versions beyond the history limit", async () => {
    const app = createApp({ signingKey: key, maxVersions: 3 });
    for (const data of ["b", "c", "d"]) await request(app).post("/api/record").send({ data });
    const history = (await request(app).get("/api/record/history")).body.versions as SignedVersion[];
    expect(history.map(v => v.version)).toEqual([4, 3, 2]);
  });
});

describe("tampering and restore", () => {
  it("has no tamper endpoint unless the demo flag is set", async () => {
    await request(makeApp()).post("/api/record/tamper").send({ data: "evil" }).expect(404);
  });

  it("serves tampered data whose signature no longer verifies", async () => {
    const app = makeApp(true);
    await request(app).post("/api/record/tamper").send({ data: "evil" }).expect(200);
    const served = (await request(app).get("/api/record")).body as SignedVersion;
    expect(served.data).toBe("evil");
    expect(verifyVersion(served, publicKey)).toBe(false);
  });

  it("restores a version this server signed as a new version", async () => {
    const app = makeApp(true);
    const good = (await request(app).post("/api/record").send({ data: "known good" })).body as SignedVersion;
    await request(app).post("/api/record/tamper").send({ data: "evil" });
    const res = await request(app).post("/api/record/restore").send({ version: good }).expect(201);
    expect(res.body).toMatchObject({ version: 3, data: "known good", prevHash: good.hash });
    expect(verifyVersion(res.body, publicKey)).toBe(true);
  });

  it("refuses to restore a forged or altered version", async () => {
    const app = makeApp();
    const good = (await request(app).get("/api/record")).body as SignedVersion;
    await request(app).post("/api/record/restore").send({ version: { ...good, data: "forged" } }).expect(422);
    const other = createApp({ signingKey: generateSigningKey(), now: fixedClock });
    const foreign = (await request(other).get("/api/record")).body as SignedVersion;
    await request(app).post("/api/record/restore").send({ version: foreign }).expect(422);
    await request(app).post("/api/record/restore").send({ version: { version: 1 } }).expect(400);
    expect((await request(app).get("/api/record")).body.version).toBe(1);
  });
});
