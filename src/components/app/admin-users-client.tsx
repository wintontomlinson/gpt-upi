"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { CheckCircle2Icon, CrownIcon, SearchIcon, UsersRoundIcon, WalletIcon, XCircleIcon } from "lucide-react";
import { toast } from "sonner";
import { AppFrame } from "@/components/app/app-frame";
import { AdminListPagination } from "@/components/app/admin-list-pagination";
import { MetricCard } from "@/components/app/metric-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, formatDateTime } from "@/lib/api-client";
import type { AdminPaginatedResponse, AdminPaginationMeta } from "@/lib/types/app";

type AdminPublicUser = {
  id: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  hasWallet?: boolean;
  isPremium?: boolean;
  premiumEnabled?: boolean;
  premiumUntil?: string | null;
  premiumSource?: "manual" | "default" | "none";
  premiumTier?: "premium" | "premium_og" | "none";
  premiumExpired?: boolean;
  depositRiskSigned?: boolean;
  depositRiskSignedAt?: string | null;
  availableBalance: number;
  frozenBalance: number;
  totalDeposited: number;
  totalSpent: number;
  withdrawalCount: number;
  pendingWithdrawalCount: number;
  pendingWithdrawalAmount: number;
  ledgerCount: number;
  extractCount: number;
  scanOrderCount: number;
  createdAt: string;
  updatedAt: string;
};

type AdminPublicUsersResponse = {
  users: AdminPublicUser[];
  pagination?: AdminPaginationMeta;
  summary: {
    userCount: number;
    walletCount?: number;
    availableBalance: number;
    frozenBalance: number;
    totalDeposited: number;
    totalSpent: number;
  };
};

const ADMIN_PAGE_SIZE = 20;

function pagedAdminUrl(path: string, input: { page: number; search?: string; pageSize?: number }) {
  const params = new URLSearchParams();
  params.set("paged", "1");
  params.set("page", String(input.page));
  params.set("pageSize", String(input.pageSize ?? ADMIN_PAGE_SIZE));
  if (input.search?.trim()) params.set("search", input.search.trim());
  return `${path}?${params.toString()}`;
}

type PublicSiteSettings = {
  tgInviteEnabled: boolean;
  tgInviteUrl: string;
  depositEnabled: boolean;
  withdrawEnabled: boolean;
  premiumSaleEnabled: boolean;
  premiumPurchasePrice: number;
  faqContent: string;
  faqContentEn: string;
  extractMethodSelectionEnabled: boolean;
  customProxyEnabled: boolean;
};

type PublicUserWithdrawalStatus = "PENDING" | "PAID" | "REJECTED" | "CANCELLED";

type AdminPublicWithdrawalRequest = {
  id: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  amount: number;
  fee: number;
  totalFrozen: number;
  status: PublicUserWithdrawalStatus;
  chain: string;
  tokenSymbol: string;
  withdrawalAddress: string;
  note?: string | null;
  adminNote?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  processedBy?: string | null;
  createdAt: string;
  updatedAt: string;
  wallet?: {
    availableBalance: number;
    frozenBalance: number;
    totalDeposited: number;
    totalSpent: number;
  } | null;
};

function formatUsdt(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0.000000 USDT";
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`;
}

function shortAddress(value?: string | null) {
  if (!value) return "-";
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-8)}`;
}

function formatPremiumUntil(value?: string | null) {
  if (!value) return "Permanent";
  return formatDateTime(value);
}

function premiumTierLabel(tier?: AdminPublicUser["premiumTier"]) {
  return tier === "premium_og" ? "Premium OG" : "Premium";
}

