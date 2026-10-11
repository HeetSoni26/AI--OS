import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ClientForm } from "./client-form";

describe("ClientForm", () => {
  it("uses stable field IDs and focuses a linked error summary", async () => {
    const user = userEvent.setup();
    render(<ClientForm pending={false} onCancel={vi.fn()} onSubmit={vi.fn()} />);

    await user.clear(screen.getByRole("textbox", { name: /Client name/ }));
    await user.type(screen.getByRole("textbox", { name: "Email" }), "not-an-email");
    await user.click(screen.getByRole("button", { name: "Create client" }));

    const summary = await screen.findByRole("alert", { name: "Check the client details" });
    await waitFor(() => expect(summary).toHaveFocus());
    expect(screen.getByRole("textbox", { name: /Client name/ })).toHaveAttribute("id", "client-name");
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("id", "client-contact-email");
    expect(screen.getByRole("link", { name: /email/i })).toHaveAttribute("href", "#client-contact-email");
    expect(document.querySelector("label label")).not.toBeInTheDocument();
  });

  it("stages an optional valid logo after client creation", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const logo = new File(["image"], "mark.png", { type: "image/png" });
    render(<ClientForm pending={false} onCancel={vi.fn()} onSubmit={onSubmit} />);

    await user.type(screen.getByRole("textbox", { name: /Client name/ }), "Northstar Labs");
    await user.upload(screen.getByLabelText("Logo (optional)"), logo);
    await user.click(screen.getByRole("button", { name: "Create client and upload logo" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(onSubmit.mock.calls[0]?.[1]).toBe(logo);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({ name: "Northstar Labs", status: "prospect", mrr: 0, totalRevenue: 0 });
  });

  it("rejects an unsupported staged logo and links its field error", async () => {
    render(<ClientForm pending={false} onCancel={vi.fn()} onSubmit={vi.fn()} />);

    const input = screen.getByLabelText("Logo (optional)");
    const file = new File(["text"], "logo.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [file] } });

    expect(await screen.findAllByText("Choose a PNG, JPEG, or WebP image.")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Choose a PNG, JPEG, or WebP image." })).toHaveAttribute("href", "#client-logo");
  });
});
