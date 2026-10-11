import { describe, expect, it } from "vitest";
import { GRAPH_CANVAS_NODE_THRESHOLD, selectGraphRenderer } from "./renderer";

describe("renderer switch policy", () => {
  it("uses crisp SVG below the validated large-view threshold", () => {
    expect(selectGraphRenderer({ nodeCount: GRAPH_CANVAS_NODE_THRESHOLD - 1, viewport: "desktop" })).toMatchObject({ renderer: "svg", reason: "normal_crisp_svg", paginationRecommended: false });
  });

  it("switches to Canvas at 500 nodes and recommends volume control above it", () => {
    expect(selectGraphRenderer({ nodeCount: 500, viewport: "tablet" })).toMatchObject({ renderer: "canvas", reason: "large_graph_canvas", paginationRecommended: false });
    expect(selectGraphRenderer({ nodeCount: 501, viewport: "desktop" })).toMatchObject({ renderer: "canvas", paginationRecommended: true, maxVisibleNodes: 500 });
  });

  it("always chooses the equivalent mobile list representation", () => {
    expect(selectGraphRenderer({ nodeCount: 20, viewport: "mobile" })).toMatchObject({ renderer: "list", reason: "mobile_equivalent_list" });
    expect(selectGraphRenderer({ nodeCount: 600, viewport: "mobile" })).toMatchObject({ renderer: "list", paginationRecommended: true });
  });

  it("rejects invalid volume input", () => {
    expect(() => selectGraphRenderer({ nodeCount: -1, viewport: "desktop" })).toThrow(RangeError);
    expect(() => selectGraphRenderer({ nodeCount: 1.5, viewport: "desktop" })).toThrow(RangeError);
  });
});
