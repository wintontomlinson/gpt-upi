"use client";

import Link from "next/link";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { ActivityIcon, ArrowLeftIcon, CheckCircle2Icon, PauseCircleIcon, PlayCircleIcon, RefreshCwIcon, RotateCcwIcon, SearchIcon, ShieldAlertIcon, TimerIcon } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app/app-frame";
import { AdminListPagination } from "@/components/app/admin-list-pagination";
import { MetricCard } from "@/components/app/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, formatDateTime } from "@/lib/api-client";
import type { AdminPaginationMeta } from "@/lib/types/app";

type ExtractStatus = "queued" | "running" | "completed" | "failed";
type ExtractSource = "direct" | "storage";
type ExtractChannel = "public" | "premium";

type ExtractProgress = {
  stage: string;
  percent: number;
  proxy?: string;
  updatedAt?: string;
};

type AdminExtractJob = {
  jobId: string;
  status: ExtractStatus;
  source: ExtractSource;
  channel: ExtractChannel;
  createdAt: string;
  updatedAt: string;
  progress?: ExtractProgress;
  error?: string;
  hasPayload: boolean;
  hasResult: boolean;
  canStart: boolean;
  canStop: boolean;
};

type ExtractActivity = {
  jobId: string;
  seq: number;
  status: ExtractStatus;
  source: ExtractSource;
  channel: ExtractChannel;
  createdAt: string;
  updatedAt: string;
};

type ExtractCounts = Record<ExtractStatus, number>;

type AdminExtractState = {
  paused: boolean;
  pausedByChannel?: Record<ExtractChannel, boolean>;
  maxConcurrent: number;
  maxConcurrentByChannel?: Record<ExtractChannel, number>;
  activeExtractionCount: number;
  activeExtractionCountByChannel?: Record<ExtractChannel, number>;
  queuedCount: number;
  queuedCountByChannel?: Record<ExtractChannel, number>;
  liveJobCount: number;
  jobs: AdminExtractJob[];
  items: ExtractActivity[];
  jobsPagination?: AdminPaginationMeta;
  itemsPagination?: AdminPaginationMeta;
  counts: ExtractCounts;
  storageActiveCount: number;
  changed?: number;
};

const emptyCounts: ExtractCounts = { completed: 0, queued: 0, running: 0, failed: 0 };
const ADMIN_PAGE_SIZE = 20;

function adminExtractUrl(input: { page: number; search?: string }) {
  const params = new URLSearchParams();
  params.set("paged", "1");
  params.set("page", String(input.page));
  params.set("pageSize", String(ADMIN_PAGE_SIZE));
  if (input.search?.trim()) params.set("search", input.search.trim());
  return `/api/admin/upi-extract?${params.toString()}`;
}

