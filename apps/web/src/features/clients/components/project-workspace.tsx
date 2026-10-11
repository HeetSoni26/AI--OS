"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Pencil, Plus, Trash2 } from "lucide-react";
import {
  ASSIGNMENT_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TIME_ENTRY_SOURCE_LABELS,
  taskPriorities,
  taskStatuses,
  type AssignmentDto,
  type DeliverableCreate,
  type DeliverableDto,
  type ProjectDto,
  type TaskCreate,
  type TaskDto,
  type TimeEntryCreate,
  type TimeEntryDto,
} from "@aios/contracts";
import { Badge, Button, Checkbox, Dialog, Empty, FormField, Input, Select, Tab, TabPanel, Tabs, TabsList, Textarea, useAnnounce } from "@/components/ui";
import { clientApi, type AssignmentUpdate, type ManualTimeEntryUpdate } from "../lib/client-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const nullable = (value: FormDataEntryValue | null) => String(value ?? "").trim() || null;
const iso = (value: FormDataEntryValue | null) => nullable(value) ? new Date(String(value)).toISOString() : null;
const inputDateTime = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : "";
const message = (error: unknown) => error instanceof Error ? error.message : "Try again.";

export function ProjectWorkspace({ project }: { project: ProjectDto }) {
  return (
    <div className="mt-1 border-t border-[#2A2E45] pt-3">
      <Tabs defaultValue="tasks">
        <TabsList aria-label={`${project.name} work sections`}><Tab value="tasks">Tasks</Tab><Tab value="deliverables">Deliverables</Tab><Tab value="assignments">Assignments</Tab><Tab value="time">Time</Tab><Tab value="history">History</Tab></TabsList>
        <TabPanel value="tasks"><TaskManager clientId={project.clientId} projectId={project.id} /></TabPanel>
        <TabPanel value="deliverables"><DeliverableManager project={project} /></TabPanel>
        <TabPanel value="assignments"><AssignmentManager clientId={project.clientId} projectId={project.id} /></TabPanel>
        <TabPanel value="time"><TimeManager clientId={project.clientId} projectId={project.id} /></TabPanel>
        <TabPanel value="history"><StatusHistory clientId={project.clientId} projectId={project.id} /></TabPanel>
      </Tabs>
    </div>
  );
}

