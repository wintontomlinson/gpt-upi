"use client";

import Link from "next/link";
import { FormEvent, useCallback, useDeferredValue, useEffect, useMemo, useState, type ComponentType } from "react";
import { ActivityIcon, AlertTriangleIcon, CheckCircle2Icon, ClipboardListIcon, DatabaseIcon, DownloadIcon, Globe2Icon, KeyRoundIcon, Loader2Icon, PlusIcon, RefreshCwIcon, SaveIcon, SearchIcon, ShieldCheckIcon, Trash2Icon, UserPlusIcon, UsersRoundIcon, WalletIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app/app-frame";
import { AdminListPagination } from "@/components/app/admin-list-pagination";
import { MetricCard } from "@/components/app/metric-card";
import { OrderStatusBadge, WorkerStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, formatDateTime, formatMoney } from "@/lib/api-client";
import type { AdminPaginatedResponse, AdminPaginationMeta, OrderStatus, PublicCdk, PublicCdkBatch, PublicOrder, PublicProxyCheckSummary, PublicProxySelection, PublicUpstreamProxy, PublicWorker, PublicWorkerWithdrawalRequest, WorkerWalletSummary } from "@/lib/types/app";
import { cn } from "@/lib/utils";

type AdminWorker = PublicWorker & {
  activeOrder?: { orderId: string; orderNo: string; createdAt: string } | null;
  _count?: { records: number };
  completedCount?: number;
  totalAmount?: number;
  unsettledCompleted?: number;
  unsettledAmount?: number;
  settledCompleted?: number;
  settledAmount?: number;
  wallet?: WorkerWalletSummary;
};

type NavIcon = ComponentType<{ className?: string }>;
const ADMIN_PAGE_SIZE = 20;

function pagedAdminUrl(path: string, input: { page: number; search?: string; pageSize?: number; extra?: Record<string, string | number | boolean | null | undefined> }) {
  const params = new URLSearchParams();
  params.set("paged", "1");
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize ?? ADMIN_PAGE_SIZE));
  if (input.search?.trim()) params.set("search", input.search.trim());
  for (const [key, value] of Object.entries(input.extra || {})) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return `${path}?${params.toString()}`;
}

type PublicSiteSettings = {
  tgInviteEnabled: boolean;
  tgInviteUrl: string;
  depositEnabled: boolean;
  extractMethodSelectionEnabled: boolean;
  customProxyEnabled: boolean;
};

export function AdminDashboardClient() {
  const [cdks, setCdks] = useState<PublicCdk[]>([]);
  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [settings, setSettings] = useState<PublicSiteSettings>({
    tgInviteEnabled: false,
    tgInviteUrl: "https://t.me/your_group",
    depositEnabled: true,
    extractMethodSelectionEnabled: false,
    customProxyEnabled: false,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const [nextCdks, nextWorkers, nextSettings] = await Promise.all([
        apiFetch<PublicCdk[]>("/api/admin/cdks"),
        apiFetch<AdminWorker[]>("/api/admin/workers"),
        apiFetch<PublicSiteSettings>("/api/admin/settings"),
      ]);
      setCdks(nextCdks);
      setWorkers(nextWorkers);
      setSettings(nextSettings);
      if (!silent) toast.success("Admin data refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const setTgInviteEnabled = useCallback(async (enabled: boolean) => {
    const previous = settings;
    try {
      setSettings((current) => ({ ...current, tgInviteEnabled: enabled }));
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ tgInviteEnabled: enabled }),
      });
      setSettings(nextSettings);
      toast.success(enabled ? "TG group button shown" : "TG group button hidden");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Settings failed");
    }
  }, [settings]);

  const setDepositEnabled = useCallback(async (enabled: boolean) => {
    const previous = settings;
    try {
      setSettings((current) => ({ ...current, depositEnabled: enabled }));
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ depositEnabled: enabled }),
      });
      setSettings(nextSettings);
      toast.success(enabled ? "Deposit enabled" : "Deposit disabled");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save deposit settings");
    }
  }, [settings]);

  const setExtractMethodSelectionEnabled = useCallback(async (enabled: boolean) => {
    const previous = settings;
    try {
      setSettings((current) => ({ ...current, extractMethodSelectionEnabled: enabled }));
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ extractMethodSelectionEnabled: enabled }),
      });
      setSettings(nextSettings);
      toast.success(enabled ? "Extract channel selection enabled" : "Extract channel selection disabled, defaulting to UPI");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save extract channel settings");
    }
  }, [settings]);

  const setCustomProxyEnabled = useCallback(async (enabled: boolean) => {
    const previous = settings;
    try {
      setSettings((current) => ({ ...current, customProxyEnabled: enabled }));
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ customProxyEnabled: enabled }),
      });
      setSettings(nextSettings);
      toast.success(enabled ? "Custom proxy enabled" : "Custom proxy disabled");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save custom proxy settings");
    }
  }, [settings]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const onlineWorkers = workers.filter((worker) => worker.status === "ONLINE").length;
  const unsettledAmount = workers.reduce((sum, worker) => sum + (worker.unsettledAmount ?? 0), 0);

  return (
    <AppFrame audience="admin" title="Global Admin" subtitle="View system overview and access Recharge CDK, Workers, Orders, Proxies, Extract, and User management." onRefresh={() => refresh()}>
      <div className="grid gap-4 xl:grid-cols-3">
        <MetricCard title="Recharge CDK Count" value={cdks.length} description="Go to the Recharge CDK page to batch-generate, view, and export by batch." icon={KeyRoundIcon} tone="brand" />
        <MetricCard title="Unredeemed Value" value={`${cdks.reduce((sum, cdk) => sum + (!cdk.redeemedAt && cdk.status === "ACTIVE" ? cdk.amount : 0), 0).toFixed(2)}U`} description="Total amount of all unredeemed recharge CDKs." icon={DatabaseIcon} tone="success" />
        <MetricCard title="Unsettled Amount" value={formatMoney(unsettledAmount)} description="Completed but unsettled worker earnings." icon={ShieldCheckIcon} tone="warning" />
      </div>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Site Settings</CardTitle>
          <CardDescription>Control TG group button, user deposit entry, and other public page features.</CardDescription>
          <CardAction><Globe2Icon className="size-5 text-muted-foreground" /></CardAction>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Show TG group button</div>
              <div className="mt-1 text-sm text-muted-foreground">
                When enabled, the TG group button is shown on the extract page. Opens {settings.tgInviteUrl}
              </div>
            </div>
            <Switch checked={settings.tgInviteEnabled} onCheckedChange={setTgInviteEnabled} disabled={loading} />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Enable user deposit</div>
              <div className="mt-1 text-sm text-muted-foreground">
                When disabled, the wallet deposit entry on the UPI extract page is hidden and the server rejects new deposit orders.
              </div>
            </div>
            <Switch checked={settings.depositEnabled} onCheckedChange={setDepositEnabled} disabled={loading} />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Show extract channel selection</div>
              <div className="mt-1 text-sm text-muted-foreground">
                When disabled, UPI channel is used by default and the backend ignores other channel parameters.
              </div>
            </div>
            <Switch checked={settings.extractMethodSelectionEnabled} onCheckedChange={setExtractMethodSelectionEnabled} disabled={loading} />
          </div>
          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-medium">Allow custom proxies</div>
              <div className="mt-1 text-sm text-muted-foreground">
                When disabled, custom checkout/provider proxy options are hidden and the backend ignores user proxy parameters.
              </div>
            </div>
            <Switch checked={settings.customProxyEnabled} onCheckedChange={setCustomProxyEnabled} disabled={loading} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-[420px_1fr]">
        <Card className="rounded-3xl bg-background shadow-sm">
          <CardHeader>
            <CardTitle>Worker Accounts</CardTitle>
            <CardDescription>Total accounts and currently online workers in one card.</CardDescription>
            <CardAction><UsersRoundIcon className="size-5 text-muted-foreground" /></CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted/40 p-4"><div className="text-sm text-muted-foreground">Workers</div><div className="mt-2 text-4xl font-semibold tracking-tight">{workers.length}</div></div>
              <div className="rounded-2xl bg-muted/40 p-4"><div className="text-sm text-muted-foreground">Online Workers</div><div className="mt-2 text-4xl font-semibold tracking-tight">{onlineWorkers}</div></div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <Link href="/admin/workers" className={buttonVariants({ variant: "outline" })}><UsersRoundIcon data-icon="inline-start" />Manage Workers</Link>
              <Link href="/admin/cdks" className={buttonVariants({ variant: "outline" })}><KeyRoundIcon data-icon="inline-start" />Manage Recharge CDK</Link>
              <Link href="/admin/orders" className={buttonVariants({ variant: "outline" })}><ClipboardListIcon data-icon="inline-start" />View Orders</Link>
              <Link href="/admin/proxies" className={buttonVariants({ variant: "outline" })}><Globe2Icon data-icon="inline-start" />Proxy List</Link>
              <Link href="/admin/upi-extract" className={buttonVariants({ variant: "outline" })}><ActivityIcon data-icon="inline-start" />Extract Management</Link>
              <Link href="/admin/users" className={buttonVariants({ variant: "outline" })}><UsersRoundIcon data-icon="inline-start" />User Management</Link>
              <Link href="/admin/billing" className={buttonVariants({ variant: "outline" })}><WalletIcon data-icon="inline-start" />Billing</Link>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl bg-background shadow-sm">
          <CardHeader><CardTitle>Admin Navigation</CardTitle><CardDescription>Common admin features are on separate pages.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              <AdminNavCard title="Recharge CDK" description="Batch-generate upi_ recharge keys, export by batch, and view redemption status." href="/admin/cdks" icon={KeyRoundIcon} />
              <AdminNavCard title="Worker Accounts" description="Create Telegram workers, set unit price, settle, and manage wallets." href="/admin/workers" icon={UserPlusIcon} />
              <AdminNavCard title="All Orders" description="View order hall, in-progress, needs re-upload, and history orders." href="/admin/orders" icon={ClipboardListIcon} />
              <AdminNavCard title="Proxy List" description="Manage public extraction proxy pool, check exit country and connectivity." href="/admin/proxies" icon={Globe2Icon} />
              <AdminNavCard title="Extract Management" description="Pause extraction, view real-time tasks, adjust concurrency limits." href="/admin/upi-extract" icon={ActivityIcon} />
              <AdminNavCard title="User Management" description="Manage user identity, balance, withdrawal requests, and deposit settings." href="/admin/users" icon={UsersRoundIcon} />
              <AdminNavCard title="Billing" description="View user wallet transactions, deposit orders, on-chain credits, and withdrawals." href="/admin/billing" icon={WalletIcon} />
            </div>
            {loading && <p className="mt-4 text-sm text-muted-foreground">Refreshing data...</p>}
          </CardContent>
        </Card>
      </div>
    </AppFrame>
  );
}

