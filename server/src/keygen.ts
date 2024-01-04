import { exportPrivateKey, generateSigningKey } from "./signing.js";

const key = generateSigningKey();
console.log(`RECORD_SIGNING_KEY=${exportPrivateKey(key)}`);
console.log(`VITE_RECORD_PUBLIC_KEY=${key.publicKey}`);
