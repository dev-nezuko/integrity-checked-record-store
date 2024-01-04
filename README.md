# Record integrity design exercise

A React client and a small Express server for exploring a difficult question: **how can a client detect and recover from changes made by a compromised server?** The current implementation is a starter, not an integrity-protected storage system.

It reads and updates one string held in server memory. Verification, cryptographic signatures, independent backups and recovery are **not implemented**. Restarting the server resets the value to `Hello World`.

![Local record editor with synthetic data](docs/screenshots/record.png)

The desktop screenshot uses the real client and local in-memory server with synthetic data. It does not demonstrate integrity checking.

## Run the starter

Use Node.js and npm. The review used Node 22; the React client retains its existing Create React App and TypeScript versions.

Terminal 1:

```sh
cd server
npm ci --ignore-scripts
npm start
```

Terminal 2:

```sh
cd client
npm ci --ignore-scripts
npm start
```

Open [the editor](http://localhost:3000). The server listens on loopback at port 8080 and allows the local frontend origin. It has no authentication and should remain local. CORS is a browser rule, not a permission check for other HTTP clients.

| Request | Behavior |
| --- | --- |
| `GET /` | Returns `{"data":"Hello World"}` initially |
| `POST /` with `{"data":"A revision"}` | Replaces the value and returns the stored record |
| Missing, non-string or longer-than-4,096-character data | Returns 400 without changing the value |
| JSON request body over 16 KiB | Returns 413 |

The editor separates the saved server value from the draft, displays failed requests, and prevents saving before the initial record loads. The disabled verification button states the missing capability instead of throwing an unhandled error.

## What would make verification meaningful?

A hash returned alongside data by the same server is insufficient: an attacker who can replace the data can replace its hash. The trusted reference must survive outside the assumed compromised component.

A follow-up design would need explicit decisions about:

1. **Trust and keys.** Who signs updates, and where are public keys and signing keys stored? If the client signs, how are device changes and lost keys handled?
2. **Freshness.** A valid signature on an older record does not prevent rollback. Clients need a trustworthy version or checkpoint policy.
3. **Recovery.** Store an encrypted, versioned copy independently of the application database, and test restoration. Detection alone cannot recreate lost data.
4. **Authorized changes.** Define who may update a record and how concurrent edits, deletion and key rotation work.

Those mechanisms are future work, not claims about this code. This starter should not store personal, financial or other important records.

## Checks and structure

`server/app.ts` exports an app factory so tests can use isolated state. `client/src/App.tsx` contains the editor. There is no database, durable journal or background worker.

```sh
# from server/
node -r ts-node/register app.test.ts
node node_modules/typescript/bin/tsc --noEmit

# from client/
CI=true npm test -- --watchAll=false --runInBand
npm run build
```

The API check covers initial state, update/readback, invalid payloads, unchanged state after rejected writes, the request-body bound and app-state isolation. Two UI tests cover initial loading and failure states. These checks do not validate a cryptographic or recovery protocol.

This repository began as a Bequest take-home prompt. The original challenge asks how a client can detect tampering and recover lost data; no submission email or completion claim is needed to understand the exercise. Package metadata declares ISC, but no standalone license file is present.