export function AdminCdksClient() {
  const rechargeAmounts = [1.8, 5, 10] as const;
  const formatCdkAmount = (value: number) => `${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}U`;
  const makeRechargeCdkCode = () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return `upi_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
  };
  const [cdks, setCdks] = useState<PublicCdk[]>([]);
  const [batches, setBatches] = useState<PublicCdkBatch[]>([]);
  const [cdkSearch, setCdkSearch] = useState("");
  const [batchSearch, setBatchSearch] = useState("");
  const deferredCdkSearch = useDeferredValue(cdkSearch);
  const deferredBatchSearch = useDeferredValue(batchSearch);
  const [cdkPage, setCdkPage] = useState(1);
  const [batchPage, setBatchPage] = useState(1);
  const [cdkPagination, setCdkPagination] = useState<AdminPaginationMeta | null>(null);
  const [batchPagination, setBatchPagination] = useState<AdminPaginationMeta | null>(null);
  const [cdkCode, setCdkCode] = useState("upi_custom_recharge_key");
  const [cdkAmount, setCdkAmount] = useState<(typeof rechargeAmounts)[number]>(1.8);
  const [cdkRemark, setCdkRemark] = useState("");
  const [batchName, setBatchName] = useState("");
  const [batchKeyCount, setBatchKeyCount] = useState(20);
  const [batchAmount, setBatchAmount] = useState<(typeof rechargeAmounts)[number]>(1.8);
  const [batchRemark, setBatchRemark] = useState("");
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      const [nextCdks, nextBatches] = await Promise.all([
        apiFetch<AdminPaginatedResponse<PublicCdk>>(pagedAdminUrl("/api/admin/cdks", { page: cdkPage, search: deferredCdkSearch })),
        apiFetch<AdminPaginatedResponse<PublicCdkBatch>>(pagedAdminUrl("/api/admin/cdks/batches", { page: batchPage, search: deferredBatchSearch })),
      ]);
      setCdks(nextCdks.items);
      setBatches(nextBatches.items);
      setCdkPagination(nextCdks.pagination);
      setBatchPagination(nextBatches.pagination);
      if (!silent) toast.success("Recharge CDK data refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Refresh failed");
    }
  }, [batchPage, cdkPage, deferredBatchSearch, deferredCdkSearch]);

  async function createCdk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      await apiFetch<PublicCdk>("/api/admin/cdks", {
        method: "POST",
        body: JSON.stringify({ code: cdkCode, amount: cdkAmount, remark: cdkRemark }),
      });
      setCdkPage(1);
      await refresh(true);
      toast.success(`Recharge CDK created: ${formatCdkAmount(cdkAmount)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create CDK");
    } finally {
      setLoading(false);
    }
  }

  async function createBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      const result = await apiFetch<{ batch: PublicCdkBatch; cdks: PublicCdk[] }>("/api/admin/cdks/batches", {
        method: "POST",
        body: JSON.stringify({
          count: batchKeyCount,
          amount: batchAmount,
          name: batchName,
          remark: batchRemark,
        }),
      });
      setBatchPage(1);
      setCdkPage(1);
      await refresh(true);
      toast.success(`Generated ${result.batch.cdkCount} recharge CDK(s) of ${formatCdkAmount(result.batch.amount)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to batch-generate CDKs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const redeemedCount = cdks.filter((cdk) => Boolean(cdk.redeemedAt)).length;
  const activeValue = cdks.reduce((sum, cdk) => sum + (!cdk.redeemedAt && cdk.status === "ACTIVE" ? cdk.amount : 0), 0);
  const redeemedValue = cdks.reduce((sum, cdk) => sum + (cdk.redeemedAt ? cdk.amount : 0), 0);

  return (
    <AppFrame audience="admin" title="Recharge CDK" subtitle="Generate upi_ recharge keys. Users can redeem them as USDT balance. Currently supports 1.8U, 5U, 10U." onRefresh={() => refresh()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">Total {cdkPagination?.total ?? cdks.length}</Badge>
          <Badge variant="outline">Redeemed (page) {redeemedCount}</Badge>
          <Badge variant="outline">Unredeemed value (page) {formatCdkAmount(activeValue)}</Badge>
          <Badge variant="outline">Redeemed value (page) {formatCdkAmount(redeemedValue)}</Badge>
        </div>
        <a href="/api/admin/cdks/export" download className={buttonVariants({ variant: "outline" })}>
          <DownloadIcon data-icon="inline-start" />Export all CSV
        </a>
      </div>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="flex flex-col gap-4">
          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>Batch Generate Recharge CDK</CardTitle>
              <CardDescription>Auto-generate upi_xxxxxxxxxxxxxxxx format keys with a fixed recharge amount.</CardDescription>
              <CardAction><KeyRoundIcon className="size-5 text-muted-foreground" /></CardAction>
            </CardHeader>
            <CardContent>
              <form onSubmit={createBatch} className="flex flex-col gap-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="batch-key-count">Count</FieldLabel>
                    <Input id="batch-key-count" type="number" min={1} max={1000} value={batchKeyCount} onChange={(event) => setBatchKeyCount(Number(event.target.value))} />
                    <FieldDescription>Max 1000 per batch.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Recharge amount</FieldLabel>
                    <div className="grid grid-cols-3 gap-2">
                      {rechargeAmounts.map((amount) => (
                        <Button key={amount} type="button" variant={batchAmount === amount ? "default" : "outline"} className="rounded-xl" onClick={() => setBatchAmount(amount)}>
                          {formatCdkAmount(amount)}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="batch-name">Batch name</FieldLabel>
                    <Input id="batch-name" value={batchName} onChange={(event) => setBatchName(event.target.value)} placeholder="e.g. 2026-06 campaign batch" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="batch-remark">Notes</FieldLabel>
                    <Input id="batch-remark" value={batchRemark} onChange={(event) => setBatchRemark(event.target.value)} placeholder="Optional, will be written to all CDKs in this batch" />
                  </Field>
                </FieldGroup>
                <Button type="submit" disabled={loading}><PlusIcon data-icon="inline-start" />Generate Batch</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>Manual Create Recharge CDK</CardTitle>
              <CardDescription>Create a single recharge key. Custom keys should also use the upi_ prefix.</CardDescription>
              <CardAction><KeyRoundIcon className="size-5 text-muted-foreground" /></CardAction>
            </CardHeader>
            <CardContent>
              <form onSubmit={createCdk} className="flex flex-col gap-5">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="cdk-code">CDK</FieldLabel>
                    <div className="flex gap-2">
                      <Input id="cdk-code" value={cdkCode} onChange={(event) => setCdkCode(event.target.value)} />
                      <Button type="button" variant="outline" className="shrink-0 rounded-xl" onClick={() => setCdkCode(makeRechargeCdkCode())}>
                        Randomize
                      </Button>
                    </div>
                    <FieldDescription>Each recharge CDK can only be redeemed once.</FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel>Recharge amount</FieldLabel>
                    <div className="grid grid-cols-3 gap-2">
                      {rechargeAmounts.map((amount) => (
                        <Button key={amount} type="button" variant={cdkAmount === amount ? "default" : "outline"} className="rounded-xl" onClick={() => setCdkAmount(amount)}>
                          {formatCdkAmount(amount)}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field><FieldLabel htmlFor="cdk-remark">Notes</FieldLabel><Input id="cdk-remark" value={cdkRemark} onChange={(event) => setCdkRemark(event.target.value)} placeholder="Optional" /></Field>
                </FieldGroup>
                <Button type="submit" disabled={loading}><PlusIcon data-icon="inline-start" />Create Recharge CDK</Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>Batches</CardTitle>
              <CardDescription>Each batch can be exported separately.</CardDescription>
              <CardAction><Button variant="outline" size="sm" onClick={() => refresh()}><RefreshCwIcon data-icon="inline-start" />Refresh</Button></CardAction>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <SearchIcon className="size-4 text-muted-foreground" />
                <Input value={batchSearch} onChange={(event) => { setBatchSearch(event.target.value); setBatchPage(1); }} placeholder="Search batch ID / name / notes" />
              </div>
              <div className="overflow-hidden rounded-3xl border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>Batch</TableHead><TableHead>Count</TableHead><TableHead>Amount</TableHead><TableHead>Created</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {batches.map((batch) => (
                      <TableRow key={batch.id}>
                        <TableCell><div className="font-semibold">{batch.name || batch.id}</div><div className="text-xs text-muted-foreground">{batch.remark || "No notes"}</div></TableCell>
                        <TableCell><Badge variant="secondary">{batch.cdkCount}</Badge></TableCell>
                        <TableCell>{formatCdkAmount(batch.amount)}</TableCell>
                        <TableCell>{formatDateTime(batch.createdAt)}</TableCell>
                        <TableCell className="text-right"><a href={`/api/admin/cdks/batches/${batch.id}/export`} download className={buttonVariants({ variant: "outline", size: "sm" })}><DownloadIcon data-icon="inline-start" />Export</a></TableCell>
                      </TableRow>
                    ))}
                    {batches.length === 0 && <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No batches</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <AdminListPagination pagination={batchPagination} loading={loading} onPageChange={setBatchPage} className="mt-4" />
            </CardContent>
          </Card>

          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader><CardTitle>Recharge CDK List</CardTitle><CardDescription>Active unredeemed keys can be redeemed in the user wallet. Each key can only be redeemed once.</CardDescription><CardAction><Button variant="outline" size="sm" onClick={() => refresh()}><RefreshCwIcon data-icon="inline-start" />Refresh</Button></CardAction></CardHeader>
            <CardContent>
              <div className="mb-3 flex items-center gap-2">
                <SearchIcon className="size-4 text-muted-foreground" />
                <Input value={cdkSearch} onChange={(event) => { setCdkSearch(event.target.value); setCdkPage(1); }} placeholder="Search CDK / redeemer / notes" />
              </div>
              <div className="overflow-hidden rounded-3xl border border-border">
                <Table>
                  <TableHeader><TableRow><TableHead>CDK</TableHead><TableHead>Amount</TableHead><TableHead>Status</TableHead><TableHead>Redeemed By</TableHead><TableHead>Created</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {cdks.map((cdk) => {
                      const redeemed = Boolean(cdk.redeemedAt);
                      return (
                        <TableRow key={cdk.id}>
                          <TableCell><div className="font-semibold">{cdk.code}</div><div className="text-xs text-muted-foreground">{cdk.remark || (cdk.batchId ? `Batch: ${cdk.batchId}` : "-")}</div></TableCell>
                          <TableCell>{formatCdkAmount(cdk.amount)}</TableCell>
                          <TableCell><Badge variant={redeemed ? "secondary" : cdk.status === "ACTIVE" ? "default" : "outline"}>{redeemed ? "Redeemed" : cdk.status === "ACTIVE" ? "Active" : cdk.status}</Badge></TableCell>
                          <TableCell>{redeemed ? <div><div className="font-medium">{cdk.redeemedByTelegramName || "-"}</div><div className="text-xs text-muted-foreground">{cdk.redeemedByTelegramId || "-"} - {formatDateTime(cdk.redeemedAt || cdk.createdAt)}</div></div> : "-"}</TableCell>
                          <TableCell>{formatDateTime(cdk.createdAt)}</TableCell>
                        </TableRow>
                      );
                    })}
                    {cdks.length === 0 && <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground">No recharge CDKs</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
              <AdminListPagination pagination={cdkPagination} loading={loading} onPageChange={setCdkPage} className="mt-4" />
            </CardContent>
          </Card>
        </div>
      </div>
    </AppFrame>
  );
}

type AdminOrderFilter = "ALL" | "HALL" | "ACTIVE" | "REUPLOAD" | "HISTORY";

const historyOrderStatuses: OrderStatus[] = ["COMPLETED", "FAILED", "CANCELLED", "EXPIRED"];
const orderFilterLabels: Record<AdminOrderFilter, string> = {
  ALL: "All",
  HALL: "Order Hall",
  ACTIVE: "In Progress",
  REUPLOAD: "Re-upload",
  HISTORY: "History",
};

export function AdminOrdersClient() {
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [filter, setFilter] = useState<AdminOrderFilter>("ALL");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<AdminPaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const response = await apiFetch<AdminPaginatedResponse<PublicOrder>>(pagedAdminUrl("/api/admin/orders", {
        page,
        search: deferredSearch,
        extra: { filter },
      }));
      setOrders(response.items);
      setPagination(response.pagination);
      if (!silent) toast.success("Order data refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Refresh failed");
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, filter, page]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const filteredOrders = orders;

  const hallCount = orders.filter((order) => order.status === "PENDING").length;
  const activeCount = orders.filter((order) => order.status === "ASSIGNED" || order.status === "CHECKING").length;
  const reuploadCount = orders.filter((order) => order.status === "NEED_REUPLOAD").length;
  const historyCount = orders.filter((order) => historyOrderStatuses.includes(order.status)).length;

  return (
    <AppFrame audience="admin" title="All Orders" subtitle="View order hall, in-progress, needs re-upload, and history orders." onRefresh={() => refresh()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => refresh()} disabled={loading}><RefreshCwIcon data-icon="inline-start" />Refresh</Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard title="Order Hall" value={hallCount} description="Orders waiting for workers to accept" icon={ClipboardListIcon} tone="warning" />
        <MetricCard title="In Progress" value={activeCount} description="Accepted but not completed" icon={ShieldCheckIcon} tone="info" />
        <MetricCard title="Needs Re-upload" value={reuploadCount} description="Returned by worker, waiting for re-upload" icon={AlertTriangleIcon} tone="warning" />
        <MetricCard title="History" value={historyCount} description="Completed, cancelled, failed, or expired" icon={DatabaseIcon} tone="brand" />
      </div>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Order List</CardTitle>
          <CardDescription>The order list shows status and processing info. QR codes are generated in the worker current order area.</CardDescription>
          <CardAction>{pagination ? `${filteredOrders.length} / ${pagination.total}` : filteredOrders.length}</CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {(Object.keys(orderFilterLabels) as AdminOrderFilter[]).map((item) => (
                <Button key={item} type="button" size="sm" variant={filter === item ? "default" : "outline"} onClick={() => { setFilter(item); setPage(1); }}>
                  {orderFilterLabels[item]}
                </Button>
              ))}
            </div>
            <div className="relative w-full lg:max-w-sm">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search order number, CDK, or worker" className="pl-9" />
            </div>
          </div>

          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>CDK</TableHead>
                  <TableHead>Worker</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((order) => {
                  const displayWorker = order.assignedWorker ?? order.lastWorker;
                  const isHistoryWorker = !order.assignedWorker && Boolean(order.lastWorker);
                  const qrRemainingText = formatOrderQrRemaining(order.upiExpiresAt, now);
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <div>
                          <div className="font-semibold">{order.orderNo}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            {order.hasSessionCredential && <Badge variant="secondary">{order.upiExtractionStatus || "PENDING"}</Badge>}
                            {order.qrIsUpi === false && <Badge variant="destructive"><AlertTriangleIcon data-icon="inline-start" />Possibly non-UPI</Badge>}
                            {qrRemainingText && <Badge variant={qrRemainingText === "Expired" ? "outline" : "secondary"}>QR {qrRemainingText}</Badge>}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell><OrderStatusBadge status={order.status} language="zh" /></TableCell>
                      <TableCell>
                        {order.cdk ? (
                          <div><div className="font-mono text-xs">{order.cdk.code}</div><div className="text-xs text-muted-foreground">Available {order.cdk.availableCount}</div></div>
                        ) : (
                          <div><Badge variant="secondary">Scan order</Badge><div className="mt-1 text-xs text-muted-foreground">{formatMoney(order.scanPrice ?? 0)}</div></div>
                        )}
                      </TableCell>
                      <TableCell>{displayWorker ? <div><div className="font-semibold">{displayWorker.displayName}</div><div className="text-xs text-muted-foreground">@{displayWorker.username}{isHistoryWorker ? " · Previous worker" : ""}</div></div> : <span className="text-muted-foreground">Not accepted</span>}</TableCell>
                      <TableCell><div className="text-sm">{formatDateTime(order.createdAt)}</div><div className="text-xs text-muted-foreground">Updated {formatDateTime(order.updatedAt)}</div></TableCell>
                      <TableCell className="max-w-[260px] truncate">{order.problemReason || order.customerNote || "-"}</TableCell>
                    </TableRow>
                  );
                })}
                {filteredOrders.length === 0 && <TableRow><TableCell colSpan={6} className="h-40 text-center text-muted-foreground">No orders</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={pagination} loading={loading} onPageChange={setPage} className="mt-4" />
        </CardContent>
      </Card>
    </AppFrame>
  );
}

export function AdminWorkersClient() {
  type WorkerAdminSection = "workers" | "withdrawals";
  const [workers, setWorkers] = useState<AdminWorker[]>([]);
  const [withdrawals, setWithdrawals] = useState<PublicWorkerWithdrawalRequest[]>([]);
  const [activeSection, setActiveSection] = useState<WorkerAdminSection>("workers");
  const [workerSearch, setWorkerSearch] = useState("");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const deferredWorkerSearch = useDeferredValue(workerSearch);
  const deferredWithdrawalSearch = useDeferredValue(withdrawalSearch);
  const [workerPage, setWorkerPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [workerPagination, setWorkerPagination] = useState<AdminPaginationMeta | null>(null);
  const [withdrawalPagination, setWithdrawalPagination] = useState<AdminPaginationMeta | null>(null);
  const [workerPriceDrafts, setWorkerPriceDrafts] = useState<Record<string, string>>({});
  const [workerUsername, setWorkerUsername] = useState("worker");
  const [workerName, setWorkerName] = useState("Worker");
  const [workerUnitPrice, setWorkerUnitPrice] = useState("0.70");
  const [workerPayoutMode, setNewWorkerPayoutMode] = useState<"POSTPAID" | "PREPAID">("POSTPAID");
  const [workerBinanceUserId, setWorkerBinanceUserId] = useState("");
  const [workerTelegramId, setWorkerTelegramId] = useState("");
  const [workerTelegramUsername, setWorkerTelegramUsername] = useState("");
  const [createWorkerOpen, setCreateWorkerOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      const [nextWorkers, nextWithdrawals] = await Promise.all([
        apiFetch<AdminPaginatedResponse<AdminWorker>>(pagedAdminUrl("/api/admin/workers", { page: workerPage, search: deferredWorkerSearch })),
        apiFetch<AdminPaginatedResponse<PublicWorkerWithdrawalRequest>>(pagedAdminUrl("/api/admin/withdrawals", { page: withdrawalPage, search: deferredWithdrawalSearch })),
      ]);
      setWorkers(nextWorkers.items);
      setWithdrawals(nextWithdrawals.items);
      setWorkerPagination(nextWorkers.pagination);
      setWithdrawalPagination(nextWithdrawals.pagination);
      if (!silent) toast.success("Worker accounts refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Refresh failed");
    }
  }, [deferredWithdrawalSearch, deferredWorkerSearch, withdrawalPage, workerPage]);

  async function createWorker(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      setLoading(true);
      const worker = await apiFetch<AdminWorker>("/api/admin/workers", { method: "POST", body: JSON.stringify({ username: workerUsername, displayName: workerName, unitPrice: workerUnitPrice, payoutMode: workerPayoutMode, binanceUserId: workerBinanceUserId, telegramUserId: workerTelegramId, telegramUsername: workerTelegramUsername }) });
      setWorkers((current) => [worker, ...current].slice(0, ADMIN_PAGE_SIZE));
      setWorkerPage(1);
      setCreateWorkerOpen(false);
      toast.success("Worker account created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create worker account");
    } finally {
      setLoading(false);
    }
  }

  async function settleWorker(worker: AdminWorker) {
    if ((worker.unsettledCompleted ?? 0) <= 0) {
      toast.info("This worker has no unsettled orders");
      return;
    }
    try {
      setLoading(true);
      const result = await apiFetch<{ settledCount: number; settledAmount: number }>("/api/admin/workers/" + worker.id + "/settle", { method: "POST" });
      toast.success("Settled " + result.settledCount + " order(s), amount " + formatMoney(result.settledAmount));
      setWorkers((current) => current.map((item) => item.id === worker.id
        ? {
            ...item,
            unsettledCompleted: Math.max(0, (item.unsettledCompleted ?? 0) - result.settledCount),
            unsettledAmount: Math.max(0, (item.unsettledAmount ?? 0) - result.settledAmount),
            settledCompleted: (item.settledCompleted ?? 0) + result.settledCount,
            settledAmount: (item.settledAmount ?? 0) + result.settledAmount,
          }
        : item));
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settlement failed");
    } finally {
      setLoading(false);
    }
  }

  async function offlineWorker(worker: AdminWorker) {
    if (worker.status !== "ONLINE") {
      toast.info("This worker is already offline");
      return;
    }
    if (worker.activeOrder) {
      toast.error(`Worker has active order ${worker.activeOrder.orderNo}. Complete or return it before going offline.`);
      return;
    }
    try {
      setLoading(true);
      await apiFetch<PublicWorker>("/api/admin/workers/" + worker.id + "/offline", { method: "POST" });
      toast.success(`${worker.displayName} is now offline with auto-accept disabled`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to go offline");
    } finally {
      setLoading(false);
    }
  }

  async function disableWorkerAutoAccept(worker: AdminWorker) {
    if (!worker.autoAcceptEnabled) {
      toast.info("This worker auto-accept is already off");
      return;
    }
    try {
      setLoading(true);
      await apiFetch<PublicWorker>("/api/admin/workers/" + worker.id + "/auto-accept", {
        method: "POST",
        body: JSON.stringify({ enabled: false }),
      });
      toast.success(`Disabled auto-accept for ${worker.displayName}`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to disable auto-accept");
    } finally {
      setLoading(false);
    }
  }

  async function updateWorkerUnitPrice(worker: AdminWorker) {
    const unitPrice = workerPriceDrafts[worker.id] ?? String(worker.unitPrice ?? 0);
    try {
      setLoading(true);
      await apiFetch<PublicWorker>("/api/admin/workers/" + worker.id + "/unit-price", {
        method: "POST",
        body: JSON.stringify({ unitPrice }),
      });
      toast.success(`${worker.displayName} unit price updated to ${formatMoney(unitPrice)}`);
      setWorkerPriceDrafts((current) => {
        const next = { ...current };
        delete next[worker.id];
        return next;
      });
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update unit price");
    } finally {
      setLoading(false);
    }
  }

  async function setWorkerDisabled(worker: AdminWorker, disabled: boolean) {
    try {
      setLoading(true);
      await apiFetch<PublicWorker>("/api/admin/workers/" + worker.id + "/disabled", {
        method: "POST",
        body: JSON.stringify({ disabled }),
      });
      toast.success(disabled ? `${worker.displayName} disabled` : `${worker.displayName} enabled`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (disabled ? "Failed to disable account" : "Failed to enable account"));
    } finally {
      setLoading(false);
    }
  }

  async function setWorkerPayoutMode(worker: AdminWorker, payoutMode: "POSTPAID" | "PREPAID") {
    try {
      setLoading(true);
      await apiFetch<PublicWorker>("/api/admin/workers/" + worker.id + "/payout-mode", {
        method: "POST",
        body: JSON.stringify({ payoutMode }),
      });
      toast.success(`${worker.displayName} switched to ${payoutMode === "PREPAID" ? "prepaid" : "postpaid"} mode`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to switch payout mode");
    } finally {
      setLoading(false);
    }
  }

  async function advanceWorker(worker: AdminWorker) {
    const amount = window.prompt(`Record advance amount (USD) for ${worker.displayName}`, "10.00");
    if (!amount) return;
    try {
      setLoading(true);
      await apiFetch<WorkerWalletSummary>("/api/admin/workers/" + worker.id + "/advance", {
        method: "POST",
        body: JSON.stringify({ amount, note: "Admin advance" }),
      });
      toast.success(`Recorded advance ${formatMoney(amount)} for ${worker.displayName}`);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to record advance");
    } finally {
      setLoading(false);
    }
  }

  async function markWithdrawalPaid(request: PublicWorkerWithdrawalRequest) {
    try {
      setLoading(true);
      await apiFetch<PublicWorkerWithdrawalRequest>("/api/admin/withdrawals/" + request.id + "/paid", { method: "POST" });
      toast.success("Withdrawal marked as paid");
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process withdrawal");
    } finally {
      setLoading(false);
    }
  }

  async function rejectWithdrawal(request: PublicWorkerWithdrawalRequest) {
    const adminNote = window.prompt("Rejection reason", request.adminNote || "");
    if (adminNote === null) return;
    try {
      setLoading(true);
      await apiFetch<PublicWorkerWithdrawalRequest>("/api/admin/withdrawals/" + request.id + "/reject", {
        method: "POST",
        body: JSON.stringify({ adminNote }),
      });
      toast.success("Withdrawal rejected");
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to reject withdrawal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const onlineWorkers = workers.filter((worker) => worker.status === "ONLINE").length;
  const pendingWithdrawals = withdrawals.filter((request) => request.status === "PENDING");
  const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, request) => sum + request.amount, 0);

  return (
    <AppFrame audience="admin" title="Worker Accounts" subtitle="Create Telegram workers, set unit prices, and settle completed orders." onRefresh={() => refresh()}>
      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card className="rounded-3xl bg-background shadow-sm">
          <CardHeader>
            <CardTitle>Worker Accounts / Online Workers</CardTitle>
            <CardDescription>Total accounts and current online count displayed together.</CardDescription>
            <CardAction>
              <Button size="sm" onClick={() => setCreateWorkerOpen(true)}>
                <UserPlusIcon data-icon="inline-start" />
                Create Worker Account
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-muted/40 p-4"><div className="text-sm text-muted-foreground">Workers</div><div className="mt-2 text-4xl font-semibold tracking-tight">{workerPagination?.total ?? workers.length}</div></div>
              <div className="rounded-2xl bg-muted/40 p-4"><div className="text-sm text-muted-foreground">Online Workers</div><div className="mt-2 text-4xl font-semibold tracking-tight">{onlineWorkers}</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Sheet open={createWorkerOpen} onOpenChange={setCreateWorkerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Create Worker Account</SheetTitle>
            <SheetDescription>Password login is disabled. Workers sign in via Telegram Bot only.</SheetDescription>
          </SheetHeader>
          <form onSubmit={createWorker} className="flex flex-col gap-5">
            <FieldGroup>
              <Field><FieldLabel htmlFor="worker-username">Username</FieldLabel><Input id="worker-username" value={workerUsername} onChange={(event) => setWorkerUsername(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor="worker-name">Display Name</FieldLabel><Input id="worker-name" value={workerName} onChange={(event) => setWorkerName(event.target.value)} /></Field>
              <Field><FieldLabel htmlFor="worker-unit-price">Unit Price (USD/order)</FieldLabel><Input id="worker-unit-price" inputMode="decimal" value={workerUnitPrice} onChange={(event) => setWorkerUnitPrice(event.target.value)} placeholder="0.70" /><FieldDescription>The unit price at order completion is recorded. Future price changes do not affect history.</FieldDescription></Field>
              <Field>
                <FieldLabel htmlFor="worker-binance">Binance User ID</FieldLabel>
                <Input id="worker-binance" value={workerBinanceUserId} onChange={(event) => setWorkerBinanceUserId(event.target.value)} placeholder="Leave empty; worker will be prompted to bind on login" />
              </Field>
              <Field>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/30 p-3">
                  <div>
                    <FieldLabel>Prepaid Mode</FieldLabel>
                    <FieldDescription>When enabled, advance payments can be recorded. Wallet balance starts negative and is offset by completed orders.</FieldDescription>
                  </div>
                  <Switch checked={workerPayoutMode === "PREPAID"} onCheckedChange={(checked) => setNewWorkerPayoutMode(checked ? "PREPAID" : "POSTPAID")} />
                </div>
              </Field>
              <Field><FieldLabel htmlFor="worker-telegram-id">Telegram ID</FieldLabel><Input id="worker-telegram-id" value={workerTelegramId} onChange={(event) => setWorkerTelegramId(event.target.value)} placeholder="e.g. 1000000000, optional" /></Field>
              <Field><FieldLabel htmlFor="worker-telegram-username">Telegram Username</FieldLabel><Input id="worker-telegram-username" value={workerTelegramUsername} onChange={(event) => setWorkerTelegramUsername(event.target.value)} placeholder="@username, optional" /><FieldDescription>At least one of Telegram ID or username is required for Bot login.</FieldDescription></Field>
            </FieldGroup>
            <Button type="submit" disabled={loading}><UserPlusIcon data-icon="inline-start" />Create Account</Button>
          </form>
        </SheetContent>
      </Sheet>

      <Tabs
        value={activeSection}
        onValueChange={(value) => setActiveSection(value as WorkerAdminSection)}
        className="gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="flex w-full flex-wrap justify-start rounded-2xl p-1 sm:w-auto">
            <TabsTrigger value="workers" className="min-w-32">
              Workers {workerPagination?.total ?? workers.length}
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="min-w-32">
              Withdrawals {withdrawalPagination?.total ?? withdrawals.length}
            </TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
            <RefreshCwIcon data-icon="inline-start" />
            Refresh
          </Button>
        </div>

        <TabsContent value="workers">
        <Card className="rounded-3xl bg-background shadow-sm">
          <CardHeader><CardTitle>Worker Account List</CardTitle><CardDescription>View unit price, online status, completed amounts, and settle unsettled orders.</CardDescription></CardHeader>
          <CardContent>
            <div className="mb-3 flex items-center gap-2">
              <SearchIcon className="size-4 text-muted-foreground" />
              <Input value={workerSearch} onChange={(event) => { setWorkerSearch(event.target.value); setWorkerPage(1); }} placeholder="Search account / Telegram / Binance UID" />
            </div>
            <div className="overflow-hidden rounded-3xl border border-border">
              <Table><TableHeader><TableRow><TableHead>Account</TableHead><TableHead>Telegram</TableHead><TableHead>Unit Price</TableHead><TableHead>Mode</TableHead><TableHead>Wallet</TableHead><TableHead>Status</TableHead><TableHead>Auto Accept</TableHead><TableHead>Completed/Records</TableHead><TableHead>Unsettled</TableHead><TableHead>Settled</TableHead><TableHead>Last Seen</TableHead><TableHead className="text-right">Action</TableHead></TableRow></TableHeader>
                <TableBody>
                  {workers.map((worker) => (
                    <TableRow key={worker.id}>
                      <TableCell>
                        <div className="font-semibold">{worker.displayName}</div>
                        <div className="text-xs text-muted-foreground">@{worker.username}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{worker.telegramUserId || "-"}</div>
                        <div className="text-xs text-muted-foreground">{worker.telegramUsername ? "@" + worker.telegramUsername : "Not bound"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-32 items-center gap-2">
                          <Input
                            className="h-8 w-24"
                            inputMode="decimal"
                            value={workerPriceDrafts[worker.id] ?? Number(worker.unitPrice ?? 0).toFixed(2)}
                            onChange={(event) => setWorkerPriceDrafts((current) => ({ ...current, [worker.id]: event.target.value }))}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updateWorkerUnitPrice(worker)}
                            disabled={loading || (workerPriceDrafts[worker.id] ?? Number(worker.unitPrice ?? 0).toFixed(2)) === Number(worker.unitPrice ?? 0).toFixed(2)}
                          >
                            Save
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <Badge variant={worker.payoutMode === "PREPAID" ? "secondary" : "outline"}>{worker.payoutMode === "PREPAID" ? "Prepaid" : "Postpaid"}</Badge>
                          <button className="text-left text-xs text-muted-foreground underline" onClick={() => setWorkerPayoutMode(worker, worker.payoutMode === "PREPAID" ? "POSTPAID" : "PREPAID")} disabled={loading}>
                            Switch
                          </button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold">{formatBalance(worker.wallet?.balance)}</div>
                        <div className="text-xs text-muted-foreground">Withdrawable {formatBalance(worker.wallet?.availableBalance)}</div>
                        <div className="text-xs text-muted-foreground">Binance: {worker.binanceUserId || "Not bound"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <WorkerStatusBadge status={worker.status} />
                          {worker.isDisabled && <Badge variant="destructive">Disabled</Badge>}
                        </div>
                        {worker.activeOrder && <div className="mt-1 text-xs text-muted-foreground">Active: {worker.activeOrder.orderNo}</div>}
                      </TableCell>
                      <TableCell>{worker.autoAcceptEnabled ? "On" : "Off"}</TableCell>
                      <TableCell>{worker.completedCount ?? 0} / {worker._count?.records ?? 0}</TableCell>
                      <TableCell><div className="font-semibold">{formatMoney(worker.unsettledAmount)}</div><div className="text-xs text-muted-foreground">{worker.unsettledCompleted ?? 0} orders</div></TableCell>
                      <TableCell><div>{formatMoney(worker.settledAmount)}</div><div className="text-xs text-muted-foreground">{worker.settledCompleted ?? 0} orders</div></TableCell>
                      <TableCell>{formatDateTime(worker.lastSeenAt)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => disableWorkerAutoAccept(worker)} disabled={loading || !worker.autoAcceptEnabled}>Disable Auto</Button>
                          <Button variant="outline" size="sm" onClick={() => offlineWorker(worker)} disabled={loading || worker.status !== "ONLINE" || Boolean(worker.activeOrder)} title={worker.activeOrder ? "Has active order, cannot go offline" : undefined}>Offline</Button>
                          <Button
                            variant={worker.isDisabled ? "outline" : "destructive"}
                            size="sm"
                            onClick={() => setWorkerDisabled(worker, !worker.isDisabled)}
                            disabled={loading || Boolean(worker.activeOrder)}
                            title={worker.activeOrder ? "Has active order, cannot disable" : undefined}
                          >
                            {worker.isDisabled ? "Enable" : "Disable"}
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => advanceWorker(worker)} disabled={loading}>Advance</Button>
                          <Button variant="outline" size="sm" onClick={() => settleWorker(worker)} disabled={loading || worker.payoutMode === "PREPAID" || (worker.unsettledCompleted ?? 0) <= 0} title={worker.payoutMode === "PREPAID" ? "Prepaid mode auto-offsets via negative wallet balance; legacy settlement not used" : undefined}>Settle</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {workers.length === 0 && <TableRow><TableCell colSpan={12} className="h-28 text-center text-muted-foreground">No worker accounts</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <AdminListPagination pagination={workerPagination} loading={loading} onPageChange={setWorkerPage} className="mt-4" />
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
      <Card className="rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WalletIcon className="size-5 text-muted-foreground" />Withdrawal Requests</CardTitle>
          <CardDescription>
            Pending on this page: {pendingWithdrawals.length} / {formatBalance(pendingWithdrawalAmount)}. Marking paid writes to wallet ledger and deducts balance; rejecting does not deduct.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <SearchIcon className="size-4 text-muted-foreground" />
            <Input value={withdrawalSearch} onChange={(event) => { setWithdrawalSearch(event.target.value); setWithdrawalPage(1); }} placeholder="Search worker / Binance UID / notes" />
          </div>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Worker</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Binance UID</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead>Processed</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="font-semibold">{request.worker?.displayName || request.workerId}</div>
                      <div className="text-xs text-muted-foreground">@{request.worker?.username || "-"}</div>
                    </TableCell>
                    <TableCell className="font-semibold">{formatBalance(request.amount)}</TableCell>
                    <TableCell>
                      <div className="font-mono text-xs">{request.binanceUserIdSnapshot}</div>
                      {request.worker?.binanceUserId && request.worker.binanceUserId !== request.binanceUserIdSnapshot ? (
                        <div className="mt-1 text-xs text-warning">Current UID: {request.worker.binanceUserId}</div>
                      ) : null}
                    </TableCell>
                    <TableCell><Badge variant={withdrawalStatusBadgeVariant(request.status)}>{withdrawalStatusText(request.status)}</Badge></TableCell>
                    <TableCell>{formatDateTime(request.requestedAt)}</TableCell>
                    <TableCell>{formatDateTime(request.processedAt)}</TableCell>
                    <TableCell className="max-w-[280px]">
                      <div className="truncate text-sm">{request.note || "-"}</div>
                      {request.adminNote ? <div className="mt-1 truncate text-xs text-muted-foreground">Admin: {request.adminNote}</div> : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        <Button variant="outline" size="sm" onClick={() => markWithdrawalPaid(request)} disabled={loading || request.status !== "PENDING"}>Paid</Button>
                        <Button variant="outline" size="sm" onClick={() => rejectWithdrawal(request)} disabled={loading || request.status !== "PENDING"}>Reject</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {withdrawals.length === 0 && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground">No withdrawal requests</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={withdrawalPagination} loading={loading} onPageChange={setWithdrawalPage} className="mt-4" />
        </CardContent>
      </Card>
        </TabsContent>
      </Tabs>
    </AppFrame>
  );
}


export function AdminProxiesClient() {
  const [proxyPool, setProxyPool] = useState<"public" | "premium">("public");
  const [proxies, setProxies] = useState<PublicUpstreamProxy[]>([]);
  const [proxyListText, setProxyListText] = useState("");
  const [newProxyUrl, setNewProxyUrl] = useState("");
  const [expectedCountry, setExpectedCountry] = useState("JP");
  const [selection, setSelection] = useState<PublicProxySelection | null>(null);
  const [proxySearch, setProxySearch] = useState("");
  const deferredProxySearch = useDeferredValue(proxySearch);
  const [proxyPage, setProxyPage] = useState(1);
  const [proxyPagination, setProxyPagination] = useState<AdminPaginationMeta | null>(null);
  const [checkResult, setCheckResult] = useState<PublicProxyCheckSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkingProxyId, setCheckingProxyId] = useState<string | null>(null);

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const data = await apiFetch<{ pool: "public" | "premium"; proxies: PublicUpstreamProxy[]; editableProxyList: string[]; total: number; expectedCountry: string; hasList: boolean; selection: PublicProxySelection; pagination?: AdminPaginationMeta }>(pagedAdminUrl("/api/admin/proxies", {
        page: proxyPage,
        search: deferredProxySearch,
        pageSize: 20,
        extra: { pool: proxyPool },
      }));
      setProxies(data.proxies);
      setProxyPagination(data.pagination || null);
      setProxyListText((data.editableProxyList || []).join("\n"));
      setExpectedCountry(data.expectedCountry || "JP");
      setSelection(data.selection);
      if (!silent) toast.success("Proxy list refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to refresh proxy list");
    } finally {
      setLoading(false);
    }
  }, [deferredProxySearch, proxyPage, proxyPool]);

  function mergeProxyCheckSummary(current: PublicProxyCheckSummary | null, next: PublicProxyCheckSummary): PublicProxyCheckSummary {
    if (!current) return next;
    const merged = new Map(current.results.map((result) => [result.index, result]));
    for (const result of next.results) merged.set(result.index, result);
    const results = Array.from(merged.values()).sort((left, right) => left.index - right.index);
    const ok = results.filter((result) => result.ok).length;
    return {
      checkedAt: next.checkedAt,
      total: results.length,
      ok,
      failed: results.length - ok,
      expectedCountry: next.expectedCountry || current.expectedCountry,
      results,
    };
  }

  async function checkProxies() {
    try {
      setChecking(true);
      const result = await apiFetch<PublicProxyCheckSummary>("/api/admin/proxies/check", {
        method: "POST",
        body: JSON.stringify({ pool: proxyPool }),
      });
      setCheckResult(result);
      if (result.failed > 0) toast.warning(`Proxy check done: ${result.ok}/${result.total} available`);
      else toast.success(`Proxy check done: ${result.ok}/${result.total} available`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Proxy check failed");
    } finally {
      setChecking(false);
    }
  }

  async function checkProxy(proxy: PublicUpstreamProxy) {
    try {
      setCheckingProxyId(proxy.id);
      const result = await apiFetch<PublicProxyCheckSummary>("/api/admin/proxies/check", {
        method: "POST",
        body: JSON.stringify({ pool: proxyPool, proxyId: proxy.id }),
      });
      setCheckResult((current) => mergeProxyCheckSummary(current, result));
      const first = result.results[0];
      if (first?.ok) toast.success(`Proxy #${proxy.index + 1} is available`);
      else toast.warning(`Proxy #${proxy.index + 1} has issues`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Proxy check failed");
    } finally {
      setCheckingProxyId(null);
    }
  }

  async function saveProxySelection(selectedProxyId: string) {
    try {
      setLoading(true);
      const data = await apiFetch<{ pool: "public" | "premium"; proxies: PublicUpstreamProxy[]; editableProxyList: string[]; total: number; expectedCountry: string; hasList: boolean; selection: PublicProxySelection }>("/api/admin/proxies", {
        method: "POST",
        body: JSON.stringify({ selectedProxyId, pool: proxyPool }),
      });
      setProxies(data.proxies);
      setProxyListText((data.editableProxyList || []).join("\n"));
      setExpectedCountry(data.expectedCountry || "JP");
      setSelection(data.selection);
      toast.success(data.selection.mode === "AUTO" ? "Switched to auto-rotation" : "Current proxy switched");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save proxy selection");
    } finally {
      setLoading(false);
    }
  }

  async function mutateProxyPool(action: "add" | "delete" | "replace", payload: Record<string, unknown>, successMessage: string) {
    try {
      setLoading(true);
      const data = await apiFetch<{ pool: "public" | "premium"; proxies: PublicUpstreamProxy[]; editableProxyList: string[]; total: number; expectedCountry: string; hasList: boolean; selection: PublicProxySelection }>("/api/admin/proxies", {
        method: "POST",
        body: JSON.stringify({ action, pool: proxyPool, ...payload }),
      });
      setProxies(data.proxies);
      setProxyListText((data.editableProxyList || []).join("\n"));
      setExpectedCountry(data.expectedCountry || "JP");
      setSelection(data.selection);
      setCheckResult(null);
      if (action === "add") setNewProxyUrl("");
      toast.success(successMessage);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save proxy pool");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const selectProxyPool = useCallback((pool: "public" | "premium") => {
    setProxyPool(pool);
    setProxyPage(1);
    setCheckResult(null);
  }, []);

  const resultsByIndex = useMemo(() => new Map(checkResult?.results.map((result) => [result.index, result]) || []), [checkResult]);
  const okCount = checkResult?.ok ?? 0;
  const failedCount = checkResult?.failed ?? 0;
  const selectedProxy = selection?.selectedProxyId ? proxies.find((proxy) => proxy.id === selection.selectedProxyId) : null;
  const selectionLabel = selection?.mode === "MANUAL" && selectedProxy ? `#${selectedProxy.index + 1}` : "Auto Rotation";

  return (
    <AppFrame audience="admin" title="Proxy List" subtitle="Public and Premium extraction use separate proxy pools, each with independent detection and selection." onRefresh={() => refresh()}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => refresh()} disabled={loading}><RefreshCwIcon data-icon="inline-start" />Refresh List</Button>
          <Button variant={selection?.mode === "AUTO" ? "default" : "outline"} onClick={() => saveProxySelection("AUTO")} disabled={loading}>Auto Rotation</Button>
          <Button onClick={checkProxies} disabled={checking || proxies.length === 0}><ActivityIcon data-icon="inline-start" />{checking ? "Checking..." : "Check Proxies"}</Button>
        </div>
      </div>

      <Card className="mb-4 rounded-3xl bg-background shadow-sm">
        <CardContent className="pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="font-semibold">Proxy Pool</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Viewing: {proxyPool === "premium" ? "Premium extraction proxy pool" : "Public extraction proxy pool"}. Pool selections are independent.
              </p>
            </div>
            <div className="flex rounded-full border border-border bg-muted/50 p-1 text-sm">
              <button
                type="button"
                onClick={() => selectProxyPool("public")}
                className={cn("rounded-full px-4 py-1.5 font-medium transition", proxyPool === "public" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Public Pool
              </button>
              <button
                type="button"
                onClick={() => selectProxyPool("premium")}
                className={cn("rounded-full px-4 py-1.5 font-medium transition", proxyPool === "premium" ? "bg-brand text-white shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                Premium Pool
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Edit Proxy Pool</CardTitle>
          <CardDescription>
            Changes are saved to the database immediately. After add/delete/bulk save, the current proxy auto-switches to rotation to avoid index mismatch.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
          <div className="rounded-3xl border border-border p-4">
            <div className="font-semibold">Add Single Proxy</div>
            <p className="mt-1 text-sm text-muted-foreground">Supports socks5://, http://, https://. No protocol defaults to socks5://.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={newProxyUrl}
                onChange={(event) => setNewProxyUrl(event.target.value)}
                placeholder="socks5://user:password@127.0.0.1:24015"
                className="font-mono text-xs"
                disabled={loading}
              />
              <Button
                type="button"
                onClick={() => mutateProxyPool("add", { proxyUrl: newProxyUrl }, "Proxy added")}
                disabled={loading || !newProxyUrl.trim()}
              >
                <PlusIcon data-icon="inline-start" />Add
              </Button>
            </div>
          </div>

          <div className="rounded-3xl border border-border p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="font-semibold">Bulk Edit</div>
                <p className="mt-1 text-sm text-muted-foreground">One proxy per line. Saving replaces the current pool.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => mutateProxyPool("replace", { proxyList: proxyListText }, "Proxy pool saved")}                disabled={loading}
              >
                <SaveIcon data-icon="inline-start" />Save
              </Button>
            </div>
            <Textarea
              value={proxyListText}
              onChange={(event) => setProxyListText(event.target.value)}
              className="mt-3 h-40 min-h-40 resize-y font-mono text-xs"
              placeholder="socks5://user:password@127.0.0.1:24015"
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard title="Proxy Count" value={proxyPagination?.total ?? proxies.length} description={proxyPool === "premium" ? "From PREMIUM_UPSTREAM_PROXY_LIST / PREMIUM_UPI_PROXY_LIST / PREMIUM_UPSTREAM_PROXY" : "From UPSTREAM_PROXY_LIST / UPI_PROXY_LIST / UPSTREAM_PROXY"} icon={Globe2Icon} tone="brand" />
        <MetricCard title="Current Strategy" value={selectionLabel} description={selection?.mode === "MANUAL" && selectedProxy ? selectedProxy.redactedUrl : "Rotates through list on each generation; failures auto-try other proxies"} icon={ShieldCheckIcon} tone="info" />
        <MetricCard title="Available" value={checkResult ? okCount : "-"} description={`Expected exit country: ${expectedCountry}`} icon={CheckCircle2Icon} tone="success" />
        <MetricCard title="Failed" value={checkResult ? failedCount : "-"} description={checkResult ? `Check time: ${formatDateTime(checkResult.checkedAt)}` : "Shown after running proxy check"} icon={XCircleIcon} tone="warning" />
      </div>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>{proxyPool === "premium" ? "Premium Extraction Proxies" : "Public Extraction Proxies"}</CardTitle>
          <CardDescription>Checks verify exit IP, country, and basic connectivity to ChatGPT / Stripe / Telegram. Proxy passwords are not shown.</CardDescription>
          <CardAction>{checkResult ? `${okCount} / ${checkResult.total}` : `${proxies.length} proxies`}</CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <SearchIcon className="size-4 text-muted-foreground" />
            <Input value={proxySearch} onChange={(event) => { setProxySearch(event.target.value); setProxyPage(1); }} placeholder="Search proxy address / source / tag" />
          </div>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Proxy</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Check</TableHead>
                   <TableHead>Action</TableHead>
                  <TableHead>Exit</TableHead>
                  <TableHead>Connectivity</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {proxies.map((proxy) => {
                  const result = resultsByIndex.get(proxy.index);
                  return (
                    <TableRow key={proxy.id}>
                      <TableCell>{proxy.index + 1}</TableCell>
                      <TableCell>
                        <div className="max-w-[360px] truncate font-mono text-xs">{proxy.redactedUrl}</div>
                        <div className="text-xs text-muted-foreground">{proxy.scheme} / {proxy.host}:{proxy.port || "-"}</div>
                      </TableCell>
                      <TableCell><Badge variant="secondary">{proxy.source}</Badge></TableCell>
                      <TableCell>
                        {result ? (
                          <Badge variant={result.ok ? "default" : "destructive"}>
                            {result.ok ? <CheckCircle2Icon data-icon="inline-start" /> : <XCircleIcon data-icon="inline-start" />}
                            {result.ok ? "OK" : "Error"}
                          </Badge>
                        ) : <span className="text-muted-foreground">Not checked</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={selection?.selectedProxyId === proxy.id ? "default" : "outline"}
                            size="sm"
                            onClick={() => saveProxySelection(proxy.id)}
                            disabled={loading}
                          >
                            {selection?.selectedProxyId === proxy.id ? "Current" : "Set current"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => checkProxy(proxy)}
                            disabled={loading || checking || checkingProxyId === proxy.id}
                          >
                            {checkingProxyId === proxy.id ? <Loader2Icon data-icon="inline-start" className="animate-spin" /> : <SearchIcon data-icon="inline-start" />}
                            {checkingProxyId === proxy.id ? "Checking..." : "Check"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => mutateProxyPool("delete", { proxyId: proxy.id }, "Proxy deleted")}
                            disabled={loading}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2Icon data-icon="inline-start" />Delete
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {result ? (
                          <div>
                            <div className="font-mono text-xs">{result.ip || "-"}</div>
                            <div className="text-xs text-muted-foreground">{result.country || result.countryCode || "-"}{result.city ? ` / ${result.city}` : ""}</div>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {result ? (
                          <div className="text-xs">
                            <div>ChatGPT: {result.chatgptStatus ?? "-"}</div>
                            <div>Stripe: {result.stripeStatus ?? "-"}</div>
                            <div>TG: {result.telegramStatus ?? "-"}</div>
                          </div>
                        ) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>{result ? `${result.latencyMs}ms` : "-"}</TableCell>
                      <TableCell className="max-w-[280px]">
                        {result?.error ? <div className="truncate text-sm text-destructive">{result.error}</div> : null}
                        {result?.warnings?.length ? <div className="truncate text-xs text-muted-foreground">{result.warnings.join("；")}</div> : null}
                        {!result?.error && !result?.warnings?.length ? <span className="text-muted-foreground">-</span> : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {proxies.length === 0 && <TableRow><TableCell colSpan={9} className="h-32 text-center text-muted-foreground">No proxies configured. Set the environment variable {proxyPool === "premium" ? "PREMIUM_UPSTREAM_PROXY_LIST" : "UPSTREAM_PROXY_LIST"}。</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={proxyPagination} loading={loading} onPageChange={setProxyPage} className="mt-4" />
        </CardContent>
      </Card>
    </AppFrame>
  );
}

function withdrawalStatusText(status: PublicWorkerWithdrawalRequest["status"]) {
  if (status === "PENDING") return "Pending";
  if (status === "PAID") return "Paid";
  if (status === "REJECTED") return "Rejected";
  return "Cancelled";
}

function withdrawalStatusBadgeVariant(status: PublicWorkerWithdrawalRequest["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PENDING") return "secondary";
  if (status === "PAID") return "default";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

function formatOrderQrRemaining(expiresAt: string | null | undefined, now: number) {
  if (!expiresAt) return "";
  const expiresAtMs = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs)) return "";
  const remainingMs = expiresAtMs - now;
  if (remainingMs <= 0) return "Expired";
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatBalance(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0.00";
  const prefix = amount < 0 ? "-" : "";
  return `${prefix}$${Math.abs(amount).toFixed(2)}`;
}

function AdminNavCard({ title, description, href, icon: Icon }: { title: string; description: string; href: string; icon: NavIcon }) {
  return <Link href={href} className="rounded-3xl border border-border bg-muted/30 p-5 transition hover:bg-muted/60"><div className="flex items-center gap-3"><div className="grid size-11 place-items-center rounded-2xl bg-background text-muted-foreground shadow-sm"><Icon className="size-5" /></div><div><div className="font-semibold">{title}</div><p className="mt-1 text-sm text-muted-foreground">{description}</p></div></div></Link>;
}

export const AdminClient = AdminDashboardClient;