function TaskManager({ clientId, projectId }: { clientId: string; projectId: string }) {
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [editor, setEditor] = useState<TaskDto | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaskDto | null>(null);
  const tasks = useQuery({ queryKey: ["projects", projectId, "tasks"], queryFn: () => clientApi.tasks(clientId, projectId) });
  const refresh = () => cache.invalidateQueries({ queryKey: ["projects", projectId] });
  const save = useMutation({
    mutationFn: (input: Omit<TaskCreate, "projectId">) => editor === "new" ? clientApi.createTask(clientId, projectId, input) : clientApi.updateTask(clientId, projectId, editor!.id, input),
    onMutate: () => announce(editor === "new" ? "Creating task." : "Saving task changes."),
    onSuccess: async (task) => { setEditor(null); announce(`Task ${task.title} saved.`); await refresh(); },
    onError: (error) => announce(`Task could not be saved. ${message(error)}`),
  });
  const remove = useMutation({
    mutationFn: (task: TaskDto) => clientApi.deleteTask(clientId, projectId, task.id),
    onMutate: (task) => announce(`Deleting task ${task.title}.`),
    onSuccess: async (task) => { setDeleteTarget(null); announce(`Task ${task.title} deleted.`); await refresh(); },
    onError: (error) => announce(`Task could not be deleted. ${message(error)}`),
  });
  return (
    <WorkSection title="Tasks" description="Track project work, status, priority, and due dates." addLabel="Add task" expanded={editor === "new"} onAdd={() => setEditor("new")}>
      <QueryState query={tasks} noun="tasks" retry={() => tasks.refetch()} emptyTitle="No tasks" emptyDescription="Add the first project task.">
        <div className="grid gap-2">{tasks.data?.map((task) => <div key={task.id} className="rounded-lg border border-[#2A2E45] p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="break-words text-xs text-[#F3F5FF]">{task.title}</p><p className="mt-1 text-[10px] text-[#888]">{TASK_PRIORITY_LABELS[task.priority]} priority{task.dueAt ? ` · Due ${dateTime.format(new Date(task.dueAt))}` : ""}</p></div><Badge variant={task.status === "blocked" ? "orange" : task.status === "done" ? "green" : "neutral"}>{TASK_STATUS_LABELS[task.status]}</Badge></div>{task.description ? <p className="mt-2 whitespace-pre-wrap text-[11px] leading-5 text-[#C5C8DB]">{task.description}</p> : null}<div className="mt-2 flex justify-end gap-1 border-t border-[#2A2E45] pt-2"><Button size="sm" variant="ghost" onClick={() => setEditor(task)}><Pencil className="size-3" aria-hidden="true" />Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(task)}><Trash2 className="size-3" aria-hidden="true" />Delete</Button></div></div>)}</div>
      </QueryState>
      <TaskDialog task={editor} open={Boolean(editor)} pending={save.isPending} error={save.error} onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }} onSubmit={(input) => save.mutate(input)} />
      <DeleteDialog noun="task" name={deleteTarget?.title} open={Boolean(deleteTarget)} pending={remove.isPending} error={remove.error} onClose={() => { remove.reset(); setDeleteTarget(null); }} onDelete={() => deleteTarget && remove.mutate(deleteTarget)} />
    </WorkSection>
  );
}

function TaskDialog({ task, open, pending, error, onClose, onSubmit }: { task: TaskDto | "new" | null; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: Omit<TaskCreate, "projectId">) => void }) {
  const titleRef = useRef<HTMLInputElement>(null);
  const current = task === "new" ? null : task;
  return <Dialog open={open} onClose={onClose} title={current ? "Edit task" : "Add task"} description="Task changes are recorded against this project." initialFocusRef={titleRef}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const status = String(form.get("status")) as TaskCreate["status"]; onSubmit({ title: String(form.get("title") ?? "").trim(), description: nullable(form.get("description")), status, priority: String(form.get("priority")) as TaskCreate["priority"], dueAt: iso(form.get("dueAt")), parentTaskId: null, ...(status === "done" && current?.status !== "done" ? {} : {}) }); }}>
    {error ? <MutationError action="Task save" error={error} /> : null}<FormField label="Title" required><Input ref={titleRef} name="title" required defaultValue={current?.title} /></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField label="Status"><Select name="status" defaultValue={current?.status ?? "todo"}>{taskStatuses.map((status) => <option key={status} value={status}>{TASK_STATUS_LABELS[status]}</option>)}</Select></FormField><FormField label="Priority"><Select name="priority" defaultValue={current?.priority ?? "medium"}>{taskPriorities.map((priority) => <option key={priority} value={priority}>{TASK_PRIORITY_LABELS[priority]}</option>)}</Select></FormField></div><FormField label="Due"><Input name="dueAt" type="datetime-local" defaultValue={inputDateTime(current?.dueAt ?? null)} /></FormField><FormField label="Description"><Textarea name="description" rows={4} defaultValue={current?.description ?? ""} /></FormField><DialogActions pending={pending} onClose={onClose} submitLabel="Save task" /></form></Dialog>;
}

