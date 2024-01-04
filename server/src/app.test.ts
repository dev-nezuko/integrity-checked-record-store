import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

describe("record API", () => {
  it("returns the initial record", async () => {
    const res = await request(createApp()).get("/api/record").expect(200);
    expect(res.body).toEqual({ data: "Hello World" });
  });

  it("stores an update and reads it back", async () => {
    const app = createApp();
    await request(app).post("/api/record").send({ data: "Synthetic revision" }).expect(200, { data: "Synthetic revision" });
    await request(app).get("/api/record").expect(200, { data: "Synthetic revision" });
  });

  it.each([null, 42, {}, "x".repeat(4097)])("rejects %j without changing the record", async (data) => {
    const app = createApp();
    await request(app).post("/api/record").send({ data }).expect(400);
    await request(app).get("/api/record").expect(200, { data: "Hello World" });
  });

  it("answers malformed JSON and oversized bodies with JSON errors", async () => {
    const app = createApp();
    const bad = await request(app).post("/api/record").set("Content-Type", "application/json").send("{").expect(400);
    expect(bad.body).toEqual({ error: "malformed JSON body" });
    const big = await request(app).post("/api/record").send({ data: "x".repeat(20000) }).expect(413);
    expect(big.body).toEqual({ error: "request body too large" });
  });

  it("keeps state per app instance", async () => {
    await request(createApp()).post("/api/record").send({ data: "changed" }).expect(200);
    await request(createApp()).get("/api/record").expect(200, { data: "Hello World" });
  });
});
