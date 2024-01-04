import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";

createApp().listen(port, host, () => {
  console.log(`Record API listening on http://${host}:${port}`);
});