function DeliverableManager({ project }: { project: ProjectDto }) {
  const projectId = project.id;
  const cache = useQueryClient();
  const announce = useAnnounce();
  const [editor, setEditor] = useState<DeliverableDto | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeliverableDto | null>(null);
  const deliverables = useQuery({ queryKey: ["projects", projectId, "deliverables"], queryFn: () => clientApi.deliverables(project.clientId, projectId) });
  const refresh = async () => { await Promise.all([cache.invalidateQueries({ queryKey: ["projects", projectId] }), cache.invalidateQueries({ queryKey: ["clients", project.clientId, "projects"] })]); };
  const save = useMutation({
    mutationFn: (input: Omit<DeliverableCreate, "projectId">) => editor === "new" ? clientApi.createDeliverable(project.clientId, projectId, input) : clientApi.updateDeliverable(project.clientId, projectId, editor!.id, input),
    onMutate: () => announce(editor === "new" ? "Creating deliverable." : "Saving deliverable."),
    onSuccess: async (item) => { setEditor(null); announce(`Deliverable ${item.title} saved.`); await refresh(); },
    onError: (error) => announce(`Deliverable could not be saved. ${message(error)}`),
  });
  const toggle = useMutation({
    mutationFn: (item: DeliverableDto) => clientApi.updateDeliverable(project.clientId, projectId, item.id, { completedAt: item.completedAt ? null : new Date().toISOString() }),
    onMutate: (item) => announce(`${item.completedAt ? "Reopening" : "Completing"} deliverable ${item.title}.`),
    onSuccess: async (item) => { announce(`Deliverable ${item.title} ${item.completedAt ? "completed" : "reopened"}.`); await refresh(); },
    onError: (error) => announce(`Deliverable status could not be changed. ${message(error)}`),
  });
  const remove = useMutation({ mutationFn: (item: DeliverableDto) => clientApi.deleteDeliverable(project.clientId, projectId, item.id), onSuccess: async (item) => { setDeleteTarget(null); announce(`Deliverable ${item.title} deleted.`); await refresh(); }, onError: (error) => announce(`Deliverable could not be deleted. ${message(error)}`) });
  const reorder = useMutation({ mutationFn: (ids: string[]) => clientApi.reorderDeliverables(project.clientId, projectId, ids), onMutate: () => announce("Reordering deliverables."), onSuccess: async () => { announce("Deliverables reordered."); await refresh(); }, onError: (error) => announce(`Deliverables could not be reordered. ${message(error)}`) });
  const move = (index: number, direction: -1 | 1) => { const ids = deliverables.data?.map((item) => item.id) ?? []; const target = index + direction; if (target < 0 || target >= ids.length) return; [ids[index], ids[target]] = [ids[target]!, ids[index]!]; reorder.mutate(ids); };
  const shownError = save.error ?? toggle.error ?? remove.error ?? reorder.error;
  return <WorkSection title="Deliverables" description="Required unchecked items block Delivered status." addLabel="Add deliverable" expanded={editor === "new"} onAdd={() => setEditor("new")}>
    {shownError ? <BlockerError error={shownError} /> : null}
    <QueryState query={deliverables} noun="deliverables" retry={() => deliverables.refetch()} emptyTitle="No deliverables" emptyDescription="Add a checklist item before delivery."><div className="grid gap-2">{deliverables.data?.map((item, index) => <div key={item.id} className="rounded-lg border border-[#2A2E45] p-3"><div className="flex items-start gap-2"><button type="button" className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded border border-[#3A3E59] text-cyan-200" aria-label={`${item.completedAt ? "Reopen" : "Complete"} ${item.title}`} aria-pressed={Boolean(item.completedAt)} onClick={() => toggle.mutate(item)} disabled={toggle.isPending}>{item.completedAt ? <Check className="size-3.5" aria-hidden="true" /> : null}</button><div className="min-w-0 flex-1"><p className={item.completedAt ? "break-words text-xs text-[#888] line-through" : "break-words text-xs text-[#F3F5FF]"}>{item.title}</p><p className="mt-1 text-[10px] text-[#888]">{item.isRequired ? "Required" : "Optional"} · Position {item.position}</p>{item.description ? <p className="mt-2 whitespace-pre-wrap text-[11px] text-[#C5C8DB]">{item.description}</p> : null}</div></div><div className="mt-2 flex flex-wrap justify-end gap-1 border-t border-[#2A2E45] pt-2"><Button size="icon" variant="ghost" aria-label={`Move ${item.title} up`} disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}><ArrowUp className="size-3.5" aria-hidden="true" /></Button><Button size="icon" variant="ghost" aria-label={`Move ${item.title} down`} disabled={index === (deliverables.data?.length ?? 0) - 1 || reorder.isPending} onClick={() => move(index, 1)}><ArrowDown className="size-3.5" aria-hidden="true" /></Button><Button size="sm" variant="ghost" onClick={() => setEditor(item)}><Pencil className="size-3" aria-hidden="true" />Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(item)}><Trash2 className="size-3" aria-hidden="true" />Delete</Button></div></div>)}</div></QueryState>
    <DeliverableDialog deliverable={editor} count={deliverables.data?.length ?? 0} open={Boolean(editor)} pending={save.isPending} error={save.error} onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }} onSubmit={(input) => save.mutate(input)} />
    <DeleteDialog noun="deliverable" name={deleteTarget?.title} open={Boolean(deleteTarget)} pending={remove.isPending} error={remove.error} onClose={() => { remove.reset(); setDeleteTarget(null); }} onDelete={() => deleteTarget && remove.mutate(deleteTarget)} />
  </WorkSection>;
}

function DeliverableDialog({ deliverable, count, open, pending, error, onClose, onSubmit }: { deliverable: DeliverableDto | "new" | null; count: number; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: Omit<DeliverableCreate, "projectId">) => void }) {
  const titleRef = useRef<HTMLInputElement>(null); const current = deliverable === "new" ? null : deliverable;
  return <Dialog open={open} onClose={onClose} title={current ? "Edit deliverable" : "Add deliverable"} description="Required deliverables must be complete before project delivery." initialFocusRef={titleRef}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ title: String(form.get("title") ?? "").trim(), description: nullable(form.get("description")), position: current?.position ?? count + 1, isRequired: form.get("isRequired") === "on" }); }}>{error ? <BlockerError error={error} /> : null}<FormField label="Title" required><Input ref={titleRef} name="title" required defaultValue={current?.title} /></FormField><FormField label="Description"><Textarea name="description" rows={4} defaultValue={current?.description ?? ""} /></FormField><Checkbox name="isRequired" label="Required before delivery" defaultChecked={current?.isRequired ?? true} /><DialogActions pending={pending} onClose={onClose} submitLabel="Save deliverable" /></form></Dialog>;
}

