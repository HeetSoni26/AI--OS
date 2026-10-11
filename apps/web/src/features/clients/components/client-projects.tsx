"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import {
  PROJECT_STATUS_LABELS,
  PROJECT_TYPE_LABELS,
  projectStatuses,
  projectTypes,
  type ProjectCreate,
  type ProjectDto,
  type ProjectUpdate,
} from "@aios/contracts";
import { Badge, Button, Card, CardContent, Dialog, Empty, FormField, Input, Select, Textarea, useAnnounce } from "@/components/ui";
import { cn } from "@/lib/utils";
import { clientApi } from "../lib/client-api";
import { ProjectWorkspace } from "./project-workspace";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const amount = (value: FormDataEntryValue | null) => String(value ?? "").trim() ? Number(value) : null;

export function ClientProjects({ clientId }: { clientId: string }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [editor, setEditor] = useState<ProjectDto | "new" | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDto | null>(null);
  const projects = useQuery({ queryKey: ["clients", clientId, "projects"], queryFn: () => clientApi.projects(clientId) });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["clients", clientId, "projects"] }),
      cache.invalidateQueries({ queryKey: ["clients", clientId] }),
      cache.invalidateQueries({ queryKey: ["clients"], exact: false }),
    ]);
  };
  const save = useMutation({
    mutationFn: async (input: Omit<ProjectCreate, "clientId"> & { statusReason?: string }) => {
      const { statusReason, ...fields } = input;
      if (editor === "new") return clientApi.createProject(clientId, fields);
      const { status, ...profile } = fields;
      let project = await clientApi.updateProject(clientId, editor!.id, profile satisfies ProjectUpdate);
      if (status !== editor!.status) project = await clientApi.updateProjectStatus(clientId, editor!.id, status, statusReason);
      return project;
    },
    onMutate: () => announce(editor === "new" ? "Creating project." : "Saving project changes."),
    onSuccess: async (project) => {
      setEditor(null);
      setExpandedId(project.id);
      announce(`${project.name} ${editor === "new" ? "created" : "updated"}.`);
      await refresh();
    },
    onError: (error) => announce(`Project could not be saved. ${message(error)}`),
  });
  const remove = useMutation({
    mutationFn: (project: ProjectDto) => clientApi.deleteProject(clientId, project.id),
    onMutate: (project) => announce(`Deleting project ${project.name}.`),
    onSuccess: async (project) => { setDeleteTarget(null); setExpandedId(null); announce(`${project.name} deleted.`); await refresh(); },
    onError: (error) => announce(`Project could not be deleted. ${message(error)}`),
  });

  return (
    <section aria-labelledby="projects-heading">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h3 id="projects-heading" className="text-sm font-medium text-[#F3F5FF]">Projects</h3><p className="mt-1 text-[11px] text-[#888]">Open a project to manage delivery work and status history.</p></div>
        <Button size="sm" variant="ghost" aria-haspopup="dialog" aria-expanded={editor === "new"} onClick={() => setEditor("new")}><Plus className="size-3.5" aria-hidden="true" />New project</Button>
      </div>
      {projects.isLoading ? <Loading label="Loading projects…" /> : projects.isError ? <Empty title="Projects could not be loaded" description={message(projects.error)} action={<Button size="sm" onClick={() => projects.refetch()}>Retry projects</Button>} /> : !projects.data?.length ? <Empty title="No projects" description="Create the first client delivery project." action={<Button size="sm" onClick={() => setEditor("new")}>Create project</Button>} /> : (
        <div className="grid gap-3">
          {projects.data.map((project) => {
            const expanded = expandedId === project.id;
            const panelId = `project-work-${project.id}`;
            return (
              <Card key={project.id}>
                <CardContent className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="min-w-0 flex-1 text-left" aria-expanded={expanded} aria-controls={panelId} onClick={() => setExpandedId(expanded ? null : project.id)}>
                      <span className="flex items-center gap-2"><ChevronDown className={cn("size-4 shrink-0 text-[#888] transition-transform", expanded && "rotate-180")} aria-hidden="true" /><span className="break-words text-xs font-medium text-[#F3F5FF]">{project.name}</span></span>
                      <span className="mt-1 block pl-6 text-[11px] text-[#888]">{PROJECT_TYPE_LABELS[project.type]} · {project.hoursSpent} hours · {project.taskCount} tasks</span>
                    </button>
                    <Badge variant="purple">{PROJECT_STATUS_LABELS[project.status]}</Badge>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 pl-6 text-[11px]"><Item label="Due" value={project.dueDate ?? "Not set"} /><Item label="Price" value={project.price == null ? "Not set" : currency.format(project.price)} /></dl>
                  {project.description ? <p className="whitespace-pre-wrap pl-6 text-[11px] leading-5 text-[#C5C8DB]">{project.description}</p> : null}
                  <div className="flex justify-end gap-1 border-t border-[#2A2E45] pt-2"><Button size="sm" variant="ghost" onClick={() => setEditor(project)}><Pencil className="size-3.5" aria-hidden="true" />Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(project)}><Trash2 className="size-3.5" aria-hidden="true" />Delete</Button></div>
                  <div id={panelId} hidden={!expanded}>{expanded ? <ProjectWorkspace project={project} /> : null}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <ProjectDialog project={editor} open={Boolean(editor)} pending={save.isPending} error={save.error} onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }} onSubmit={(input) => save.mutate(input)} />
      <Dialog open={Boolean(deleteTarget)} onClose={() => { if (!remove.isPending) { remove.reset(); setDeleteTarget(null); } }} title="Delete project" description="Tasks, assignments, time entries, and deliverables related to this project are removed from active views.">
        <p className="text-sm text-[#C5C8DB]">Delete <strong className="text-[#F3F5FF]">{deleteTarget?.name}</strong> and its delivery work?</p>
        {remove.isError ? <MutationError action="Project deletion" error={remove.error} /> : null}
        <div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={remove.isPending}>Cancel</Button><Button variant="danger" onClick={() => deleteTarget && remove.mutate(deleteTarget)} disabled={remove.isPending}>{remove.isPending ? "Deleting…" : "Delete project"}</Button></div>
      </Dialog>
    </section>
  );
}

function ProjectDialog({ project, open, pending, error, onClose, onSubmit }: { project: ProjectDto | "new" | null; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: Omit<ProjectCreate, "clientId"> & { statusReason?: string }) => void }) {
  const nameRef = useRef<HTMLInputElement>(null);
  const current = project === "new" ? null : project;
  return (
    <Dialog open={open} onClose={onClose} title={current ? "Edit project" : "New project"} description="Changing status records a project history entry. Required deliverables gate Delivered status." initialFocusRef={nameRef}>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        onSubmit({ name: String(form.get("name") ?? "").trim(), type: String(form.get("type")) as ProjectCreate["type"], status: String(form.get("status")) as ProjectCreate["status"], description: nullable(form.get("description")), startDate: nullable(form.get("startDate")), dueDate: nullable(form.get("dueDate")), price: amount(form.get("price")), statusReason: nullable(form.get("statusReason")) ?? undefined });
      }}>
        {error ? <MutationError action="Project save" error={error} /> : null}
        <FormField label="Project name" required><Input ref={nameRef} name="name" required defaultValue={current?.name} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Type"><Select name="type" defaultValue={current?.type ?? "custom"}>{projectTypes.map((type) => <option key={type} value={type}>{PROJECT_TYPE_LABELS[type]}</option>)}</Select></FormField><FormField label="Status"><Select name="status" defaultValue={current?.status ?? "planning"}>{projectStatuses.map((status) => <option key={status} value={status}>{PROJECT_STATUS_LABELS[status]}</option>)}</Select></FormField></div>
        <div className="grid gap-4 sm:grid-cols-2"><FormField label="Start date"><Input name="startDate" type="date" defaultValue={current?.startDate ?? ""} /></FormField><FormField label="Due date"><Input name="dueDate" type="date" defaultValue={current?.dueDate ?? ""} /></FormField></div>
        <FormField label="Price"><Input name="price" type="number" min="0" step="0.01" defaultValue={current?.price ?? ""} /></FormField>
        <FormField label="Description"><Textarea name="description" rows={4} defaultValue={current?.description ?? ""} /></FormField>
        <FormField label="Status change reason" hint="Saved only when the status changes."><Input name="statusReason" maxLength={2000} /></FormField>
        <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : current ? "Save project" : "Create project"}</Button></div>
      </form>
    </Dialog>
  );
}

function Loading({ label }: { label: string }) { return <p role="status" className="rounded-xl border border-[#2A2E45] p-4 text-xs text-[#888]">{label}</p>; }
function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase text-[#666]">{label}</dt><dd className="mt-1 text-[#C5C8DB]">{value}</dd></div>; }
function MutationError({ action, error }: { action: string; error: unknown }) { return <p role="alert" className="mt-3 rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{action} failed. {message(error)}</p>; }
function message(error: unknown) { return error instanceof Error ? error.message : "Try again."; }
