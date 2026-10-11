import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Checkbox,
  DataTable,
  DataTableSortableHeader,
  ErrorSummary,
  FormField,
  Pagination,
  Tab,
  TabPanel,
  Tabs,
  TabsList,
  Textarea,
} from "@/components/ui";

describe("form primitives", () => {
  it("associates textarea and checkbox help and errors with their controls", () => {
    render(
      <>
        <Textarea label="Notes" hint="Keep it concise" error="Notes are required" />
        <Checkbox label="Accept policy" hint="Required to continue" error="You must accept" />
      </>,
    );

    const textarea = screen.getByRole("textbox", { name: "Notes" });
    expect(textarea).toHaveAccessibleDescription("Keep it concise Notes are required");
    expect(textarea).toHaveAttribute("aria-invalid", "true");

    const checkbox = screen.getByRole("checkbox", { name: "Accept policy" });
    expect(checkbox).toHaveAccessibleDescription("Required to continue You must accept");
    expect(checkbox).toHaveAttribute("aria-invalid", "true");
  });

  it("wires FormField errors and ErrorSummary links to a control", () => {
    render(
      <>
        <ErrorSummary errors={[{ id: "display-name", message: "Enter a display name" }]} />
        <FormField id="display-name" label="Display name" hint="Visible to collaborators" error="Enter a display name" required>
          <input />
        </FormField>
      </>,
    );

    const input = screen.getByRole("textbox", { name: /Display name/ });
    expect(input).toHaveAccessibleDescription("Visible to collaborators Enter a display name");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("link", { name: "Enter a display name" })).toHaveAttribute("href", "#display-name");
  });
});

describe("navigation primitives", () => {
  it("supports arrow-key tab selection", async () => {
    const user = userEvent.setup();
    render(
      <Tabs defaultValue="overview">
        <TabsList aria-label="Record sections">
          <Tab value="overview">Overview</Tab>
          <Tab value="activity">Activity</Tab>
        </TabsList>
        <TabPanel value="overview">Overview content</TabPanel>
        <TabPanel value="activity">Activity content</TabPanel>
      </Tabs>,
    );

    const overview = screen.getByRole("tab", { name: "Overview" });
    overview.focus();
    await user.keyboard("{ArrowRight}");

    expect(screen.getByRole("tab", { name: "Activity" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel", { name: "Activity" })).toBeVisible();
  });

  it("announces sortable state and requests sorting", async () => {
    const user = userEvent.setup();
    const onSort = vi.fn();
    render(
      <DataTable>
        <thead><tr><DataTableSortableHeader direction="ascending" onSort={onSort}>Name</DataTableSortableHeader></tr></thead>
        <tbody><tr><td>Atlas</td></tr></tbody>
      </DataTable>,
    );

    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByRole("button", { name: "Name: sort descending" }));
    expect(onSort).toHaveBeenCalledOnce();
  });

  it("changes pages and exposes the current page", async () => {
    const user = userEvent.setup();

    function PaginationHarness() {
      const [page, setPage] = useState(2);
      return <Pagination page={page} pageCount={8} pageSize={10} totalItems={76} onPageChange={setPage} />;
    }

    render(<PaginationHarness />);
    expect(screen.getByRole("button", { name: "Go to page 2" })).toHaveAttribute("aria-current", "page");
    await user.click(screen.getByRole("button", { name: "Go to next page" }));
    expect(screen.getByRole("button", { name: "Go to page 3" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("21-30 of 76")).toBeInTheDocument();
  });
});