function AssignmentManager({ clientId, projectId }: { clientId: string; projectId: string }) {
  const cache = useQueryClient(); const announce = useAnnounce(); const [editor, setEditor] = useState<AssignmentDto | "new" | null>(null); const [deleteTarget, setDeleteTarget] = useState<AssignmentDto | null>(null);
  const assignments = useQuery({ queryKey: ["projects", projectId, "assignments"], queryFn: () => clientApi.assignments(clientId, projectId) });
  const tasks = useQuery({ queryKey: ["projects", projectId, "tasks"], queryFn: () => clientApi.tasks(clientId, projectId) });
  const refresh = () => cache.invalidateQueries({ queryKey: ["projects", projectId] });
  const save = useMutation({ mutationFn: async ({ taskId, role, completedAt }: { taskId: string; role: string | null; completedAt: string | null }) => {
    if (editor !== "new") return clientApi.updateAssignment(clientId, projectId, editor!.id, { role, completedAt } satisfies AssignmentUpdate);
    return clientApi.createAssignment(clientId, projectId, { assigneeType: "human", taskId, role });
  }, onMutate: () => announce("Saving assignment."), onSuccess: async () => { setEditor(null); announce("Assignment saved."); await refresh(); }, onError: (error) => announce(`Assignment could not be saved. ${message(error)}`) });
  const remove = useMutation({ mutationFn: (item: AssignmentDto) => clientApi.deleteAssignment(clientId, projectId, item.id), onSuccess: async () => { setDeleteTarget(null); announce("Assignment deleted."); await refresh(); }, onError: (error) => announce(`Assignment could not be deleted. ${message(error)}`) });
  return <WorkSection title="Assignments" description="Assign the authenticated owner to tasks. AI agent assignment activates with Part 5." addLabel="Assign me" expanded={editor === "new"} onAdd={() => setEditor("new")}>
    <Button size="sm" variant="ghost" disabled title="Agent records and activation arrive in Part 5">Assign AI agent · later</Button>
    <QueryState query={assignments} noun="assignments" retry={() => assignments.refetch()} emptyTitle="No assignments" emptyDescription="Assign yourself to a project task."><div className="mt-2 grid gap-2">{assignments.data?.map((item) => <div key={item.id} className="rounded-lg border border-[#2A2E45] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-[#F3F5FF]">{ASSIGNMENT_TYPE_LABELS[item.assigneeType]}</p><p className="mt-1 text-[10px] text-[#888]">{item.role ?? "Contributor"} · {item.taskId ? taskName(tasks.data, item.taskId) : "Project level"}</p></div><Badge variant={item.completedAt ? "green" : "cyan"}>{item.completedAt ? "Complete" : "Active"}</Badge></div><div className="mt-2 flex justify-end gap-1 border-t border-[#2A2E45] pt-2"><Button size="sm" variant="ghost" onClick={() => setEditor(item)}><Pencil className="size-3" aria-hidden="true" />Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(item)}><Trash2 className="size-3" aria-hidden="true" />Delete</Button></div></div>)}</div></QueryState>
    <AssignmentDialog assignment={editor} tasks={tasks.data ?? []} tasksError={tasks.isError ? message(tasks.error) : null} open={Boolean(editor)} pending={save.isPending} error={save.error} onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }} onSubmit={(input) => save.mutate(input)} />
    <DeleteDialog noun="assignment" name={deleteTarget?.role ?? "assignment"} open={Boolean(deleteTarget)} pending={remove.isPending} error={remove.error} onClose={() => { remove.reset(); setDeleteTarget(null); }} onDelete={() => deleteTarget && remove.mutate(deleteTarget)} />
  </WorkSection>;
}

