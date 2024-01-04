import express, { type ErrorRequestHandler } from "express";

export const MAX_RECORD_LENGTH = 4096;

export function createApp() {
  const app = express();
  const record = { data: "Hello World" };

  app.use(express.json({ limit: "16kb" }));

  app.get("/api/record", (_req, res) => {
    res.json(record);
  });

  app.post("/api/record", (req, res) => {
    const data: unknown = req.body?.data;
    if (typeof data !== "string" || data.length > MAX_RECORD_LENGTH) {
      res.status(400).json({ error: `data must be a string of at most ${MAX_RECORD_LENGTH} characters` });
      return;
    }
    record.data = data;
    res.json(record);
  });

  // body-parser errors carry an HTTP status; answer them as JSON instead of Express's HTML page.
  const jsonErrors: ErrorRequestHandler = (err, _req, res, next) => {
    const status = typeof err?.status === "number" ? err.status : 500;
    if (status >= 500) return next(err);
    res.status(status).json({ error: err.type === "entity.too.large" ? "request body too large" : "malformed JSON body" });
  };
  app.use(jsonErrors);

  return app;
}
