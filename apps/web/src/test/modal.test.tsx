import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Dialog, Drawer } from "@/components/ui";
import { describe, expect, it } from "vitest";

function TargetedModal({
  kind,
  portalTarget,
}: {
  kind: "dialog" | "drawer";
  portalTarget: HTMLElement;
}) {
  const [open, setOpen] = useState(false);
  const Modal = kind === "dialog" ? Dialog : Drawer;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open targeted {kind}</button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={`Targeted ${kind}`}
        portalTarget={portalTarget}
      >
        <button type="button">Target action</button>
      </Modal>
    </>
  );
}

function NestedModals() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setDrawerOpen(true)}>Open drawer</button>
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Record details"
        description="Inspect the selected record."
      >
        <button type="button" onClick={() => setDialogOpen(true)}>Confirm change</button>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Confirm update"
          description="This applies immediately."
        >
          <button type="button">Apply</button>
        </Dialog>
      </Drawer>
    </>
  );
}

describe("modal behavior", () => {
  it("uses unique labels, focuses a fallback, locks scroll, and restores focus", async () => {
    const user = userEvent.setup();
    render(<NestedModals />);

    const opener = screen.getByRole("button", { name: "Open drawer" });
    await user.click(opener);

    const drawer = await screen.findByRole("dialog", { name: "Record details" });
    expect(drawer).toHaveAccessibleDescription("Inspect the selected record.");
    expect(document.body).toHaveStyle({ overflow: "hidden" });
    expect(screen.getByRole("button", { name: "Close drawer" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Record details" })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it.each(["dialog", "drawer"] as const)("portals an open %s into an optional fullscreen host", async (kind) => {
    const user = userEvent.setup();
    const fullscreenHost = document.createElement("section");
    fullscreenHost.setAttribute("aria-label", "Fullscreen graph surface");
    document.body.append(fullscreenHost);

    const { unmount } = render(<TargetedModal kind={kind} portalTarget={fullscreenHost} />);
    const opener = screen.getByRole("button", { name: `Open targeted ${kind}` });
    await user.click(opener);

    const modal = await screen.findByRole("dialog", { name: `Targeted ${kind}` });
    expect(fullscreenHost).toContainElement(modal);
    expect(document.body).toHaveStyle({ overflow: "hidden" });

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: `Targeted ${kind}` })).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    unmount();
    fullscreenHost.remove();
  });

  it("only dismisses the top nested modal and keeps body scroll locked", async () => {
    const user = userEvent.setup();
    render(<NestedModals />);

    await user.click(screen.getByRole("button", { name: "Open drawer" }));
    const nestedOpener = await screen.findByRole("button", { name: "Confirm change" });
    await user.click(nestedOpener);

    const dialog = await screen.findByRole("dialog", { name: "Confirm update" });
    const drawer = screen.getByRole("dialog", { name: "Record details" });
    expect(dialog).toHaveAccessibleDescription("This applies immediately.");
    expect(dialog.getAttribute("aria-labelledby")).not.toBe(drawer.getAttribute("aria-labelledby"));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Confirm update" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Record details" })).toBeInTheDocument();
    expect(nestedOpener).toHaveFocus();
    expect(document.body).toHaveStyle({ overflow: "hidden" });

    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.body.style.overflow).toBe(""));
  });
});