function AssignmentDialog({ assignment, tasks, tasksError, open, pending, error, onClose, onSubmit }: { assignment: AssignmentDto | "new" | null; tasks: readonly TaskDto[]; tasksError: string | null; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: { taskId: string; role: string | null; completedAt: string | null }) => void }) {
  const roleRef = useRef<HTMLInputElement>(null); const current = assignment === "new" ? null : assignment;
  return <Dialog open={open} onClose={onClose} title={current ? "Edit assignment" : "Assign owner"} description="Human assignments must be connected to a project task." initialFocusRef={roleRef}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ taskId: String(form.get("taskId") ?? ""), role: nullable(form.get("role")), completedAt: form.get("completed") === "on" ? current?.completedAt ?? new Date().toISOString() : null }); }}>{error ? <MutationError action="Assignment save" error={error} /> : null}{tasksError ? <MutationError action="Task options" error={new Error(tasksError)} /> : null}<FormField label="Task" required><Select name="taskId" required defaultValue={current?.taskId ?? ""} disabled={Boolean(current)}><option value="" disabled>Select a task</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</Select></FormField><FormField label="Role"><Input ref={roleRef} name="role" defaultValue={current?.role ?? ""} placeholder="Owner, reviewer, implementer…" /></FormField>{current ? <Checkbox name="completed" label="Assignment complete" defaultChecked={Boolean(current.completedAt)} /> : null}<DialogActions pending={pending || !tasks.length} onClose={onClose} submitLabel="Save assignment" /></form></Dialog>;
}

