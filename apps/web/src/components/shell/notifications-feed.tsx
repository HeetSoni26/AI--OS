"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck } from "lucide-react";
import { Button, Empty, Skeleton } from "@/components/ui";
import { ApiClientError } from "@/lib/api-client";
import { knowledgeApi, type NotificationDto } from "@/features/knowledge/lib/knowledge-api";

const dateTime = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

const PRIORITY_COLORS: Record<string, string> = {
  critical: "text-[#FF4D6D]",
  high: "text-orange-300",
  medium: "text-cyan-200",
  low: "text-[#888]",
};

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const requestId = error instanceof ApiClientError ? error.requestId : undefined;
  return `${error.message}${requestId ? ` Request ID: ${requestId}.` : ""}`;
}

/** The top-bar bell: durable in-app notification records with unread state. */
export function NotificationsFeed() {
  const cache = useQueryClient();
  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => knowledgeApi.notifications(),
    refetchInterval: 30_000,
  });

  const markAll = useMutation({
    mutationFn: () => knowledgeApi.markAllNotificationsRead(),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markOne = useMutation({
    mutationFn: (notificationId: string) => knowledgeApi.markNotificationRead(notificationId),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (notifications.isLoading) {
    return <div role="status" className="grid gap-2"><span className="sr-only">Loading notifications…</span><Skeleton className="h-10" /><Skeleton className="h-10" /></div>;
  }
  if (notifications.isError) {
    return <Empty className="min-h-32" title="Notifications could not be loaded" description={errorMessage(notifications.error, "Retry from the bell later.")} />;
  }

  const items: NotificationDto[] = notifications.data?.items ?? [];
  const unreadCount = notifications.data?.unreadCount ?? 0;

  if (!items.length) {
    return <Empty className="min-h-40" title="No notifications yet" description="Agent errors, new leads, and overdue invoices create notifications automatically as you operate the workspace." />;
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-wide text-[#888]">{unreadCount} unread of {items.length}</p>
        {unreadCount > 0 ? (
          <Button size="sm" variant="ghost" onClick={() => markAll.mutate()} disabled={markAll.isPending}>
            <CheckCheck className="size-3.5" aria-hidden="true" />Mark all read
          </Button>
        ) : null}
      </div>
      <ul className="grid gap-2" aria-label="Notifications">
        {items.map((notification) => (
          <li
            key={notification.id}
            className={`rounded-xl border p-3 ${notification.read ? "border-[#2A2E45] bg-[#0C1020]" : "border-cyan-300/30 bg-cyan-300/[0.05]"}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-xs font-medium ${notification.read ? "text-[#C5C8DB]" : "text-[#F3F5FF]"}`}>{notification.title}</p>
                {notification.body ? <p className="mt-1 text-[11px] leading-5 text-[#888]">{notification.body}</p> : null}
                <p className="mt-1.5 text-[10px] text-[#666]">
                  <span className={PRIORITY_COLORS[notification.priority] ?? "text-[#888]"}>{notification.priority}</span>
                  {" · "}{notification.type.replaceAll("_", " ")} · {dateTime.format(new Date(notification.createdAt))}
                </p>
              </div>
              {!notification.read ? (
                <Button size="sm" variant="ghost" onClick={() => markOne.mutate(notification.id)} disabled={markOne.isPending}>Mark read</Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
