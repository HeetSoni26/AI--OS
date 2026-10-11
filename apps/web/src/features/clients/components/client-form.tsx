"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { clientCreateSchema, clientStatuses, CLIENT_STATUS_LABELS, type ClientCreate, type ClientDto } from "@aios/contracts";
import { Button, ErrorSummary, FormField, Input, Textarea } from "@/components/ui";

const fieldIds = {
  name: "client-name",
  industry: "client-industry-field",
  status: "client-status",
  contactName: "client-contact-name",
  contactEmail: "client-contact-email",
  contactPhone: "client-contact-phone",
  website: "client-website",
  mrr: "client-mrr",
  totalRevenue: "client-total-revenue",
  startDate: "client-start-date",
  notes: "client-notes",
  logo: "client-logo",
} as const;

const allowedLogoTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maximumLogoBytes = 5 * 1024 * 1024;
const emptyAsUndefined = { setValueAs: (value: string) => value === "" ? undefined : value };

export function ClientForm({
  initial,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: ClientDto;
  pending: boolean;
  error?: string;
  onSubmit: (input: ClientCreate, logo?: File) => Promise<void>;
  onCancel: () => void;
}) {
  type ClientCreateInput = z.input<typeof clientCreateSchema>;
  const [logo, setLogo] = useState<File>();
  const [logoError, setLogoError] = useState("");
  const form = useForm<ClientCreateInput, unknown, ClientCreate>({
    resolver: zodResolver(clientCreateSchema),
    defaultValues: {
      name: initial?.name ?? "",
      industry: initial?.industry,
      status: initial?.status ?? "prospect",
      contactName: initial?.contactName,
      contactEmail: initial?.contactEmail,
      contactPhone: initial?.contactPhone,
      website: initial?.website,
      notes: initial?.notes,
      mrr: initial?.mrr ?? 0,
      totalRevenue: initial?.totalRevenue ?? 0,
      startDate: initial?.startDate,
      logoFileId: initial?.logoFileId,
    },
  });
  const issues = useMemo(() => {
    const fieldIssues = Object.entries(form.formState.errors)
      .filter((entry): entry is [keyof typeof fieldIds, { message: string }] => typeof entry[1]?.message === "string" && entry[0] in fieldIds)
      .map(([field, item]) => ({ id: fieldIds[field], message: item.message }));
    return logoError ? [...fieldIssues, { id: fieldIds.logo, message: logoError }] : fieldIssues;
  }, [form.formState.errors, logoError]);
  const summaryId = error ? "client-form-server-errors" : "client-form-errors";

  useEffect(() => {
    if ((error || (form.formState.submitCount > 0 && issues.length > 0))) {
      document.getElementById(summaryId)?.focus();
    }
  }, [error, form.formState.submitCount, issues.length, summaryId]);

  const submit = form.handleSubmit(async (input) => {
    if (logoError) {
      document.getElementById("client-form-errors")?.focus();
      return;
    }
    try {
      await onSubmit(input, logo);
    } catch {
      // The parent owns and renders the mutation error without leaking a rejected event promise.
    }
  });

  return (
    <form id="client-form" tabIndex={-1} className="grid gap-4 outline-none" onSubmit={submit} noValidate>
      {error ? <ErrorSummary id={summaryId} title="Client could not be saved" errors={[{ id: "client-form", message: error }]} /> : issues.length ? <ErrorSummary id={summaryId} title="Check the client details" errors={issues} /> : null}

      <FormField id={fieldIds.name} label="Client name" required error={form.formState.errors.name?.message}>
        <Input autoFocus autoComplete="organization" {...form.register("name")} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id={fieldIds.industry} label="Industry" error={form.formState.errors.industry?.message}>
          <Input autoComplete="organization-title" {...form.register("industry", emptyAsUndefined)} />
        </FormField>
        <FormField id={fieldIds.status} label="Status" error={form.formState.errors.status?.message}>
          <select {...form.register("status")} className="h-10 w-full rounded-lg border border-[#2A2E45] bg-[#0C1020] px-3 text-sm text-[#F3F5FF] hover:border-[#3A3E59] focus:border-cyan-300/60 focus:outline-none">
            {clientStatuses.map((status) => <option key={status} value={status}>{CLIENT_STATUS_LABELS[status]}</option>)}
          </select>
        </FormField>
      </div>

      <fieldset className="grid gap-4 rounded-xl border border-[#2A2E45] p-4">
        <legend className="px-2 text-xs font-medium text-[#C5C8DB]">Initial primary contact</legend>
        <FormField id={fieldIds.contactName} label="Contact name" error={form.formState.errors.contactName?.message}>
          <Input autoComplete="name" {...form.register("contactName", emptyAsUndefined)} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id={fieldIds.contactEmail} label="Email" error={form.formState.errors.contactEmail?.message}>
            <Input type="email" autoComplete="email" {...form.register("contactEmail", emptyAsUndefined)} />
          </FormField>
          <FormField id={fieldIds.contactPhone} label="Phone" error={form.formState.errors.contactPhone?.message}>
            <Input type="tel" autoComplete="tel" {...form.register("contactPhone", emptyAsUndefined)} />
          </FormField>
        </div>
      </fieldset>

      <FormField id={fieldIds.website} label="Website" error={form.formState.errors.website?.message}>
        <Input type="url" placeholder="https://" autoComplete="url" {...form.register("website", emptyAsUndefined)} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id={fieldIds.mrr} label="Monthly recurring revenue" error={form.formState.errors.mrr?.message}>
          <Input type="number" min="0" step="0.01" inputMode="decimal" {...form.register("mrr", { valueAsNumber: true })} />
        </FormField>
        <FormField id={fieldIds.totalRevenue} label="Total revenue" error={form.formState.errors.totalRevenue?.message}>
          <Input type="number" min="0" step="0.01" inputMode="decimal" {...form.register("totalRevenue", { valueAsNumber: true })} />
        </FormField>
        <FormField id={fieldIds.startDate} label="Start date" error={form.formState.errors.startDate?.message}>
          <Input type="date" {...form.register("startDate", emptyAsUndefined)} />
        </FormField>
      </div>

      <FormField id={fieldIds.notes} label="Notes" error={form.formState.errors.notes?.message}>
        <Textarea rows={5} {...form.register("notes", emptyAsUndefined)} />
      </FormField>

      {!initial ? (
        <FormField id={fieldIds.logo} label="Logo (optional)" hint="PNG, JPEG, or WebP, up to 5 MiB. The logo is uploaded after the client is created." error={logoError || undefined}>
          <Input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => {
              const nextLogo = event.target.files?.[0];
              setLogo(undefined);
              setLogoError("");
              if (!nextLogo) return;
              if (!allowedLogoTypes.has(nextLogo.type)) {
                setLogoError("Choose a PNG, JPEG, or WebP image.");
                return;
              }
              if (nextLogo.size > maximumLogoBytes) {
                setLogoError("Choose an image no larger than 5 MiB.");
                return;
              }
              setLogo(nextLogo);
            }}
          />
        </FormField>
      ) : null}

      <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save client" : logo ? "Create client and upload logo" : "Create client"}</Button>
      </div>
    </form>
  );
}