function TimeManager({ clientId, projectId }: { clientId: string; projectId: string }) {
  const cache = useQueryClient(); const announce = useAnnounce(); const [editor, setEditor] = useState<TimeEntryDto | "new" | null>(null); const [deleteTarget, setDeleteTarget] = useState<TimeEntryDto | null>(null);
  const time = useQuery({ queryKey: ["projects", projectId, "time"], queryFn: () => clientApi.projectTime(clientId, projectId) });
  const entries = time.data?.items;
  const summary = time.data?.aggregation;
  const tasks = useQuery({ queryKey: ["projects", projectId, "tasks"], queryFn: () => clientApi.tasks(clientId, projectId) });
  const refresh = () => cache.invalidateQueries({ queryKey: ["projects", projectId] });
  const save = useMutation({ mutationFn: (input: Omit<TimeEntryCreate, "projectId" | "source" | "agentRunId">) => editor === "new" ? clientApi.createManualTimeEntry(clientId, projectId, input) : clientApi.updateManualTimeEntry(clientId, projectId, editor!.id, input satisfies ManualTimeEntryUpdate), onMutate: () => announce("Saving manual time."), onSuccess: async () => { setEditor(null); announce("Manual time saved."); await refresh(); }, onError: (error) => announce(`Manual time could not be saved. ${message(error)}`) });
  const remove = useMutation({ mutationFn: (entry: TimeEntryDto) => clientApi.deleteManualTimeEntry(clientId, projectId, entry.id), onSuccess: async () => { setDeleteTarget(null); announce("Manual time entry deleted."); await refresh(); }, onError: (error) => announce(`Manual time could not be deleted. ${message(error)}`) });
  return <WorkSection title="Time" description="Manual entries are editable. Agent-run time is read-only and starts in Part 5." addLabel="Log time" expanded={editor === "new"} onAdd={() => setEditor("new")}>
    {time.isLoading ? <Loading label="Calculating project time…" /> : time.isError ? <MutationError action="Time summary" error={time.error} /> : summary ? <dl className="mb-3 grid grid-cols-2 gap-2 rounded-lg border border-[#2A2E45] p-3 text-[11px]"><Item label="Total" value={minutes(summary.totalMinutes)} /><Item label="Manual" value={minutes(summary.manualMinutes)} /><Item label="Agent run" value={minutes(summary.agentRunMinutes)} /><Item label="Billable" value={currency.format(summary.billableAmount)} /></dl> : null}
    {!time.isLoading && !time.isError ? !entries?.length ? <Empty className="min-h-32" title="No time recorded" description="Log the first manual time entry." /> : <div className="grid gap-2">{entries.map((entry) => <div key={entry.id} className="rounded-lg border border-[#2A2E45] p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-xs text-[#F3F5FF]">{entry.description ?? "Time entry"}</p><p className="mt-1 text-[10px] text-[#888]">{dateTime.format(new Date(entry.startedAt))} · {taskName(tasks.data, entry.taskId)}</p></div><Badge variant={entry.source === "manual" ? "cyan" : "purple"}>{TIME_ENTRY_SOURCE_LABELS[entry.source]} · {minutes(entry.minutes)}</Badge></div>{entry.source === "manual" ? <div className="mt-2 flex justify-end gap-1 border-t border-[#2A2E45] pt-2"><Button size="sm" variant="ghost" onClick={() => setEditor(entry)}><Pencil className="size-3" aria-hidden="true" />Edit</Button><Button size="sm" variant="ghost" onClick={() => setDeleteTarget(entry)}><Trash2 className="size-3" aria-hidden="true" />Delete</Button></div> : null}</div>)}</div> : null}
    <TimeDialog entry={editor} tasks={tasks.data ?? []} open={Boolean(editor)} pending={save.isPending} error={save.error} onClose={() => { if (!save.isPending) { save.reset(); setEditor(null); } }} onSubmit={(input) => save.mutate(input)} />
    <DeleteDialog noun="manual time entry" name={deleteTarget?.description ?? "time entry"} open={Boolean(deleteTarget)} pending={remove.isPending} error={remove.error} onClose={() => { remove.reset(); setDeleteTarget(null); }} onDelete={() => deleteTarget && remove.mutate(deleteTarget)} />
  </WorkSection>;
}