function defaultPremiumDateValue(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function parsePremiumDateValue(value: string) {
  const text = value.trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return new Date(`${text}T23:59:59+08:00`).toISOString();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function withdrawalStatusText(status: PublicUserWithdrawalStatus) {
  if (status === "PENDING") return "Pending";
  if (status === "PAID") return "Paid";
  if (status === "REJECTED") return "Rejected";
  return "Cancelled";
}

function withdrawalStatusVariant(status: PublicUserWithdrawalStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PENDING") return "secondary";
  if (status === "PAID") return "default";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

async function copyText(text?: string | null) {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  toast.success("Copied");
}

export function AdminUsersClient() {
  type AdminUsersSection = "users" | "withdrawals" | "settings";
  const [users, setUsers] = useState<AdminPublicUser[]>([]);
  const [summary, setSummary] = useState<AdminPublicUsersResponse["summary"]>({
    userCount: 0,
    availableBalance: 0,
    frozenBalance: 0,
    totalDeposited: 0,
    totalSpent: 0,
  });
  const [withdrawals, setWithdrawals] = useState<AdminPublicWithdrawalRequest[]>([]);
  const [activeSection, setActiveSection] = useState<AdminUsersSection>("users");
  const [settings, setSettings] = useState<PublicSiteSettings>({
    tgInviteEnabled: false,
    tgInviteUrl: "https://t.me/your_group",
    depositEnabled: true,
    withdrawEnabled: false,
    premiumSaleEnabled: true,
    premiumPurchasePrice: 1.5,
    faqContent: "",
    faqContentEn: "",
    extractMethodSelectionEnabled: false,
    customProxyEnabled: false,
  });
  const [search, setSearch] = useState("");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const deferredWithdrawalSearch = useDeferredValue(withdrawalSearch);
  const [page, setPage] = useState(1);
  const [withdrawalPage, setWithdrawalPage] = useState(1);
  const [pagination, setPagination] = useState<AdminPaginationMeta | null>(null);
  const [withdrawalPagination, setWithdrawalPagination] = useState<AdminPaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [premiumDialogOpen, setPremiumDialogOpen] = useState(false);
  const [premiumDialogUser, setPremiumDialogUser] = useState<AdminPublicUser | null>(null);
  const [premiumDialogEnabled, setPremiumDialogEnabled] = useState(true);
  const [premiumDialogTier, setPremiumDialogTier] = useState<"premium" | "premium_og">("premium");
  const [premiumUntilInput, setPremiumUntilInput] = useState("");
  const [premiumPermanent, setPremiumPermanent] = useState(true);
  const [premiumSaving, setPremiumSaving] = useState(false);
  const [withdrawalDialogOpen, setWithdrawalDialogOpen] = useState(false);
  const [withdrawalDialogRequest, setWithdrawalDialogRequest] = useState<AdminPublicWithdrawalRequest | null>(null);
  const [withdrawalDialogAction, setWithdrawalDialogAction] = useState<"paid" | "reject">("paid");
  const [withdrawalAdminNote, setWithdrawalAdminNote] = useState("");
  const [withdrawalSaving, setWithdrawalSaving] = useState(false);
  const [premiumPriceDraft, setPremiumPriceDraft] = useState("1.5");
  const [premiumPriceDirty, setPremiumPriceDirty] = useState(false);
  const [premiumSaleSaving, setPremiumSaleSaving] = useState(false);
  const [faqDraft, setFaqDraft] = useState("");
  const [faqDraftEn, setFaqDraftEn] = useState("");
  const [faqLang, setFaqLang] = useState<"zh" | "en">("zh");
  const [faqDirty, setFaqDirty] = useState(false);
  const [faqSaving, setFaqSaving] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const [usersData, withdrawalData, settingsData] = await Promise.all([
        apiFetch<AdminPublicUsersResponse>(pagedAdminUrl("/api/admin/public-users", { page, search: deferredSearch })),
        apiFetch<AdminPaginatedResponse<AdminPublicWithdrawalRequest>>(pagedAdminUrl("/api/admin/public-withdrawals", { page: withdrawalPage, search: deferredWithdrawalSearch })),
        apiFetch<PublicSiteSettings>("/api/admin/settings"),
      ]);
      setUsers(usersData.users);
      setPagination(usersData.pagination || null);
      setSummary(usersData.summary);
      setWithdrawals(withdrawalData.items);
      setWithdrawalPagination(withdrawalData.pagination);
      setSettings(settingsData);
      if (!premiumPriceDirty) setPremiumPriceDraft(String(settingsData.premiumPurchasePrice));
      if (!faqDirty) setFaqDraft(settingsData.faqContent || "");
      if (!faqDirty) setFaqDraftEn(settingsData.faqContentEn || "");
      if (!silent) toast.success("User data refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to load user data");
    } finally {
      setLoading(false);
    }
  }, [deferredSearch, deferredWithdrawalSearch, faqDirty, page, premiumPriceDirty, withdrawalPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

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

  const setWithdrawEnabled = useCallback(async (enabled: boolean) => {
    const previous = settings;
    try {
      setSettings((current) => ({ ...current, withdrawEnabled: enabled }));
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ withdrawEnabled: enabled }),
      });
      setSettings(nextSettings);
      toast.success(enabled ? "Withdrawal enabled" : "Withdrawal hidden");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save withdrawal settings");
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
      toast.success(enabled ? "Extraction method selection enabled" : "Extraction method selection disabled, default UPI");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save extraction method settings");
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

  async function saveFaqContent() {
    try {
      setFaqSaving(true);
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ faqContent: faqDraft, faqContentEn: faqDraftEn }),
      });
      setSettings(nextSettings);
      setFaqDraft(nextSettings.faqContent || "");
      setFaqDraftEn(nextSettings.faqContentEn || "");
      setFaqDirty(false);
      toast.success("FAQ saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save FAQ");
    } finally {
      setFaqSaving(false);
    }
  }

  const setPremiumSaleEnabled = useCallback(async (enabled: boolean) => {
    const previous = settings;
    try {
      setPremiumSaleSaving(true);
      setSettings((current) => ({ ...current, premiumSaleEnabled: enabled }));
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ premiumSaleEnabled: enabled }),
      });
      setSettings(nextSettings);
      if (!premiumPriceDirty) setPremiumPriceDraft(String(nextSettings.premiumPurchasePrice));
      toast.success(enabled ? "Premium sale enabled" : "Premium sale disabled");
    } catch (error) {
      setSettings(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save premium sale settings");
    } finally {
      setPremiumSaleSaving(false);
    }
  }, [premiumPriceDirty, settings]);

  const savePremiumPurchasePrice = useCallback(async () => {
    const price = Number(premiumPriceDraft);
    if (!Number.isFinite(price) || price <= 0) {
      toast.error("Premium sale price must be greater than 0");
      return;
    }

    try {
      setPremiumSaleSaving(true);
      const nextSettings = await apiFetch<PublicSiteSettings>("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ premiumPurchasePrice: price }),
      });
      setSettings(nextSettings);
      setPremiumPriceDraft(String(nextSettings.premiumPurchasePrice));
      setPremiumPriceDirty(false);
      toast.success("Premium sale price saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save premium sale price");
    } finally {
      setPremiumSaleSaving(false);
    }
  }, [premiumPriceDraft]);

  const filteredUsers = users;

  const pendingWithdrawals = withdrawals.filter((item) => item.status === "PENDING");
  const pendingWithdrawalAmount = pendingWithdrawals.reduce((sum, item) => sum + item.totalFrozen, 0);
  const premiumUserCount = users.filter((user) => user.isPremium).length;

  function openPremiumDialog(user: AdminPublicUser, enabled: boolean) {
    setPremiumDialogUser(user);
    setPremiumDialogEnabled(enabled);
    setPremiumDialogTier(user.premiumTier === "premium_og" ? "premium_og" : "premium");
    setPremiumUntilInput(defaultPremiumDateValue(user.premiumUntil));
    setPremiumPermanent(!user.premiumUntil);
    setPremiumDialogOpen(true);
  }

  function openWithdrawalDialog(request: AdminPublicWithdrawalRequest, action: "paid" | "reject") {
    setWithdrawalDialogRequest(request);
    setWithdrawalDialogAction(action);
    setWithdrawalAdminNote(request.adminNote || "");
    setWithdrawalDialogOpen(true);
  }

  async function submitWithdrawalDialog() {
    if (!withdrawalDialogRequest) return;
    const adminNote = withdrawalAdminNote.trim();
    const endpoint = withdrawalDialogAction === "paid" ? "paid" : "reject";

    try {
      setWithdrawalSaving(true);
      setLoading(true);
      await apiFetch(`/api/admin/public-withdrawals/${withdrawalDialogRequest.id}/${endpoint}`, {
        method: "POST",
        body: JSON.stringify({ adminNote }),
      });
      toast.success(withdrawalDialogAction === "paid" ? "Withdrawal marked as paid" : "Withdrawal rejected and frozen balance refunded");
      setWithdrawalDialogOpen(false);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to process withdrawal request");
    } finally {
      setWithdrawalSaving(false);
      setLoading(false);
    }
  }

  async function submitPremiumDialog() {
    if (!premiumDialogUser) return;
    let premiumUntil: string | null = null;

    if (premiumDialogEnabled) {
      const parsed = premiumPermanent ? null : parsePremiumDateValue(premiumUntilInput);
      if (parsed === undefined) {
        toast.error("Invalid Premium expiry format. Please use YYYY-MM-DD");
        return;
      }
      if (parsed === null && !premiumPermanent) {
        toast.error("Please select a Premium expiry date or enable permanent");
        return;
      }
      premiumUntil = parsed;
    }

    try {
      setPremiumSaving(true);
      setLoading(true);
      await apiFetch(`/api/admin/public-users/${encodeURIComponent(premiumDialogUser.telegramUserId)}/premium`, {
        method: "POST",
        body: JSON.stringify({ enabled: premiumDialogEnabled, premiumUntil, premiumTier: premiumDialogTier }),
      });
      toast.success(premiumDialogEnabled ? "Premium status updated" : "Premium status cancelled");
      setPremiumDialogOpen(false);
      await refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save Premium status");
    } finally {
      setPremiumSaving(false);
      setLoading(false);
    }
  }

  return (
    <AppFrame audience="admin" title="User Management" subtitle="Manage Telegram users, wallet balances, withdrawal requests, and order data." onRefresh={() => refresh()}>
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard title="User Count" value={summary.userCount} description={`Logged in / wallets opened: ${summary.walletCount ?? 0}`} icon={UsersRoundIcon} tone="brand" />
        <MetricCard title="Available Balance" value={formatUsdt(summary.availableBalance)} description="Total available balance across all user wallets" icon={WalletIcon} tone="success" />
        <MetricCard title="Frozen Balance" value={formatUsdt(summary.frozenBalance)} description="Total frozen for withdrawals and scan orders" icon={WalletIcon} tone="warning" />
        <MetricCard title="Premium Users" value={premiumUserCount} description={`Pending withdrawals ${pendingWithdrawals.length} / ${formatUsdt(pendingWithdrawalAmount)}`} icon={CrownIcon} tone="info" />
      </div>

      <Tabs
        value={activeSection}
        onValueChange={(value) => setActiveSection(value as AdminUsersSection)}
        className="mt-4 gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList className="flex w-full flex-wrap justify-start rounded-2xl p-1 sm:w-auto">
            <TabsTrigger value="users" className="min-w-32">
              Users {pagination?.total ?? users.length}
            </TabsTrigger>
            <TabsTrigger value="withdrawals" className="min-w-32">
              Withdrawals {withdrawalPagination?.total ?? withdrawals.length}
            </TabsTrigger>
            <TabsTrigger value="settings" className="min-w-28">
              Settings
            </TabsTrigger>
          </TabsList>
          <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
            Refresh
          </Button>
        </div>

        <TabsContent value="users">
      <Card className="rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>User List</CardTitle>
          <CardDescription>Users aggregated by Telegram account showing wallet, extraction count, scan orders, and ledger data.</CardDescription>
          <CardAction>
            <div className="relative w-72 max-w-full">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search TG ID / username" className="pl-9" />
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Deposit Risk</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Withdrawal</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="font-semibold">{user.telegramUsername ? `@${user.telegramUsername}` : user.telegramUserId}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{user.telegramUserId}</span>
                        <Badge variant={user.hasWallet ? "default" : "outline"}>{user.hasWallet ? "Wallet opened" : "No wallet"}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={user.isPremium ? "default" : user.premiumExpired ? "destructive" : "outline"}>
                          {user.isPremium ? premiumTierLabel(user.premiumTier) : user.premiumExpired ? `${premiumTierLabel(user.premiumTier)} Expired` : "Normal"}
                        </Badge>
                        {user.premiumSource === "default" && <Badge variant="secondary">Default</Badge>}
                      </div>
                      {(user.premiumEnabled || user.premiumUntil) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Valid until: {formatPremiumUntil(user.premiumUntil)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.depositRiskSigned ? "default" : "outline"}>
                        {user.depositRiskSigned ? "Signed" : "Not signed"}
                      </Badge>
                      {user.depositRiskSignedAt && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(user.depositRiskSignedAt)}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">Available <span className="font-semibold">{formatUsdt(user.availableBalance)}</span></div>
                      <div className="text-xs text-muted-foreground">Frozen {formatUsdt(user.frozenBalance)}</div>
                      <div className="text-xs text-muted-foreground">Deposited {formatUsdt(user.totalDeposited)} / Spent {formatUsdt(user.totalSpent)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary">Extractions {user.extractCount}</Badge>
                        <Badge variant="secondary">Scan orders {user.scanOrderCount}</Badge>
                        <Badge variant="outline">Ledger {user.ledgerCount}</Badge>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">Withdrawals {user.withdrawalCount}</div>
                      <div className="text-xs text-muted-foreground">Pending {user.pendingWithdrawalCount} / {formatUsdt(user.pendingWithdrawalAmount)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDateTime(user.createdAt)}</div>
                      <div className="text-xs text-muted-foreground">Updated {formatDateTime(user.updatedAt)}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => openPremiumDialog(user, true)} disabled={loading}>
                          <CrownIcon data-icon="inline-start" />{user.isPremium ? "Renew" : "Activate"}
                        </Button>
                        {(user.premiumEnabled || user.isPremium) && (
                          <Button size="sm" variant="ghost" onClick={() => openPremiumDialog(user, false)} disabled={loading}>Cancel</Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && <TableRow><TableCell colSpan={8} className="h-32 text-center text-muted-foreground">No users</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={pagination} loading={loading} onPageChange={setPage} className="mt-4" />
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="withdrawals">
      <Card className="rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Withdrawal Requests</CardTitle>
          <CardDescription>User BEP20 / BSC USDT withdrawal requests. Fee: 0.01 USDT. Mark as paid after on-chain transfer; reject refunds the frozen balance.</CardDescription>
          <CardAction>{pendingWithdrawals.length}  pending</CardAction>
        </CardHeader>
        <CardContent>
          <div className="mb-3 flex items-center gap-2">
            <SearchIcon className="size-4 text-muted-foreground" />
            <Input value={withdrawalSearch} onChange={(event) => { setWithdrawalSearch(event.target.value); setWithdrawalPage(1); }} placeholder="Search TG / address / note" />
          </div>
          <div className="overflow-hidden rounded-3xl border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Withdrawal Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div className="font-semibold">{request.telegramUsername ? `@${request.telegramUsername}` : request.telegramUserId}</div>
                      <div className="font-mono text-xs text-muted-foreground">{request.telegramUserId}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold">{formatUsdt(request.amount)}</div>
                      <div className="text-xs text-muted-foreground">Fee {formatUsdt(request.fee)} / Frozen {formatUsdt(request.totalFrozen)}</div>
                    </TableCell>
                    <TableCell>
                      <button type="button" className="font-mono text-xs underline-offset-4 hover:underline" title={request.withdrawalAddress} onClick={() => copyText(request.withdrawalAddress)}>
                        {shortAddress(request.withdrawalAddress)}
                      </button>
                      <div className="text-xs text-muted-foreground">{request.chain} / {request.tokenSymbol}</div>
                    </TableCell>
                    <TableCell><Badge variant={withdrawalStatusVariant(request.status)}>{withdrawalStatusText(request.status)}</Badge></TableCell>
                    <TableCell>
                      <div className="text-sm">{formatDateTime(request.requestedAt)}</div>
                      {request.processedAt && <div className="text-xs text-muted-foreground">Processed {formatDateTime(request.processedAt)}</div>}
                    </TableCell>
                    <TableCell className="max-w-[260px]">
                      <div className="truncate text-sm">{request.note || "-"}</div>
                      {request.adminNote && <div className="truncate text-xs text-muted-foreground">Admin: {request.adminNote}</div>}
                    </TableCell>
                    <TableCell className="text-right">
                      {request.status === "PENDING" ? (
                        <div className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => openWithdrawalDialog(request, "paid")} disabled={loading}>
                            <CheckCircle2Icon data-icon="inline-start" />Mark Paid
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openWithdrawalDialog(request, "reject")} disabled={loading}>
                            <XCircleIcon data-icon="inline-start" />Reject
                          </Button>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">{request.processedBy || "-"}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {withdrawals.length === 0 && <TableRow><TableCell colSpan={7} className="h-32 text-center text-muted-foreground">No withdrawal requests</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <AdminListPagination pagination={withdrawalPagination} loading={loading} onPageChange={setWithdrawalPage} className="mt-4" />
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="settings" className="flex flex-col gap-4">
          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>Extraction Feature Settings</CardTitle>
              <CardDescription>Control whether extraction method selection and custom proxy are shown to users. When disabled the frontend hides the option and backend forces defaults.</CardDescription>
              <CardAction><UsersRoundIcon className="size-5 text-muted-foreground" /></CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Show extraction method selection</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Status: {settings.extractMethodSelectionEnabled ? "Enabled" : "Disabled"}. When off, users default to UPI without IDEAL/UPI selection.
                  </div>
                </div>
                <Switch checked={settings.extractMethodSelectionEnabled} onCheckedChange={setExtractMethodSelectionEnabled} disabled={loading} />
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Allow user custom proxies</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Status: {settings.customProxyEnabled ? "Enabled" : "Disabled"}. When off, custom checkout/provider proxy is hidden and backend ignores user proxy params.
                  </div>
                </div>
                <Switch checked={settings.customProxyEnabled} onCheckedChange={setCustomProxyEnabled} disabled={loading} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>Wallet Feature Settings</CardTitle>
              <CardDescription>Control deposit and withdrawal features in the user wallet. Disabling does not affect existing orders or history.</CardDescription>
              <CardAction><WalletIcon className="size-5 text-muted-foreground" /></CardAction>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Enable user deposit</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Status: {settings.depositEnabled ? "Enabled" : "Disabled"}. Existing deposit orders and balance refresh are unaffected.
                  </div>
                </div>
                <Switch checked={settings.depositEnabled} onCheckedChange={setDepositEnabled} disabled={loading} />
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">Show user withdrawal</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Status: {settings.withdrawEnabled ? "Shown" : "Hidden"}. When hidden, users cannot see the withdraw button and backend rejects new requests.
                  </div>
                </div>
                <Switch checked={settings.withdrawEnabled} onCheckedChange={setWithdrawEnabled} disabled={loading} />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>FAQ Configuration</CardTitle>
              <CardDescription>Configure FAQ content for the public extraction page in Chinese and English. Frontend displays based on user language.</CardDescription>
              <CardAction>FAQ</CardAction>
            </CardHeader>
            <CardContent>
              <Tabs value={faqLang} onValueChange={(value) => setFaqLang(value as "zh" | "en")} className="gap-3">
                <TabsList className="rounded-2xl p-1">
                  <TabsTrigger value="zh" className="min-w-24">Chinese</TabsTrigger>
                  <TabsTrigger value="en" className="min-w-24">English</TabsTrigger>
                </TabsList>
                <TabsContent value="zh">
                  <Textarea
                    value={faqDraft}
                    onChange={(event) => {
                      setFaqDraft(event.target.value);
                      setFaqDirty(true);
                    }}
                    rows={8}
                    className="min-h-40"
                    placeholder={"Q: How much should I transfer?\nA: ..."}
                  />
                </TabsContent>
                <TabsContent value="en">
                  <Textarea
                    value={faqDraftEn}
                    onChange={(event) => {
                      setFaqDraftEn(event.target.value);
                      setFaqDirty(true);
                    }}
                    rows={8}
                    className="min-h-40"
                    placeholder={"Q: What amount should I transfer?\nA: ..."}
                  />
                </TabsContent>
              </Tabs>
              <div className="mt-3 flex justify-end">
                <Button type="button" onClick={() => void saveFaqContent()} disabled={loading || faqSaving || !faqDirty}>
                  {faqSaving ? "Saving..." : "Save FAQ"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-3xl bg-background shadow-sm">
            <CardHeader>
              <CardTitle>Premium Sale Settings</CardTitle>
              <CardDescription>Control self-service Premium purchase and price. Disabling does not affect current Premium users, free trials, or admin grants.</CardDescription>
              <CardAction><CrownIcon className="size-5 text-muted-foreground" /></CardAction>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 rounded-2xl border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-medium">Enable Premium self-purchase</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Status: {settings.premiumSaleEnabled ? "Enabled" : "Disabled"}. When off, the buy button is disabled and backend rejects purchase requests.
                    </div>
                  </div>
                  <Switch checked={settings.premiumSaleEnabled} onCheckedChange={setPremiumSaleEnabled} disabled={loading || premiumSaleSaving} />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <Label htmlFor="premium-purchase-price">Lifetime Premium price (USDT)</Label>
                    <Input
                      id="premium-purchase-price"
                      type="number"
                      min={0.000001}
                      step="0.1"
                      value={premiumPriceDraft}
                      onChange={(event) => {
                        setPremiumPriceDraft(event.target.value);
                        setPremiumPriceDirty(true);
                      }}
                      disabled={loading || premiumSaleSaving}
                      className="mt-2 max-w-xs"
                    />
                    <div className="mt-1 text-xs text-muted-foreground">Current effective price: {formatUsdt(settings.premiumPurchasePrice)}</div>
                  </div>
                  <Button type="button" onClick={() => void savePremiumPurchasePrice()} disabled={loading || premiumSaleSaving || !premiumPriceDirty}>
                    {premiumSaleSaving ? "Saving..." : "Save price"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={withdrawalDialogOpen} onOpenChange={(open) => {
        if (!open && withdrawalSaving) return;
        setWithdrawalDialogOpen(open);
      }}>
        <DialogContent className="w-[min(94vw,560px)] max-w-[min(94vw,560px)] rounded-3xl p-5 sm:max-w-[min(94vw,560px)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              {withdrawalDialogAction === "paid" ? (
                <CheckCircle2Icon className="size-5 text-emerald-600" />
              ) : (
                <XCircleIcon className="size-5 text-destructive" />
              )}
              {withdrawalDialogAction === "paid" ? "Confirm Withdrawal Paid" : "Reject Withdrawal"}
            </DialogTitle>
            <DialogDescription>
              {withdrawalDialogAction === "paid"
                ? "Confirm you have completed the on-chain transfer, then mark this withdrawal as paid."
                : "Rejecting will automatically refund the user frozen balance, keeping the admin note."}
            </DialogDescription>
          </DialogHeader>

          {withdrawalDialogRequest && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Requesting user</div>
                    <div className="mt-1 text-base font-semibold">
                      {withdrawalDialogRequest.telegramUsername ? `@${withdrawalDialogRequest.telegramUsername}` : withdrawalDialogRequest.telegramUserId}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{withdrawalDialogRequest.telegramUserId}</div>
                  </div>
                  <Badge variant={withdrawalStatusVariant(withdrawalDialogRequest.status)}>
                    {withdrawalStatusText(withdrawalDialogRequest.status)}
                  </Badge>
                </div>

                <div className="mt-4 grid gap-3 rounded-2xl bg-background/70 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-muted-foreground">Amount received</div>
                    <div className="mt-1 font-medium">{formatUsdt(withdrawalDialogRequest.amount)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Fee / Frozen</div>
                    <div className="mt-1 font-medium">{formatUsdt(withdrawalDialogRequest.fee)} / {formatUsdt(withdrawalDialogRequest.totalFrozen)}</div>
                  </div>
                  <div className="sm:col-span-2">
                    <div className="text-muted-foreground">Withdrawal address</div>
                    <button
                      type="button"
                      className="mt-1 break-all font-mono text-xs underline-offset-4 hover:underline"
                      onClick={() => copyText(withdrawalDialogRequest.withdrawalAddress)}
                    >
                      {withdrawalDialogRequest.withdrawalAddress}
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="withdrawal-admin-note">
                  {withdrawalDialogAction === "paid" ? "TX hash / admin note" : "Rejection reason"}
                </Label>
                <Textarea
                  id="withdrawal-admin-note"
                  value={withdrawalAdminNote}
                  onChange={(event) => setWithdrawalAdminNote(event.target.value)}
                  placeholder={withdrawalDialogAction === "paid" ? "Enter on-chain TX hash for reference" : "Enter rejection reason for tracking"}
                  className="min-h-24 resize-none"
                  disabled={withdrawalSaving}
                />
              </div>

              {withdrawalDialogAction === "reject" && (
                <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-muted-foreground">
                  Rejecting refunds frozen amount {formatUsdt(withdrawalDialogRequest.totalFrozen)} to user available balance.
                </div>
              )}
            </div>
          )}

          <DialogFooter className="-mx-5 -mb-5">
            <Button type="button" variant="outline" onClick={() => setWithdrawalDialogOpen(false)} disabled={withdrawalSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={withdrawalDialogAction === "paid" ? "default" : "destructive"}
              onClick={() => void submitWithdrawalDialog()}
              disabled={!withdrawalDialogRequest || withdrawalSaving}
            >
              {withdrawalDialogAction === "paid" ? <CheckCircle2Icon data-icon="inline-start" /> : <XCircleIcon data-icon="inline-start" />}
              {withdrawalSaving ? "Processing..." : withdrawalDialogAction === "paid" ? "Confirm Paid" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={premiumDialogOpen} onOpenChange={(open) => {
        if (!open && premiumSaving) return;
        setPremiumDialogOpen(open);
      }}>
        <DialogContent className="w-[min(94vw,560px)] max-w-[min(94vw,560px)] rounded-3xl p-5 sm:max-w-[min(94vw,560px)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <CrownIcon className="size-5 text-primary" />
              Edit User Role
            </DialogTitle>
            <DialogDescription>
              Activate, renew, or cancel Premium for a Telegram user.
            </DialogDescription>
          </DialogHeader>

          {premiumDialogUser && (
            <div className="space-y-4">
              <div className="rounded-3xl border border-border bg-muted/30 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm text-muted-foreground">Current user</div>
                    <div className="mt-1 text-base font-semibold">
                      {premiumDialogUser.telegramUsername ? `@${premiumDialogUser.telegramUsername}` : premiumDialogUser.telegramUserId}
                    </div>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">{premiumDialogUser.telegramUserId}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={premiumDialogUser.isPremium ? "default" : premiumDialogUser.premiumExpired ? "destructive" : "outline"}>
                      {premiumDialogUser.isPremium ? premiumTierLabel(premiumDialogUser.premiumTier) : premiumDialogUser.premiumExpired ? `${premiumTierLabel(premiumDialogUser.premiumTier)} Expired` : "Normal"}
                    </Badge>
                    {premiumDialogUser.premiumSource === "default" && <Badge variant="secondary">Default</Badge>}
                    <Badge variant={premiumDialogUser.hasWallet ? "default" : "outline"}>
                      {premiumDialogUser.hasWallet ? "Wallet opened" : "No wallet"}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 rounded-2xl bg-background/70 p-3 text-sm sm:grid-cols-2">
                  <div>
                    <div className="text-muted-foreground">Current expiry</div>
                    <div className="mt-1 font-medium">{formatPremiumUntil(premiumDialogUser.premiumUntil)}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Available balance</div>
                    <div className="mt-1 font-medium">{formatUsdt(premiumDialogUser.availableBalance)}</div>
                  </div>
                </div>
              </div>

              {premiumDialogEnabled ? (
                <div className="space-y-4 rounded-3xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="font-medium">Activate / Renew Premium</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Choose permanent, or specify a date (expires end of day 23:59:59).
                      </div>
                    </div>
                    <Badge variant="secondary">{premiumTierLabel(premiumDialogTier)}</Badge>
                  </div>

                  <div className="rounded-2xl bg-background/80 p-3">
                    <div className="mb-2 text-sm font-medium">Role name</div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={premiumDialogTier === "premium" ? "default" : "outline"}
                        onClick={() => setPremiumDialogTier("premium")}
                        disabled={premiumSaving}
                      >
                        Premium
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={premiumDialogTier === "premium_og" ? "default" : "outline"}
                        onClick={() => setPremiumDialogTier("premium_og")}
                        disabled={premiumSaving}
                      >
                        Premium OG
                      </Button>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Premium OG is identical to Premium in benefits, only the display name differs.
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-2xl bg-background/80 p-3">
                    <Label htmlFor="premium-permanent" className="flex flex-col items-start gap-1">
                      <span>Permanent</span>
                      <span className="text-xs font-normal text-muted-foreground">When enabled, no expiry date is set.</span>
                    </Label>
                    <Switch id="premium-permanent" checked={premiumPermanent} onCheckedChange={setPremiumPermanent} disabled={premiumSaving} />
                  </div>

                  {!premiumPermanent && (
                    <div className="space-y-2">
                      <Label htmlFor="premium-until">Premium expiry date</Label>
                      <Input
                        id="premium-until"
                        type="date"
                        value={premiumUntilInput}
                        onChange={(event) => setPremiumUntilInput(event.target.value)}
                        disabled={premiumSaving}
                      />
                      <p className="text-xs text-muted-foreground">
                        e.g. 2026-12-31. Saved as end of day Asia/Shanghai time.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-3xl border border-destructive/20 bg-destructive/5 p-4">
                  <div className="flex items-start gap-3">
                    <XCircleIcon className="mt-0.5 size-5 text-destructive" />
                    <div>
                      <div className="font-medium text-destructive">Confirm cancel Premium?</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        After saving, this user reverts to a normal user. Premium channel and auto-retry will be disabled immediately.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="-mx-5 -mb-5">
            <Button type="button" variant="outline" onClick={() => setPremiumDialogOpen(false)} disabled={premiumSaving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={premiumDialogEnabled ? "default" : "destructive"}
              onClick={() => void submitPremiumDialog()}
              disabled={!premiumDialogUser || premiumSaving}
            >
              {premiumDialogEnabled ? <CrownIcon data-icon="inline-start" /> : <XCircleIcon data-icon="inline-start" />}
              {premiumSaving ? "Saving..." : premiumDialogEnabled ? "Save" : "Confirm Cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppFrame>
  );
}
