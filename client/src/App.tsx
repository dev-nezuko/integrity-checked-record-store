import React, { useEffect, useState } from "react";
import "./App.css";
const API_URL = "http://localhost:8080";
async function readRecord(response: Response): Promise<string> {
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  const body = await response.json();
  if (typeof body.data !== "string") throw new Error("The server returned an invalid record.");
  return body.data;
}
function App() {
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(API_URL).then(readRecord).then(value => {
      if (active) { setSaved(value); setDraft(value); }
    }).catch(() => { if (active) setError("Could not load the record. Start the local server and reload."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function updateData(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const value = await readRecord(await fetch(API_URL, { method: "POST", body: JSON.stringify({ data: draft }), headers: { "Content-Type": "application/json" } }));
      setSaved(value);
    } catch { setError("The update failed. Your draft is still here; try again after checking the server."); }
    finally { setBusy(false); }
  }
  return <main>
    <p className="eyebrow">Integrity design exercise</p><h1>A record you can edit.<br />Trust you still need to establish.</h1>
    <p className="intro">This starter stores one mutable value in server memory. It has no integrity verification or recovery mechanism.</p>
    <section className="record"><span className="label">Current server value</span><p className="value">{saved ?? (busy ? "Loading…" : "Unavailable")}</p>
      <form onSubmit={updateData}><label htmlFor="draft">Edit the record</label><textarea id="draft" value={draft} maxLength={4096} onChange={event => setDraft(event.target.value)} disabled={busy} />
      <div className="actions"><button disabled={busy || saved === null || draft === saved}>{busy ? "Working…" : "Save value"}</button><button type="button" disabled aria-describedby="verification-note">Verification not implemented</button></div></form>
      {error && <p role="alert">{error}</p>}<p id="verification-note" className="note">A checksum supplied by the same compromised server cannot prove that a record is authentic.</p>
    </section><aside><h2>What a real solution needs</h2><p>A trusted reference outside the compromised server, explicit key ownership, version freshness and an independently recoverable copy. None are implemented here.</p></aside>
  </main>;
}
export default App;
