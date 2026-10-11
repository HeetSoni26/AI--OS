import { describe, expect, it } from "vitest";
import {
  DEFAULT_LENS_FILTERS,
  EXCLUDED_NODE_OPACITY,
  applyLensFilters,
  clearAllLensFilters,
  parseLensFilters,
  serializeLensFilters,
} from "./filters";
import { AGENT_GRAPH_ID, makeAgent, makeClient, makeInvoice, makeTask } from "./test-helpers";

describe("LENS policies", () => {
  const nodes = [makeClient(), makeAgent(), makeTask(), makeInvoice()];

  it("combines entity, function, and action filters", () => {
    const filtered = applyLensFilters(nodes, { entity: "ai_agent", function: "clients", action: "all" });
    expect(filtered.filter((entry) => entry.included).map((entry) => entry.node.id)).toEqual([AGENT_GRAPH_ID]);
    expect(filtered.filter((entry) => !entry.included).every((entry) => entry.opacity === 0.1)).toBe(true);
  });

  it("fades rather than removes excluded nodes at exactly ten percent", () => {
    const filtered = applyLensFilters(nodes, { entity: "all", function: "finance", action: "completed" });
    expect(filtered).toHaveLength(nodes.length);
    expect(filtered.every((entry) => entry.opacity === EXCLUDED_NODE_OPACITY)).toBe(true);
  });

  it("round-trips active filters through stable URL parameters", () => {
    const filters = { entity: "ai_agent", function: "finance", action: "active_running" } as const;
    const search = serializeLensFilters(filters);
    expect(search).toBe("entity=ai_agent&function=finance&action=active_running");
    expect(parseLensFilters(`https://example.test/graph?${search}`)).toEqual(filters);
  });

  it("preserves unrelated URL state and omits all defaults", () => {
    expect(serializeLensFilters(DEFAULT_LENS_FILTERS, "view=compact&entity=client")).toBe("view=compact");
    expect(serializeLensFilters({ entity: "client", function: "all", action: "all" }, "view=compact")).toBe("view=compact&entity=client");
  });

  it("fails closed to defaults for invalid shared parameters and Clear All resets only LENS", () => {
    expect(parseLensFilters("entity=not-real&function=finance")).toEqual(DEFAULT_LENS_FILTERS);
    expect(clearAllLensFilters("entity=client&function=clients&action=blocked&view=compact")).toEqual({
      filters: DEFAULT_LENS_FILTERS,
      search: "view=compact",
    });
  });
});
