import { CLIENT_STATUS_LABELS, type ClientStatus } from "@aios/contracts";
import { Badge } from "@/components/ui";

const variants: Record<ClientStatus, "purple" | "cyan" | "green" | "orange" | "pink"> = {
  prospect: "purple",
  onboarding: "cyan",
  active: "green",
  paused: "orange",
  churned: "pink",
};

export function ClientStatusBadge({ status }: { status: ClientStatus }) {
  return <Badge variant={variants[status]}>{CLIENT_STATUS_LABELS[status]}</Badge>;
}