function TimeDialog({ entry, tasks, open, pending, error, onClose, onSubmit }: { entry: TimeEntryDto | "new" | null; tasks: readonly TaskDto[]; open: boolean; pending: boolean; error: unknown; onClose: () => void; onSubmit: (input: Omit<TimeEntryCreate, "projectId" | "source" | "agentRunId">) => void }) {
  const descriptionRef = useRef<HTMLInputElement>(null); const current = entry === "new" ? null : entry; const now = new Date(); const startDefault = new Date(now.getTime() - 60 * 60_000).toISOString().slice(0, 16); const endDefault = now.toISOString().slice(0, 16);
  return <Dialog open={open} onClose={onClose} title={current ? "Edit manual time" : "Log manual time"} description="Times cannot overlap another manual entry for the authenticated owner." initialFocusRef={descriptionRef}><form className="grid gap-4" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); onSubmit({ taskId: nullable(form.get("taskId")), description: nullable(form.get("description")), startedAt: iso(form.get("startedAt"))!, endedAt: iso(form.get("endedAt")), minutes: Number(form.get("minutes")), hourlyRate: nullable(form.get("hourlyRate")) ? Number(form.get("hourlyRate")) : null }); }}>{error ? <MutationError action="Manual time save" error={error} /> : null}<FormField label="Description"><Input ref={descriptionRef} name="description" defaultValue={current?.description ?? ""} /></FormField><FormField label="Task"><Select name="taskId" defaultValue={current?.taskId ?? ""}><option value="">Project level</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</Select></FormField><div className="grid gap-4 sm:grid-cols-2"><FormField label="Started" required><Input name="startedAt" type="datetime-local" required defaultValue={inputDateTime(current?.startedAt ?? null) || startDefault} /></FormField><FormField label="Ended" required><Input name="endedAt" type="datetime-local" required defaultValue={inputDateTime(current?.endedAt ?? null) || endDefault} /></FormField></div><div className="grid gap-4 sm:grid-cols-2"><FormField label="Minutes" required><Input name="minutes" type="number" min="1" max="525600" required defaultValue={current?.minutes ?? 60} /></FormField><FormField label="Hourly rate"><Input name="hourlyRate" type="number" min="0" step="0.01" defaultValue={current?.hourlyRate ?? ""} /></FormField></div><DialogActions pending={pending} onClose={onClose} submitLabel="Save time" /></form></Dialog>;
}

function StatusHistory({ clientId, projectId }: { clientId: string; projectId: string }) {
  const project = useQuery({ queryKey: ["projects", projectId, "detail"], queryFn: () => clientApi.project(clientId, projectId) });
  if (project.isLoading) return <Loading label="Loading status history…" />;
  if (project.isError) return <Empty className="min-h-32" title="Status history could not be loaded" description={message(project.error)} action={<Button size="sm" onClick={() => project.refetch()}>Retry status history</Button>} />;
  if (!project.data?.statusHistory.length) return <Empty className="min-h-32" title="No status history" description="Status transitions will appear after the first project change." />;
  return <ol className="grid gap-2">{project.data.statusHistory.map((item) => <li key={item.id} className="rounded-lg border border-[#2A2E45] p-3"><div className="flex flex-wrap items-start justify-between gap-2"><p className="text-xs text-[#C5C8DB]">{item.fromStatus ? TASK_CASE(item.fromStatus) : "Created"} → <span className="text-[#F3F5FF]">{TASK_CASE(item.toStatus)}</span></p><time className="text-[10px] text-[#888]">{dateTime.format(new Date(item.changedAt))}</time></div>{item.reason ? <p className="mt-2 whitespace-pre-wrap text-[11px] text-[#888]">{item.reason}</p> : null}<p className="mt-2 font-mono text-[10px] text-[#666]">Changed by {item.changedBy ?? "system"}</p></li>)}</ol>;
}

