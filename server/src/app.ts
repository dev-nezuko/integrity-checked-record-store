import express, { type ErrorRequestHandler } from "express";
import { isSignedVersion, RecordStore } from "./record-store.js";
import { generateSigningKey, type SigningKey } from "./signing.js";

export const MAX_RECORD_LENGTH = 4096;

export interface AppOptions {
  signingKey?: SigningKey;
  /** Enables POST /api/record/tamper, which corrupts the latest version for demonstrations. */
  allowTamperDemo?: boolean;
  maxVersions?: number;
  now?: () => Date;
  /** Built client to serve from the same origin, as the Docker image does. */
  clientDir?: string;
}

function readData(body: unknown): string | null {
  const data = (body as { data?: unknown } | undefined)?.data;
  return typeof data === "string" && data.length <= MAX_RECORD_LENGTH ? data : null;
}

const invalidData = { error: `data must be a string of at most ${MAX_RECORD_LENGTH} characters` };

export function createApp(options: AppOptions = {}) {
  const key = options.signingKey ?? generateSigningKey(true);
  const store = new RecordStore(key, "Hello World", options.maxVersions ?? 200, options.now);
  const app = express();

  app.use(express.json({ limit: "16kb" }));

  app.get("/api/public-key", (_req, res) => {
    res.json({ algorithm: "Ed25519", publicKey: key.publicKey, ephemeral: key.ephemeral });
  });

  app.get("/api/record", (_req, res) => {
    res.json(store.latest());
  });

  app.get("/api/record/history", (_req, res) => {
    res.json({ versions: store.history() });
  });

  app.post("/api/record", (req, res) => {
    const data = readData(req.body);
    if (data === null) {
      res.status(400).json(invalidData);
      return;
    }
    res.status(201).json(store.append(data));
  });

  app.post("/api/record/restore", (req, res) => {
    const candidate: unknown = req.body?.version;
    if (!isSignedVersion(candidate) || candidate.data.length > MAX_RECORD_LENGTH) {
      res.status(400).json({ error: "version must be a signed record version" });
      return;
    }
    if (!store.signedByUs(candidate)) {
      res.status(422).json({ error: "signature does not match this server's key" });
      return;
    }
    res.status(201).json(store.append(candidate.data));
  });

  if (options.allowTamperDemo) {
    app.post("/api/record/tamper", (req, res) => {
      const data = readData(req.body);
      if (data === null) {
        res.status(400).json(invalidData);
        return;
      }
      res.json(store.tamperLatest(data));
    });
  }

  if (options.clientDir) app.use(express.static(options.clientDir));

  // body-parser errors carry an HTTP status; answer them as JSON instead of Express's HTML page.
  const jsonErrors: ErrorRequestHandler = (err, _req, res, next) => {
    const status = typeof err?.status === "number" ? err.status : 500;
    if (status >= 500) return next(err);
    res.status(status).json({ error: err.type === "entity.too.large" ? "request body too large" : "malformed JSON body" });
  };
  app.use(jsonErrors);

  return app;
}
