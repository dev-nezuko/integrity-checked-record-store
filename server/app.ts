import express from "express";
import cors from "cors";

export function createApp() {
  const app = express();
  const database = { data: "Hello World" };
  app.use(cors({ origin: "http://localhost:3000" }));
  app.use(express.json({ limit: "16kb" }));
  app.get("/", (_req, res) => res.json(database));
  app.post("/", (req, res) => {
    if (typeof req.body?.data !== "string" || req.body.data.length > 4096) {
      res.status(400).json({ error: "data must be a string of at most 4096 characters" });
      return;
    }
    database.data = req.body.data;
    res.json(database);
  });
  return app;
}

if (require.main === module) {
  createApp().listen(8080, "127.0.0.1", () => console.log("Local mutable-record demo: http://localhost:8080"));
}
