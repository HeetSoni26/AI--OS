import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { useShellCommandRegistration } from "@/components/providers/command-registration-provider";
import { AppShell, isFullBleedShellRoute } from "@/components/shell/app-shell";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigationState = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigationState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children: ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

vi.mock("@/app/(auth)/actions", () => ({
  logoutAction: vi.fn(),
}));

function GraphCommand({ invoke }: { invoke: () => void }) {
  useShellCommandRegistration({
    buttonLabel: "Search knowledge graph",
    buttonText: "Search graph nodes",
    invoke,
  });
  return <p>Graph route content</p>;
}

describe("AppShell commands and layout", () => {
  beforeEach(() => {
    navigationState.pathname = "/dashboard";
  });

  it("keeps the default palette available from the top button and keyboard shortcut", async () => {
    const user = userEvent.setup();
    render(<AppShell><p>Dashboard</p></AppShell>);

    const trigger = screen.getByRole("button", { name: "Open command palette" });
    await user.click(trigger);
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();

    await user.keyboard("{Control>}k{/Control}");
    expect(await screen.findByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("dispatches the registered route command from both top button and keyboard without opening the fallback", async () => {
    const user = userEvent.setup();
    const invoke = vi.fn();
    navigationState.pathname = "/knowledge-graph";
    render(<AppShell><GraphCommand invoke={invoke} /></AppShell>);

    const trigger = await screen.findByRole("button", { name: "Search knowledge graph" });
    expect(trigger).toHaveTextContent("Search graph nodes");
    await user.click(trigger);
    await user.keyboard("{Control>}k{/Control}");

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog", { name: "Command palette" })).not.toBeInTheDocument();
  });

  it("makes only the knowledge graph route family full bleed", async () => {
    expect(isFullBleedShellRoute("/knowledge-graph")).toBe(true);
    expect(isFullBleedShellRoute("/knowledge-graph/node/1")).toBe(true);
    expect(isFullBleedShellRoute("/knowledge-base")).toBe(false);
    expect(isFullBleedShellRoute("/dashboard")).toBe(false);

    navigationState.pathname = "/knowledge-graph";
    render(<AppShell><p>Graph workspace</p></AppShell>);

    const main = screen.getByRole("main");
    await waitFor(() => expect(main).toHaveAttribute("data-shell-layout", "full-bleed"));
    expect(main).toHaveClass("flex");
    expect(main).not.toHaveClass("px-4");
    expect(screen.getByText("Graph workspace").parentElement).not.toHaveClass("max-w-[1440px]");
  });
});