export function AdminUpiExtractClient() {
  const [state, setState] = useState<AdminExtractState | null>(null);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [concurrencyDraft, setConcurrencyDraft] = useState<Record<ExtractChannel, string>>({ public: "10", premium: "5" });
  const [concurrencyDirty, setConcurrencyDirty] = useState<Record<ExtractChannel, boolean>>({ public: false, premium: false });

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const next = await apiFetch<AdminExtractState>(adminExtractUrl({ page, search: deferredSearch }));
      setState(next);
      setConcurrencyDraft((current) => ({
        public: concurrencyDirty.public ? current.public : String(channelMaxConcurrent(next, "public")),
        premium: concurrencyDirty.premium ? current.premium : String(channelMaxConcurrent(next, "premium")),
      }));
      if (!silent) toast.success("Extraction task list refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to refresh extraction tasks");
    } finally {
      setLoading(false);
    }
  }, [concurrencyDirty.premium, concurrencyDirty.public, deferredSearch, page]);

  const control = useCallback(async (action: "pause" | "resume" | "start" | "stop" | "stopAll", jobId?: string, channel?: ExtractChannel) => {
    try {
      setActing(jobId ? `${action}:${jobId}` : channel ? `${action}:${channel}` : action);
      const next = await apiFetch<AdminExtractState>("/api/admin/upi-extract", {
        method: "POST",
        body: JSON.stringify({ action, jobId, channel }),
      });
      setState(next);
      if (action === "pause") toast.success(`${channelLabel(channel)} extraction paused`);
      else if (action === "resume") toast.success(`${channelLabel(channel)} extraction resumed`);
      else if (action === "stopAll") toast.success(`Moved ${next.changed ?? 0} task(s) to queued`);
      else if (action === "stop") toast.success("Task moved to queued");
      else toast.success("Task started");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setActing(null);
    }
  }, []);

  const saveConcurrency = useCallback(async (channel: ExtractChannel) => {
    try {
      setActing(`setConcurrency:${channel}`);
      const next = await apiFetch<AdminExtractState>("/api/admin/upi-extract", {
        method: "POST",
        body: JSON.stringify({ action: "setConcurrency", channel, concurrency: Number(concurrencyDraft[channel]) }),
      });
      setState(next);
      setConcurrencyDirty((current) => ({ ...current, [channel]: false }));
      toast.success(`${channelLabel(channel)} concurrency limit saved`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save concurrency limit");
    } finally {
      setActing(null);
    }
  }, [concurrencyDraft]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    const interval = window.setInterval(() => void refresh(true), 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const counts = state?.counts || emptyCounts;
  const jobsById = useMemo(() => new Map((state?.jobs || []).map((job) => [job.jobId, job])), [state?.jobs]);
  const recentItems = state?.items || [];
  const isBusy = loading || Boolean(acting);

  return (
    <AppFrame audience="admin" title="UPI Extraction Admin" subtitle="View extraction tasks, pause intake, or move running tasks back to queued." onRefresh={() => refresh()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeftIcon data-icon="inline-start" />Back to admin home
        </Link>
        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search task ID / status / error" className="pl-9" />
          </div>
          <Button variant="outline" onClick={() => refresh()} disabled={isBusy}>
            <RefreshCwIcon data-icon="inline-start" />Refresh
          </Button>
          <ChannelPauseButton
            channel="public"
            paused={Boolean(state?.pausedByChannel?.public ?? state?.paused)}
            disabled={isBusy}
            acting={acting}
            onControl={control}
          />
          <ChannelPauseButton
            channel="premium"
            paused={Boolean(state?.pausedByChannel?.premium)}
            disabled={isBusy}
            acting={acting}
            onControl={control}
          />
          <Button variant="outline" onClick={() => control("stopAll")} disabled={isBusy}>
            <RotateCcwIcon data-icon="inline-start" />Stop all and move to queued
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <MetricCard title="Intake Status" value={pauseSummary(state)} description="Public and Premium can be paused independently; queued tasks can be started manually." icon={isAnyChannelPaused(state) ? ShieldAlertIcon : CheckCircle2Icon} tone={isAnyChannelPaused(state) ? "warning" : "success"} />
        <MetricCard title="Active" value={state?.activeExtractionCount ?? 0} description={`Public ${state?.activeExtractionCountByChannel?.public ?? 0}/${channelMaxConcurrent(state, "public")} / Premium ${state?.activeExtractionCountByChannel?.premium ?? 0}/${channelMaxConcurrent(state, "premium")}`} icon={ActivityIcon} tone="info" />
        <MetricCard title="Queued" value={state?.queuedCount ?? counts.queued} description={`Public ${state?.queuedCountByChannel?.public ?? 0} / Premium ${state?.queuedCountByChannel?.premium ?? 0}`} icon={TimerIcon} tone="warning" />
        <MetricCard title="Success / Failed" value={`${counts.completed} / ${counts.failed}`} description="All-time activity stats" icon={CheckCircle2Icon} tone="brand" />
        <MetricCard title="In Storage" value={state?.storageActiveCount ?? 0} description="Currently active storage IDs" icon={RotateCcwIcon} tone="brand" />
      </div>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Channel Concurrency Settings</CardTitle>
          <CardDescription>Set concurrent extraction tasks for public and premium channels. Changes take effect immediately; running tasks are not interrupted.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {(["public", "premium"] as const).map((channel) => {
              const active = state?.activeExtractionCountByChannel?.[channel] ?? 0;
              const queued = state?.queuedCountByChannel?.[channel] ?? 0;
              const isSaving = acting === `setConcurrency:${channel}`;
              return (
                <div key={channel} className="rounded-3xl border border-border p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">{channelLabel(channel)} channel</div>
                      <div className="mt-1 text-xs text-muted-foreground">Running {active}, queued {queued}</div>
                    </div>
                    <Badge variant={channel === "premium" ? "default" : "outline"}>Limit {channelMaxConcurrent(state, channel)}</Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={concurrencyDraft[channel]}
                      onChange={(event) => {
                        setConcurrencyDraft((current) => ({ ...current, [channel]: event.target.value }));
                        setConcurrencyDirty((current) => ({ ...current, [channel]: true }));
                      }}
                      className="h-10 rounded-xl"
                    />
                    <Button
                      type="button"
                      onClick={() => void saveConcurrency(channel)}
                      disabled={isBusy || isSaving || !concurrencyDirty[channel]}
                      className="rounded-xl"
                    >
                      {isSaving ? "Saving" : "Save"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Live Extraction Tasks</CardTitle>
          <CardDescription>
            Only tasks controllable within the current process are shown. Stopping a task moves it to queued, not failed. After service restart, history is preserved but ephemeral data is lost.
          </CardDescription>
          <CardAction>
            <div className="flex flex-wrap gap-2">
              <Badge variant={state?.pausedByChannel?.public ? "secondary" : "default"}>Public {state?.pausedByChannel?.public ? "Paused" : "Running"}</Badge>
              <Badge variant={state?.pausedByChannel?.premium ? "secondary" : "default"}>Premium {state?.pausedByChannel?.premium ? "Paused" : "Running"}</Badge>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Task</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Progress</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Error</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(state?.jobs || []).map((job) => (
                  <TableRow key={job.jobId}>
                    <TableCell>
                      <div className="font-mono text-xs">{shortJobId(job.jobId)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{job.hasPayload ? "Resumable" : "No ephemeral data"}{job.hasResult ? " / Has result" : ""}</div>
                    </TableCell>
                    <TableCell><ChannelBadge channel={job.channel} /></TableCell>
                    <TableCell><SourceBadge source={job.source} /></TableCell>
                    <TableCell><StatusBadge status={job.status} /></TableCell>
                    <TableCell>
                      <div className="min-w-[140px]">
                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{stageText(job.progress?.stage)}</span>
                          <span>{Math.round(Number(job.progress?.percent || 0))}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, Number(job.progress?.percent || 0)))}%` }} />
                        </div>
                        {job.progress?.proxy ? <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">{job.progress.proxy}</div> : null}
                      </div>
                    </TableCell>
                    <TableCell>{formatDateTime(job.createdAt)}</TableCell>
                    <TableCell>{formatDateTime(job.updatedAt)}</TableCell>
                    <TableCell className="max-w-[280px]">
                      {job.error ? <div className="truncate text-sm text-destructive" title={job.error}>{job.error}</div> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => control("start", job.jobId)} disabled={isBusy || !job.canStart}>
                          <PlayCircleIcon data-icon="inline-start" />Start
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => control("stop", job.jobId)} disabled={isBusy || !job.canStop}>
                          <PauseCircleIcon data-icon="inline-start" />Stop
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(!state?.jobs || state.jobs.length === 0) && (
                  <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">No controllable live tasks at this time</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={state?.jobsPagination} loading={loading} onPageChange={setPage} className="mt-4" />
        </CardContent>
      </Card>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Recent Extraction Records</CardTitle>
          <CardDescription>For verifying heatmap status; this list does not include credentials or QR content.</CardDescription>
          <CardAction>{recentItems.length}  records</CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Task</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentItems.map((item) => {
                  const liveJob = jobsById.get(item.jobId);
                  const canStart = item.status === "queued" && Boolean(liveJob?.canStart);
                  return (
                    <TableRow key={`${item.seq}-${item.jobId}`}>
                      <TableCell>{item.seq}</TableCell>
                      <TableCell className="font-mono text-xs">{shortJobId(item.jobId)}</TableCell>
                      <TableCell><ChannelBadge channel={item.channel} /></TableCell>
                      <TableCell><SourceBadge source={item.source} /></TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      <TableCell>{formatDateTime(item.updatedAt)}</TableCell>
                      <TableCell className="text-right">
                        {item.status === "queued" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => control("start", item.jobId)}
                            disabled={isBusy || !canStart}
                            title={canStart ? "Start this queued task" : "This record has no resumable data and cannot be started"}
                          >
                            <PlayCircleIcon data-icon="inline-start" />Start
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {recentItems.length === 0 && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">No extraction records</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={state?.itemsPagination} loading={loading} onPageChange={setPage} className="mt-4" />
        </CardContent>
      </Card>
    </AppFrame>
  );
}

function ChannelPauseButton({
  channel,
  paused,
  disabled,
  acting,
  onControl,
}: {
  channel: ExtractChannel;
  paused: boolean;
  disabled: boolean;
  acting: string | null;
  onControl: (action: "pause" | "resume" | "start" | "stop" | "stopAll", jobId?: string, channel?: ExtractChannel) => void;
}) {
  const label = channelLabel(channel);
  const isActing = acting === `pause:${channel}` || acting === `resume:${channel}`;
  return paused ? (
    <Button onClick={() => onControl("resume", undefined, channel)} disabled={disabled || isActing}>
      <PlayCircleIcon data-icon="inline-start" />Resume {label}
    </Button>
  ) : (
    <Button variant="outline" onClick={() => onControl("pause", undefined, channel)} disabled={disabled || isActing}>
      <PauseCircleIcon data-icon="inline-start" />Pause {label}
    </Button>
  );
}

function ChannelBadge({ channel }: { channel?: ExtractChannel }) {
  return <Badge variant={channel === "premium" ? "default" : "outline"}>{channel === "premium" ? "Premium" : "Public"}</Badge>;
}

function channelLabel(channel?: ExtractChannel) {
  if (channel === "premium") return "Premium";
  if (channel === "public") return "Public";
  return "Premium";
}

function channelMaxConcurrent(state: AdminExtractState | null, channel: ExtractChannel) {
  return state?.maxConcurrentByChannel?.[channel] ?? state?.maxConcurrent ?? (channel === "premium" ? 5 : 10);
}

function isAnyChannelPaused(state: AdminExtractState | null) {
  return Boolean(state?.pausedByChannel?.public || state?.pausedByChannel?.premium || state?.paused);
}

function pauseSummary(state: AdminExtractState | null) {
  const publicPaused = Boolean(state?.pausedByChannel?.public ?? state?.paused);
  const premiumPaused = Boolean(state?.pausedByChannel?.premium);
  if (publicPaused && premiumPaused) return "All paused";
  if (publicPaused) return "Public paused";
  if (premiumPaused) return "Premium paused";
  return "Running";
}

function StatusBadge({ status }: { status: ExtractStatus }) {
  const meta: Record<ExtractStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    completed: { label: "Success", variant: "default" },
    queued: { label: "Queued", variant: "secondary" },
    running: { label: "Extracting", variant: "outline" },
    failed: { label: "Failed", variant: "destructive" },
  };
  return <Badge variant={meta[status].variant}>{meta[status].label}</Badge>;
}

function SourceBadge({ source }: { source: ExtractSource }) {
  return <Badge variant={source === "storage" ? "secondary" : "outline"}>{source === "storage" ? "Storage" : "Direct"}</Badge>;
}

function shortJobId(jobId: string) {
  if (!jobId) return "-";
  return `${jobId.slice(0, 8)}…${jobId.slice(-6)}`;
}

function stageText(stage?: string) {
  const map: Record<string, string> = {
    queued: "Preparing",
    validating: "Validating",
    checkout: "Creating checkout",
    stripe_init: "Initializing Stripe",
    stripe_confirm: "Confirming payment",
    approval: "Approve stage",
    waiting_qr: "Waiting for QR",
    hydrating: "Parsing QR data",
    rendering_qr: "Rendering QR",
    completed: "Completed",
  };
  return map[stage || "queued"] || stage || "Preparing";
}
