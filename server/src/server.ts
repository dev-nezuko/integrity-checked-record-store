import { createApp } from "./app.js";
import { loadSigningKey } from "./signing.js";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "127.0.0.1";
const signingKey = loadSigningKey(process.env.RECORD_SIGNING_KEY);
const allowTamperDemo = process.env.ALLOW_TAMPER_DEMO === "true";
const clientDir = process.env.CLIENT_DIR || undefined;

if (signingKey.ephemeral) {
  console.warn("RECORD_SIGNING_KEY is not set: using a throwaway key that changes on every restart.");
}
if (allowTamperDemo) {
  console.warn("ALLOW_TAMPER_DEMO=true: POST /api/record/tamper can corrupt the stored record.");
}

createApp({ signingKey, allowTamperDemo, clientDir }).listen(port, host, () => {
  console.log(`Record API listening on http://${host}:${port} (public key ${signingKey.publicKey})`);
});
