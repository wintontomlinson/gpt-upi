import { Badge } from "@/components/ui/badge";
import type { OrderStatus, WorkerStatus } from "@/lib/types/app";
import { cn } from "@/lib/utils";

type BadgeLanguage = "zh" | "en";

const orderLabels: Record<BadgeLanguage, Record<"worker" | "customer", Record<OrderStatus, string>>> = {
  zh: {
    worker: {
      PENDING: "Waiting",
      ASSIGNED: "Processing",
      CHECKING: "Checking",
      NEED_REUPLOAD: "Reupload",
      COMPLETED: "Completed",
      FAILED: "Failed",
      CANCELLED: "Cancelled",
      EXPIRED: "Expired",
    },
    customer: {
      PENDING: "Waiting",
      ASSIGNED: "Processing",
      CHECKING: "Checking",
      NEED_REUPLOAD: "Reupload",
      COMPLETED: "Completed",
      FAILED: "Failed",
      CANCELLED: "Cancelled",
      EXPIRED: "Expired",
    },
  },
  en: {
    worker: {
      PENDING: "Waiting",
      ASSIGNED: "Processing",
      CHECKING: "Checking",
      NEED_REUPLOAD: "Reupload",
      COMPLETED: "Completed",
      FAILED: "Failed",
      CANCELLED: "Cancelled",
      EXPIRED: "Expired",
    },
    customer: {
      PENDING: "Waiting",
      ASSIGNED: "Processing",
      CHECKING: "Checking",
      NEED_REUPLOAD: "Reupload",
      COMPLETED: "Completed",
      FAILED: "Failed",
      CANCELLED: "Cancelled",
      EXPIRED: "Expired",
    },
  },
};

const workerLabels: Record<BadgeLanguage, Record<WorkerStatus, string>> = {
  zh: { ONLINE: "Online", OFFLINE: "Offline" },
  en: { ONLINE: "Online", OFFLINE: "Offline" },
};

const orderTone: Record<OrderStatus, string> = {
  PENDING: "bg-warning",
  ASSIGNED: "bg-info",
  CHECKING: "bg-warning",
  NEED_REUPLOAD: "bg-destructive",
  COMPLETED: "bg-success",
  FAILED: "bg-muted-foreground",
  CANCELLED: "bg-muted-foreground",
  EXPIRED: "bg-muted-foreground",
};

export function OrderStatusBadge({
  status,
  audience = "worker",
  language = "en",
}: {
  status: OrderStatus;
  audience?: "customer" | "worker";
  language?: BadgeLanguage;
}) {
  const label = orderLabels[language][audience][status];
  return (
    <Badge variant="secondary" className="gap-2 rounded-full px-2.5">
      <span className={cn("size-2 rounded-full", orderTone[status])} />
      {label}
    </Badge>
  );
}

export function WorkerStatusBadge({ status, language = "en" }: { status: WorkerStatus; language?: BadgeLanguage }) {
  const online = status === "ONLINE";
  return (
    <Badge variant="secondary" className="gap-2 rounded-full px-2.5">
      <span className={cn("size-2 rounded-full", online ? "bg-success" : "bg-muted-foreground")} />
      {workerLabels[language][status]}
    </Badge>
  );
}

export function orderStatusText(status: OrderStatus, language: BadgeLanguage = "en", audience: "customer" | "worker" = "worker") {
  return orderLabels[language][audience][status];
}
