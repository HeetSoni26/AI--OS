import { render, screen } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { QueryProvider } from "@/components/providers/query-provider";
import { describe, expect, it, vi } from "vitest";

function QueryClientProbe({ observe }: { observe: (client: QueryClient) => void }) {
  const client = useQueryClient();
  observe(client);
  return <span>Query client ready</span>;
}

describe("QueryProvider", () => {
  it("provides one stable client across rerenders", () => {
    const observe = vi.fn<(client: QueryClient) => void>();
    const { rerender } = render(
      <QueryProvider>
        <QueryClientProbe observe={observe} />
      </QueryProvider>,
    );

    const firstClient = observe.mock.calls[0]?.[0];
    rerender(
      <QueryProvider>
        <QueryClientProbe observe={observe} />
      </QueryProvider>,
    );

    expect(screen.getByText("Query client ready")).toBeInTheDocument();
    expect(observe.mock.lastCall?.[0]).toBe(firstClient);
    expect(firstClient?.getDefaultOptions().queries?.staleTime).toBe(30_000);
  });
});
