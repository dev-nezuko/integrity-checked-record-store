import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import App from "./App";

test("shows the server value and explicitly disables unimplemented verification", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: "Synthetic record" }) }));
  render(<App />);
  expect(await screen.findByText("Synthetic record", { selector: "p" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Verification not implemented" })).toBeDisabled();
});

test("failed loads show an error and prevent overwriting an unseen record", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<App />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
  expect(screen.getByRole("button", { name: "Save value" })).toBeDisabled();
});
