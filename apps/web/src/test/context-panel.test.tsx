import { render, screen, waitFor } from "@testing-library/react";
import { useContextPanel } from "@/components/providers/context-panel-provider";
import {
  ContextPanelOutlet,
  ContextPanelProvider,
} from "@/components/providers/context-panel-provider";
import { describe, expect, it } from "vitest";

function RouteContext({ label }: { label: string }) {
  useContextPanel(<section aria-label="Route context">{label}</section>);
  return null;
}

describe("context panel", () => {
  it("registers route content and restores the honest fallback on unmount", async () => {
    const { rerender } = render(
      <ContextPanelProvider>
        <RouteContext label="Customer details" />
        <ContextPanelOutlet fallback={<p>No contextual content is available for this route.</p>} />
      </ContextPanelProvider>,
    );

    expect(await screen.findByRole("region", { name: "Route context" })).toHaveTextContent("Customer details");

    rerender(
      <ContextPanelProvider>
        <ContextPanelOutlet fallback={<p>No contextual content is available for this route.</p>} />
      </ContextPanelProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("No contextual content is available for this route.")).toBeInTheDocument();
    });
  });

  it("lets the most recently mounted registration own the panel", async () => {
    render(
      <ContextPanelProvider>
        <RouteContext label="Directory" />
        <RouteContext label="Selected record" />
        <ContextPanelOutlet fallback={null} />
      </ContextPanelProvider>,
    );

    expect(await screen.findByRole("region", { name: "Route context" })).toHaveTextContent("Selected record");
  });
});
