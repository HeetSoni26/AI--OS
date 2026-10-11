import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import {
  CommandRegistrationProvider,
  useActiveShellCommand,
  useShellCommandRegistration,
  type ShellCommand,
} from "@/components/providers/command-registration-provider";
import { describe, expect, it, vi } from "vitest";

function RouteCommand({ command }: { command: ShellCommand }) {
  useShellCommandRegistration(command);
  return null;
}

function CommandButton({ fallback }: { fallback: ShellCommand }) {
  const command = useActiveShellCommand(fallback);
  return <button type="button" onClick={command.invoke}>{command.buttonText}</button>;
}

function RegistrationHarness({ fallback, route }: { fallback: ShellCommand; route: ShellCommand }) {
  const [registered, setRegistered] = useState(true);
  return (
    <CommandRegistrationProvider>
      {registered ? <RouteCommand command={route} /> : null}
      <CommandButton fallback={fallback} />
      <button type="button" onClick={() => setRegistered(false)}>Leave route</button>
    </CommandRegistrationProvider>
  );
}

describe("shell command registration", () => {
  it("uses the route command for its lifetime and restores the default fallback on unmount", async () => {
    const user = userEvent.setup();
    const fallbackInvoke = vi.fn();
    const routeInvoke = vi.fn();

    render(
      <RegistrationHarness
        fallback={{ buttonLabel: "Open command palette", buttonText: "Search workspace", invoke: fallbackInvoke }}
        route={{ buttonLabel: "Search graph", buttonText: "Search graph nodes", invoke: routeInvoke }}
      />,
    );

    const routeButton = await screen.findByRole("button", { name: "Search graph nodes" });
    await user.click(routeButton);
    expect(routeInvoke).toHaveBeenCalledOnce();
    expect(fallbackInvoke).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Leave route" }));
    const fallbackButton = await screen.findByRole("button", { name: "Search workspace" });
    await user.click(fallbackButton);
    expect(fallbackInvoke).toHaveBeenCalledOnce();
  });

  it("updates an active registration without remounting it", async () => {
    const firstInvoke = vi.fn();
    const secondInvoke = vi.fn();
    const fallback = { buttonLabel: "Open command palette", buttonText: "Search workspace", invoke: vi.fn() };
    const { rerender } = render(
      <CommandRegistrationProvider>
        <RouteCommand command={{ buttonLabel: "Search graph", buttonText: "Find one", invoke: firstInvoke }} />
        <CommandButton fallback={fallback} />
      </CommandRegistrationProvider>,
    );

    expect(await screen.findByRole("button", { name: "Find one" })).toBeInTheDocument();

    rerender(
      <CommandRegistrationProvider>
        <RouteCommand command={{ buttonLabel: "Search graph", buttonText: "Find another", invoke: secondInvoke }} />
        <CommandButton fallback={fallback} />
      </CommandRegistrationProvider>,
    );

    await waitFor(() => expect(screen.getByRole("button", { name: "Find another" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Find another" }));
    expect(firstInvoke).not.toHaveBeenCalled();
    expect(secondInvoke).toHaveBeenCalledOnce();
  });
});
