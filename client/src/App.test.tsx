import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import App from "./App";
import type { SignedVersion } from "./integrity";
import { makeSigner, stubServer } from "./test-helpers";

test("verifies the served record and lists the signed history", async () => {
  const signer = await makeSigner();
  const v1 = await signer.sign(1, "Hello World");
  stubServer(signer.publicKey, [v1, await signer.sign(2, "Synthetic record", v1.hash)]);
  render(<App />);
  expect(await screen.findByText(/Version 2 carries a valid signature/)).toBeInTheDocument();
  expect(screen.getByText("Synthetic record", { selector: "blockquote" })).toBeInTheDocument();
  expect(screen.getAllByText("Signature valid")).toHaveLength(2);
  expect(screen.getByText("Key remembered on first use")).toBeInTheDocument();
});

test("detects tampering and restores the last verified version", async () => {
  const signer = await makeSigner();
  const v1 = await signer.sign(1, "Approved text");
  const versions = [v1];
  const fetchMock = stubServer(signer.publicKey, versions, async (url, body) => {
    expect(url).toBe("/api/record/restore");
    const { version } = body as { version: SignedVersion };
    return signer.sign(2, version.data, v1.hash);
  });
  const { unmount } = render(<App />);
  await screen.findByText(/Version 1 carries a valid signature/);
  unmount();

  versions[0] = { ...v1, data: "Quietly edited text" };
  render(<App />);
  expect(await screen.findByText("Tampering detected.")).toBeInTheDocument();
  expect(screen.getByText("Invalid signature")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save new version" })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: "Restore version 1" }));
  expect(await screen.findByText(/Version 2 carries a valid signature/)).toBeInTheDocument();
  const restoreCall = fetchMock.mock.calls.find(([url]) => url === "/api/record/restore")!;
  expect(JSON.parse(String(restoreCall[1]!.body))).toEqual({ version: v1 });
});

test("detects a rollback to an older signed version", async () => {
  const signer = await makeSigner();
  const v1 = await signer.sign(1, "first");
  const v2 = await signer.sign(2, "second", v1.hash);
  const versions = [v1, v2];
  stubServer(signer.publicKey, versions);
  const { unmount } = render(<App />);
  await screen.findByText(/Version 2 carries a valid signature/);
  unmount();

  versions.pop();
  render(<App />);
  expect(await screen.findByText("Rollback detected.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Restore version 2" })).toBeEnabled();
});

test("rejects records signed by a key other than the one pinned at build time", async () => {
  const trusted = await makeSigner();
  const impostor = await makeSigner();
  vi.stubEnv("VITE_RECORD_PUBLIC_KEY", trusted.publicKey);
  stubServer(impostor.publicKey, [await impostor.sign(1, "Looks fine")]);
  render(<App />);
  expect(await screen.findByText("Tampering detected.")).toBeInTheDocument();
  expect(screen.getByText("Key pinned at build time")).toBeInTheDocument();
  expect(screen.getByText("This browser has no verified copy to recover from.")).toBeInTheDocument();
  vi.unstubAllEnvs();
});

test("saves a new version and re-verifies it", async () => {
  const signer = await makeSigner();
  const v1 = await signer.sign(1, "Hello World");
  stubServer(signer.publicKey, [v1], async (_url, body) => signer.sign(2, (body as { data: string }).data, v1.hash));
  render(<App />);
  const editor = await screen.findByLabelText("New value");
  await waitFor(() => expect(editor).toBeEnabled());
  await userEvent.clear(editor);
  await userEvent.type(editor, "Second draft");
  await userEvent.click(screen.getByRole("button", { name: "Save new version" }));
  expect(await screen.findByText(/Version 2 carries a valid signature/)).toBeInTheDocument();
  expect(screen.getByText("Second draft", { selector: "blockquote" })).toBeInTheDocument();
});

test("failed loads show an error and keep editing disabled", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  await waitFor(() => expect(screen.getByText("History unavailable.")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "Save new version" })).toBeDisabled();
});