function WorkSection({ title, description, addLabel, expanded, onAdd, children }: { title: string; description: string; addLabel: string; expanded: boolean; onAdd: () => void; children: React.ReactNode }) { const controls = `${title.toLowerCase().replaceAll(" ", "-")}-dialog-trigger`; return <section aria-label={title}><div className="mb-3 flex items-start justify-between gap-2"><div><h4 className="text-xs font-medium text-[#F3F5FF]">{title}</h4><p className="mt-1 text-[10px] leading-4 text-[#888]">{description}</p></div><Button id={controls} size="sm" variant="ghost" aria-haspopup="dialog" aria-expanded={expanded} onClick={onAdd}><Plus className="size-3" aria-hidden="true" />{addLabel}</Button></div>{children}</section>; }
function QueryState<T>({ query, noun, retry, emptyTitle, emptyDescription, children }: { query: { isLoading: boolean; isError: boolean; error: unknown; data?: readonly T[] }; noun: string; retry: () => unknown; emptyTitle: string; emptyDescription: string; children: React.ReactNode }) { if (query.isLoading) return <Loading label={`Loading ${noun}…`} />; if (query.isError) return <Empty className="min-h-32" title={`${TASK_CASE(noun)} could not be loaded`} description={message(query.error)} action={<Button size="sm" onClick={retry}>Retry</Button>} />; if (!query.data?.length) return <Empty className="min-h-32" title={emptyTitle} description={emptyDescription} />; return children; }
function DeleteDialog({ noun, name, open, pending, error, onClose, onDelete }: { noun: string; name?: string; open: boolean; pending: boolean; error: unknown; onClose: () => void; onDelete: () => void }) { return <Dialog open={open} onClose={onClose} title={`Delete ${noun}`} description="This removes the record from active project work."><p className="text-sm text-[#C5C8DB]">Delete <strong className="text-[#F3F5FF]">{name}</strong>?</p>{error ? <MutationError action={`${TASK_CASE(noun)} deletion`} error={error} /> : null}<div className="mt-5 flex justify-end gap-2"><Button variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="danger" onClick={onDelete} disabled={pending}>{pending ? "Deleting…" : "Delete"}</Button></div></Dialog>; }
function DialogActions({ pending, onClose, submitLabel }: { pending: boolean; onClose: () => void; submitLabel: string }) { return <div className="flex justify-end gap-2 border-t border-[#2A2E45] pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : submitLabel}</Button></div>; }
function MutationError({ action, error }: { action: string; error: unknown }) { return <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/[0.06] p-3 text-xs text-red-200">{action} failed. {message(error)}</p>; }
function BlockerError({ error }: { error: unknown }) { const blockers = blockerItems(error); return <div role="alert" className="rounded-lg border border-orange-400/30 bg-orange-400/[0.06] p-3 text-xs text-orange-200"><p>{message(error)}</p>{blockers.length ? <ul className="mt-2 list-disc pl-5">{blockers.map((blocker) => <li key={blocker.id}>{blocker.title} must be completed first.</li>)}</ul> : null}</div>; }
function blockerItems(error: unknown): Array<{ id: string; title: string }> { const details = typeof error === "object" && error && "details" in error ? (error as { details?: unknown }).details : null; const raw = typeof details === "object" && details && "blockers" in details ? (details as { blockers?: unknown }).blockers : null; return Array.isArray(raw) ? raw.flatMap((item) => typeof item === "object" && item && "deliverableId" in item && "title" in item ? [{ id: String(item.deliverableId), title: String(item.title) }] : []) : []; }
function Loading({ label }: { label: string }) { return <p role="status" className="rounded-lg border border-[#2A2E45] p-3 text-xs text-[#888]">{label}</p>; }
function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-[10px] uppercase text-[#666]">{label}</dt><dd className="mt-1 text-[#C5C8DB]">{value}</dd></div>; }
function taskName(tasks: readonly TaskDto[] | undefined, taskId: string | null) { return taskId ? tasks?.find((task) => task.id === taskId)?.title ?? "Task" : "Project level"; }
function minutes(value: number) { const hours = Math.floor(value / 60); const rest = value % 60; return hours ? `${hours}h ${rest}m` : `${rest}m`; }
function TASK_CASE(value: string) { return value.replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase()); }
