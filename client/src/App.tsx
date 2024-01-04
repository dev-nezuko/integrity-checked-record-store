import { useEffect, useState, type FormEvent } from "react";
import { fetchHistory, fetchLatest, fetchPublicKey, restoreVersion, saveRecord } from "./api";
import { assessLatest, checkHistory, importPublicKey, type CheckedVersion, type SignedVersion, type Verdict } from "./integrity";
import { loadLastVerified, resolveTrustAnchor, saveLastVerified, type TrustAnchor } from "./trust";
import "./App.css";

const MAX_LENGTH = 4096;

interface Inspection {
  anchor: TrustAnchor;
  latest: SignedVersion;
  verdict: Verdict;
  history: CheckedVersion[];
  lastVerified: SignedVersion | null;
}

async function inspect(): Promise<Inspection> {
  const anchor = await resolveTrustAnchor(fetchPublicKey);
  const key = await importPublicKey(anchor.publicKey);
  const [latest, versions] = await Promise.all([fetchLatest(), fetchHistory()]);
  let lastVerified = loadLastVerified(anchor.publicKey);
  const verdict = await assessLatest(latest, key, lastVerified);
  if (verdict.status === "verified") {
    saveLastVerified(anchor.publicKey, latest);
    lastVerified = latest;
  }
  return { anchor, latest, verdict, history: await checkHistory(versions, key), lastVerified };
}

const shortHash = (hash: string) => `${hash.slice(0, 8)}…${hash.slice(-4)}`;
const formatTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function App() {
  const [state, setState] = useState<Inspection | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");

  function show(next: Inspection) {
    setState(next);
    if (next.verdict.status === "verified") setDraft(next.latest.data);
  }

  useEffect(() => {
    let active = true;
    inspect()
      .then(next => {
        if (!active) return;
        setState(next);
        if (next.verdict.status === "verified") setDraft(next.latest.data);
      })
      .catch(() => { if (active) setError("Could not load the record. Start the local server and reload."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);

  async function run(action: () => Promise<unknown>, failure: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      show(await inspect());
    } catch (err) {
      setError(`${failure} ${err instanceof Error ? err.message : ""}`.trim());
    } finally {
      setBusy(false);
    }
  }

  function onSave(event: FormEvent) {
    event.preventDefault();
    void run(() => saveRecord(draft), "The update failed; your draft is still here.");
  }

  const verified = state?.verdict.status === "verified";
  const recoverable = state && !verified && state.lastVerified;

  return (
    <div className="page">
      <header className="masthead">
        <p className="eyebrow">Integrity-checked record store</p>
        <h1>One record. Every version signed.</h1>
        <p className="lede">
          The server signs each version with Ed25519 and links it to the one before. This page checks those
          signatures itself, notices tampering or rollback, and can put back the last copy it verified.
        </p>
      </header>

      <main className="layout">
        <section className="sheet" aria-labelledby="record-heading">
          <h2 id="record-heading" className="sheet-title">Current record</h2>

          {!state && busy && <p className="status status-pending" role="status">Checking signatures…</p>}
          {state && <StatusBanner verdict={state.verdict} latest={state.latest} />}
          {error && <p className="alert" role="alert">{error}</p>}

          {state && (
            <>
              <figure className="value-block">
                <figcaption className="field-label">Value served by the server</figcaption>
                <blockquote className={`value ${verified ? "" : "value-suspect"}`}>{state.latest.data || <em>(empty)</em>}</blockquote>
                <dl className="meta">
                  <div><dt>Version</dt><dd>{state.latest.version}</dd></div>
                  <div><dt>Signed</dt><dd>{formatTime(state.latest.signedAt)}</dd></div>
                  <div><dt>Hash</dt><dd className="mono">{shortHash(state.latest.hash)}</dd></div>
                </dl>
              </figure>

              {recoverable && state.lastVerified && (
                <div className="recovery">
                  <p className="field-label">Last copy verified in this browser · version {state.lastVerified.version}</p>
                  <blockquote className="value">{state.lastVerified.data || <em>(empty)</em>}</blockquote>
                  <button type="button" className="button button-seal" disabled={busy}
                    onClick={() => void run(() => restoreVersion(state.lastVerified!), "Restore failed.")}>
                    Restore version {state.lastVerified.version}
                  </button>
                </div>
              )}
              {!verified && !state.lastVerified && (
                <p className="note">This browser has no verified copy to recover from.</p>
              )}
            </>
          )}

          <form onSubmit={onSave} className="editor">
            <label htmlFor="draft" className="field-label">New value</label>
            <textarea id="draft" value={draft} maxLength={MAX_LENGTH} onChange={event => setDraft(event.target.value)}
              disabled={busy || !verified} aria-describedby="editor-hint" />
            <p id="editor-hint" className="hint">
              {verified ? `${draft.length} / ${MAX_LENGTH} characters. Saving adds a new signed version.`
                : "Editing is paused until the served record verifies."}
            </p>
            <div className="actions">
              <button className="button" disabled={busy || !verified || draft === state?.latest.data}>
                {busy && state ? "Working…" : "Save new version"}
              </button>
              <button type="button" className="button button-quiet" disabled={busy}
                onClick={() => void run(async () => undefined, "Could not reach the server.")}>
                Check again
              </button>
            </div>
          </form>
        </section>

        <aside className="ledger" aria-labelledby="history-heading">
          <h2 id="history-heading" className="sheet-title">Version ledger</h2>
          {state ? (
            <>
              <p className="anchor">
                {state.anchor.source === "build" ? "Key pinned at build time" : "Key remembered on first use"}
                <span className="mono"> {state.anchor.publicKey.slice(0, 12)}…</span>
              </p>
              <ol className="history">
                {state.history.map(v => (
                  <li key={`${v.version}-${v.hash}`} className={v.valid && v.linked ? "" : "history-bad"}>
                    <span className="history-version">v{v.version}</span>
                    <span className="history-data">{v.data || "(empty)"}</span>
                    <span className="history-meta mono">{shortHash(v.hash)} · {formatTime(v.signedAt)}</span>
                    <span className="history-check">
                      {!v.valid ? "Invalid signature" : !v.linked ? "Broken link" : "Signature valid"}
                    </span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="note">{busy ? "Loading history…" : "History unavailable."}</p>
          )}
        </aside>
      </main>
    </div>
  );
}

function StatusBanner({ verdict, latest }: { verdict: Verdict; latest: SignedVersion }) {
  if (verdict.status === "verified") {
    return <p className="status status-ok" role="status"><strong>Verified.</strong> Version {latest.version} carries a valid signature.</p>;
  }
  const title = verdict.status === "rollback" ? "Rollback detected." : "Tampering detected.";
  return <p className="status status-bad" role="status"><strong>{title}</strong> {verdict.reason}</p>;
}

export default App;
