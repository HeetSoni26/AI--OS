import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { EdgeData, NodeData } from "@aios/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GraphSurface } from "./graph-surface";

const firstId = "00000000-0000-4000-8000-000000000011";
const secondId = "00000000-0000-4000-8000-000000000012";
const first: NodeData = {
  id: firstId,
  stableKey: "client:surface-first",
  entityId: "10000000-0000-4000-8000-000000000011",
  type: "client",
  label: "Atlas Automation",
  summary: "Automation client account",
  status: "active",
  action: "active_running",
  tags: ["automation"],
  hubKeys: ["clients"],
  position: { x: 100, y: 100, fixed: true },
  metadata: { name: "Atlas Automation", industry: "Automation", mrr: 4000, status: "active", startDate: "2026-01-12", projectsCount: 3 },
};
const second: NodeData = {
  id: secondId,
  stableKey: "contact:surface-second",
  entityId: "10000000-0000-4000-8000-000000000012",
  type: "human_contact",
  label: "Ari Atlas",
  summary: "Primary contact",
  status: "active",
  action: "pending",
  tags: ["primary"],
  hubKeys: ["clients"],
  position: { x: 250, y: 100, fixed: true },
  metadata: { name: "Ari Atlas", role: "Owner", company: "Atlas Automation", email: "ari@example.test", lastContact: "2026-08-01T12:00:00.000Z" },
};
const edge: EdgeData = {
  id: "edge:surface",
  type: "ownership",
  sourceNodeId: firstId,
  targetNodeId: secondId,
  label: "Primary contact",
  origin: "projection",
  projectionKey: "clients",
  createdAt: "2026-08-01T12:00:00.000Z",
};

class TestResizeObserver implements ResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 800, height: 600 } as DOMRectReadOnly } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GraphSurface keyboard interaction model", () => {
  it("supports directional focus, Space selection, Enter open, and Shift+F10 context menu", async () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    const onContext = vi.fn();
    render(
      <div style={{ width: 800, height: 600, position: "relative" }}>
        <GraphSurface
          nodes={[first, second]}
          edges={[edge]}
          renderer="svg"
          opacityById={new Map([[firstId, 1], [secondId, 0.1]])}
          selectedIds={new Set()}
          onSelect={onSelect}
          onOpen={onOpen}
          onContext={onContext}
          onDropNode={vi.fn()}
          reducedMotion
        />
      </div>,
    );

    const atlas = await screen.findByRole("button", { name: /Atlas Automation, Client, status active/ });
    const ari = screen.getByRole("button", { name: /Ari Atlas, Human \/ Contact, status active/ });
    act(() => atlas.focus());

    fireEvent.keyDown(atlas, { key: "ArrowRight" });
    await waitFor(() => expect(ari).toHaveFocus());
    fireEvent.keyDown(ari, { key: " ", shiftKey: true });
    expect(onSelect).toHaveBeenCalledWith(secondId, true);
    fireEvent.keyDown(ari, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(secondId);
    fireEvent.keyDown(ari, { key: "F10", shiftKey: true });
    expect(onContext).toHaveBeenCalledWith(expect.objectContaining({ node: second }));
  });

  it("keeps filtered nodes in the DOM at exact policy opacity", async () => {
    render(
      <div style={{ width: 800, height: 600, position: "relative" }}>
        <GraphSurface
          nodes={[first, second]}
          edges={[edge]}
          renderer="svg"
          opacityById={new Map([[firstId, 1], [secondId, 0.1]])}
          selectedIds={new Set([firstId])}
          onSelect={vi.fn()}
          onOpen={vi.fn()}
          onContext={vi.fn()}
          onDropNode={vi.fn()}
          reducedMotion={false}
        />
      </div>,
    );

    const ari = await screen.findByRole("button", { name: /Ari Atlas/ });
    expect(ari).toHaveAttribute("opacity", "0.1");
    expect(screen.getByRole("button", { name: /Atlas Automation/ })).toHaveAttribute("aria-pressed", "true");
  });
});
