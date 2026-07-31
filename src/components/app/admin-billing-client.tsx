"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { AlertTriangleIcon, ArrowDownToLineIcon, ArrowUpFromLineIcon, CheckCircle2Icon, DatabaseIcon, RefreshCwIcon, ReceiptTextIcon, SearchIcon, WalletIcon, WrenchIcon } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { apiFetch, formatDateTime } from "@/lib/api-client";
import type { AdminPaginationMeta } from "@/lib/types/app";

type BillingLedger = {
  id: string;
  walletId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  type: string;
  availableDelta: number;
  frozenDelta: number;
  orderId?: string | null;
  referenceId?: string | null;
  note?: string | null;
  createdAt: string;
  walletAvailableBalance: number;
  walletFrozenBalance: number;
};

type BillingDepositOrder = {
  id: string;
  orderNo: string;
  walletId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  baseAmount: number;
  payAmount: number;
  status: "PENDING" | "PAID" | "EXPIRED" | "CANCELLED";
  chain: string;
  tokenSymbol: string;
  depositAddress: string;
  txHash?: string | null;
  logIndex?: number | null;
  fromAddress?: string | null;
  blockNumber?: number | null;
  confirmations?: number | null;
  expiresAt: string;
  paidAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type BillingWithdrawal = {
  id: string;
  walletId: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  amount: number;
  fee: number;
  totalFrozen: number;
  status: "PENDING" | "PAID" | "REJECTED" | "CANCELLED";
  chain: string;
  tokenSymbol: string;
  withdrawalAddress: string;
  note?: string | null;
  adminNote?: string | null;
  requestedAt: string;
  processedAt?: string | null;
  processedBy?: string | null;
};

type BillingChainDeposit = {
  id: string;
  telegramUserId: string;
  telegramUsername?: string | null;
  chain: string;
  tokenSymbol: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  amount: number;
  confirmations: number;
  status: "CONFIRMED" | "IGNORED";
  creditedAt?: string | null;
  createdAt: string;
};

type BillingTab = "deposits" | "ledgers" | "withdrawals" | "chain";

type DepositCorrectionOrder = {
  id: string;
  orderNo: string;
  status: BillingDepositOrder["status"];
  baseAmount: number;
  payAmount: number;
  txHash?: string | null;
  logIndex?: number | null;
  createdAt: string;
  expiresAt: string;
  paidAt?: string | null;
  canBind: boolean;
};

type DepositCorrectionPreview = {
  tx: {
    txHash: string;
    logIndex: number;
    amount: number;
    fromAddress: string;
    toAddress: string;
    blockNumber: number;
    confirmations: number;
    creditedAt?: string | null;
  };
  current: {
    telegramUserId: string;
    telegramUsername?: string | null;
    walletId: string;
    availableBalance: number;
    totalDeposited: number;
    order?: Pick<DepositCorrectionOrder, "id" | "orderNo" | "status" | "payAmount" | "txHash" | "logIndex"> | null;
    ledger?: { id: string; referenceId?: string | null; availableDelta: number } | null;
  };
  target: {
    telegramUserId: string;
    telegramUsername?: string | null;
    walletId: string;
    availableBalance: number;
    totalDeposited: number;
  };
  candidateOrders: DepositCorrectionOrder[];
  selectedTargetOrderId?: string | null;
  recommendedTargetOrderId?: string | null;
  plan: {
    amount: number;
    debit: { telegramUserId: string; beforeAvailable: number; afterAvailable: number; beforeTotalDeposited: number; afterTotalDeposited: number };
    credit: { telegramUserId: string; beforeAvailable: number; afterAvailable: number; beforeTotalDeposited: number; afterTotalDeposited: number };
    wrongOrderAction: string;
    targetOrderAction: string;
    chainDepositAction: string;
    ledgerAction: string;
    canExecute: boolean;
    errors: string[];
    warnings: string[];
  };
};

type AdminBillingResponse = {
  summary: {
    walletCount: number;
    ledgerCount: number;
    chainDepositCount: number;
    availableBalance: number;
    frozenBalance: number;
    totalDeposited: number;
    totalSpent: number;
    depositOrderCount: number;
    depositOrderAmount: number;
    pendingDepositOrderCount: number;
    pendingDepositOrderAmount: number;
    paidDepositOrderCount: number;
    paidDepositOrderAmount: number;
    withdrawalCount: number;
    withdrawalAmount: number;
    pendingWithdrawalCount: number;
    pendingWithdrawalAmount: number;
  };
  ledgers: BillingLedger[];
  depositOrders: BillingDepositOrder[];
  withdrawals: BillingWithdrawal[];
  chainDeposits: BillingChainDeposit[];
  activeTab?: BillingTab;
  pagination?: AdminPaginationMeta;
};

const EMPTY_DATA: AdminBillingResponse = {
  summary: {
    walletCount: 0,
    ledgerCount: 0,
    chainDepositCount: 0,
    availableBalance: 0,
    frozenBalance: 0,
    totalDeposited: 0,
    totalSpent: 0,
    depositOrderCount: 0,
    depositOrderAmount: 0,
    pendingDepositOrderCount: 0,
    pendingDepositOrderAmount: 0,
    paidDepositOrderCount: 0,
    paidDepositOrderAmount: 0,
    withdrawalCount: 0,
    withdrawalAmount: 0,
    pendingWithdrawalCount: 0,
    pendingWithdrawalAmount: 0,
  },
  ledgers: [],
  depositOrders: [],
  withdrawals: [],
  chainDeposits: [],
};

const ADMIN_PAGE_SIZE = 20;

function pagedBillingUrl(input: { tab: BillingTab; page: number; search?: string }) {
  const params = new URLSearchParams();
  params.set("paged", "1");
  params.set("tab", input.tab);
  params.set("page", String(input.page));
  params.set("pageSize", String(ADMIN_PAGE_SIZE));
  if (input.search?.trim()) params.set("search", input.search.trim());
  return `/api/admin/billing?${params.toString()}`;
}

function depositCorrectionUrl(input: { txHash: string; logIndex?: string; target: string; targetOrderId?: string }) {
  const params = new URLSearchParams();
  params.set("txHash", input.txHash.trim());
  params.set("target", input.target.trim());
  if (input.logIndex?.trim()) params.set("logIndex", input.logIndex.trim());
  if (input.targetOrderId?.trim()) params.set("targetOrderId", input.targetOrderId.trim());
  return `/api/admin/billing/deposit-correction?${params.toString()}`;
}

function formatUsdt(value?: number | null) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "0.000000 USDT";
  return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 6 })} USDT`;
}

function shortValue(value?: string | null, start = 8, end = 8) {
  if (!value) return "-";
  if (value.length <= start + end + 3) return value;
  return `${value.slice(0, start)}...${value.slice(-end)}`;
}

function userLabel(item: { telegramUserId: string; telegramUsername?: string | null }) {
  return item.telegramUsername ? `@${item.telegramUsername}` : item.telegramUserId;
}

function depositStatusVariant(status: BillingDepositOrder["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PAID") return "default";
  if (status === "PENDING") return "secondary";
  if (status === "EXPIRED") return "outline";
  return "destructive";
}

function withdrawalStatusVariant(status: BillingWithdrawal["status"]): "default" | "secondary" | "destructive" | "outline" {
  if (status === "PAID") return "default";
  if (status === "PENDING") return "secondary";
  if (status === "REJECTED") return "destructive";
  return "outline";
}

function ledgerTypeText(type: string) {
  const map: Record<string, string> = {
    CHAIN_DEPOSIT: "Chain Deposit",
    CDK_REDEEM: "CDK Redemption",
    ADMIN_ADJUSTMENT: "Balance Adjustment / Premium",
    SCAN_ORDER_FREEZE: "Scan Order Frozen",
    SCAN_ORDER_REFUND: "Scan Order Refund",
    SCAN_ORDER_SPEND: "Scan Order Payment",
    WITHDRAWAL_FREEZE: "Withdrawal Frozen",
    WITHDRAWAL_REFUND: "Withdrawal Refund",
    WITHDRAWAL_PAID: "Withdrawal Paid",
  };
  return map[type] || type;
}

async function copyText(value?: string | null) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  toast.success("Copied");
}

export function AdminBillingClient() {
  const [data, setData] = useState<AdminBillingResponse>(EMPTY_DATA);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [activeTab, setActiveTab] = useState<BillingTab>("deposits");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<AdminPaginationMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionTxHash, setCorrectionTxHash] = useState("");
  const [correctionLogIndex, setCorrectionLogIndex] = useState("");
  const [correctionTarget, setCorrectionTarget] = useState("");
  const [correctionTargetOrderId, setCorrectionTargetOrderId] = useState("");
  const [correctionConfirmText, setCorrectionConfirmText] = useState("");
  const [correctionNote, setCorrectionNote] = useState("");
  const [correctionPreview, setCorrectionPreview] = useState<DepositCorrectionPreview | null>(null);
  const [correctionLoading, setCorrectionLoading] = useState(false);
  const [correctionExecuting, setCorrectionExecuting] = useState(false);

  const refresh = useCallback(async (silent = false) => {
    try {
      setLoading(true);
      const nextData = await apiFetch<AdminBillingResponse>(pagedBillingUrl({ tab: activeTab, page, search: deferredSearch }));
      setData(nextData);
      setPagination(nextData.pagination || null);
      if (!silent) toast.success("Billing data refreshed");
    } catch (error) {
      if (!silent) toast.error(error instanceof Error ? error.message : "Failed to load billing data");
    } finally {
      setLoading(false);
    }
  }, [activeTab, deferredSearch, page]);

  const resetCorrectionPreview = useCallback(() => {
    setCorrectionPreview(null);
    setCorrectionTargetOrderId("");
    setCorrectionConfirmText("");
  }, []);

  const previewCorrection = useCallback(async () => {
    if (!correctionTxHash.trim() || !correctionTarget.trim()) {
      toast.error("Please fill in the transaction hash and correct recipient user");
      return;
    }
    try {
      setCorrectionLoading(true);
      const preview = await apiFetch<DepositCorrectionPreview>(depositCorrectionUrl({
        txHash: correctionTxHash,
        logIndex: correctionLogIndex,
        target: correctionTarget,
        targetOrderId: correctionTargetOrderId,
      }));
      setCorrectionPreview(preview);
      if (!correctionTargetOrderId && preview.recommendedTargetOrderId) {
        setCorrectionTargetOrderId(preview.recommendedTargetOrderId);
      }
      toast.success("Deposit correction preview generated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to generate deposit correction preview");
    } finally {
      setCorrectionLoading(false);
    }
  }, [correctionLogIndex, correctionTarget, correctionTargetOrderId, correctionTxHash]);

  const executeCorrection = useCallback(async () => {
    if (!correctionPreview?.plan.canExecute) {
      toast.error("Current preview is not executable. Please resolve the errors first.");
      return;
    }
    try {
      setCorrectionExecuting(true);
      const result = await apiFetch<DepositCorrectionPreview>("/api/admin/billing/deposit-correction", {
        method: "POST",
        body: JSON.stringify({
          txHash: correctionTxHash,
          logIndex: correctionLogIndex,
          target: correctionTarget,
          targetOrderId: correctionTargetOrderId,
          confirmText: correctionConfirmText,
          adminNote: correctionNote,
        }),
      });
      setCorrectionPreview(result);
      setCorrectionConfirmText("");
      toast.success("Deposit correction executed");
      void refresh(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to execute deposit correction");
    } finally {
      setCorrectionExecuting(false);
    }
  }, [correctionConfirmText, correctionLogIndex, correctionNote, correctionPreview?.plan.canExecute, correctionTarget, correctionTargetOrderId, correctionTxHash, refresh]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(true), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const filteredDepositOrders = data.depositOrders;
  const filteredLedgers = data.ledgers;
  const filteredWithdrawals = data.withdrawals;
  const filteredChainDeposits = data.chainDeposits;

  return (
    <AppFrame audience="admin" title="Billing" subtitle="View user wallets, deposit orders, on-chain credits, withdrawal requests, and wallet ledger." onRefresh={() => refresh()}>
      <div className="grid gap-4 xl:grid-cols-4">
        <MetricCard title="User Wallets" value={data.summary.walletCount} description={`Available ${formatUsdt(data.summary.availableBalance)} · Frozen ${formatUsdt(data.summary.frozenBalance)}`} icon={WalletIcon} tone="brand" />
        <MetricCard title="Credited Deposits" value={formatUsdt(data.summary.totalDeposited)} description={`${data.summary.paidDepositOrderCount} deposit order(s) paid`} icon={ArrowDownToLineIcon} tone="success" />
        <MetricCard title="Pending Deposits" value={data.summary.pendingDepositOrderCount} description={`Waiting ${formatUsdt(data.summary.pendingDepositOrderAmount)}`} icon={ReceiptTextIcon} tone="warning" />
        <MetricCard title="Pending Withdrawals" value={data.summary.pendingWithdrawalCount} description={`Frozen ${formatUsdt(data.summary.pendingWithdrawalAmount)}`} icon={ArrowUpFromLineIcon} tone="info" />
      </div>

      <Card className="mt-4 rounded-3xl bg-background shadow-sm">
        <CardHeader>
          <CardTitle>Wallet Records</CardTitle>
          <CardDescription>
            Latest 300 deposit orders, wallet ledger, withdrawal requests, and on-chain credit records. Search supports TG, order number, address, TX hash, and notes.
          </CardDescription>
          <CardAction>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCorrectionOpen(true)}>
                <WrenchIcon data-icon="inline-start" />Deposit Correction
              </Button>
              <div className="relative w-80 max-w-full">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search user / address / TX / order" className="pl-9" />
              </div>
              <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
                <RefreshCwIcon data-icon="inline-start" className={loading ? "animate-spin" : undefined} />Refresh
              </Button>
            </div>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value as BillingTab); setPage(1); }} className="gap-4">
            <TabsList className="flex w-full flex-wrap justify-start rounded-2xl p-1">
              <TabsTrigger value="deposits" className="min-w-28">Deposit Orders {activeTab === "deposits" && pagination ? pagination.total : data.summary.depositOrderCount}</TabsTrigger>
              <TabsTrigger value="ledgers" className="min-w-28">Wallet Ledger {activeTab === "ledgers" && pagination ? pagination.total : data.summary.ledgerCount}</TabsTrigger>
              <TabsTrigger value="withdrawals" className="min-w-28">Withdrawals {activeTab === "withdrawals" && pagination ? pagination.total : data.summary.withdrawalCount}</TabsTrigger>
              <TabsTrigger value="chain" className="min-w-28">On-chain Credits {activeTab === "chain" && pagination ? pagination.total : data.summary.chainDepositCount}</TabsTrigger>
            </TabsList>

            <TabsContent value="deposits">
              <div className="overflow-hidden rounded-3xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Address / TX</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDepositOrders.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold">{item.orderNo}</div>
                          <div className="text-xs text-muted-foreground">{item.chain} / {item.tokenSymbol}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{userLabel(item)}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.telegramUserId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{formatUsdt(item.payAmount)}</div>
                          <div className="text-xs text-muted-foreground">Base amount {formatUsdt(item.baseAmount)}</div>
                        </TableCell>
                        <TableCell><Badge variant={depositStatusVariant(item.status)}>{item.status}</Badge></TableCell>
                        <TableCell>
                          <button className="font-mono text-xs underline-offset-4 hover:underline" onClick={() => copyText(item.depositAddress)}>{shortValue(item.depositAddress)}</button>
                          {item.txHash && <div><button className="font-mono text-xs text-muted-foreground underline-offset-4 hover:underline" onClick={() => copyText(item.txHash)}>{shortValue(item.txHash, 10, 10)}</button></div>}
                          {item.fromAddress && <div className="font-mono text-xs text-muted-foreground">from {shortValue(item.fromAddress)}</div>}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">Created {formatDateTime(item.createdAt)}</div>
                          <div className="text-xs text-muted-foreground">Expires {formatDateTime(item.expiresAt)}</div>
                          {item.paidAt && <div className="text-xs text-success">Paid {formatDateTime(item.paidAt)}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredDepositOrders.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No deposit orders</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="ledgers">
              <div className="overflow-hidden rounded-3xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLedgers.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold">{userLabel(item)}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.telegramUserId}</div>
                        </TableCell>
                        <TableCell><Badge variant="secondary">{ledgerTypeText(item.type)}</Badge></TableCell>
                        <TableCell>
                          <div className="text-sm">Available <span className={item.availableDelta >= 0 ? "text-success" : "text-destructive"}>{formatUsdt(item.availableDelta)}</span></div>
                          <div className="text-xs text-muted-foreground">Frozen {formatUsdt(item.frozenDelta)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">{item.orderId ? shortValue(item.orderId, 8, 6) : "-"}</div>
                          {item.referenceId && <div className="font-mono text-xs text-muted-foreground">{shortValue(item.referenceId, 14, 10)}</div>}
                        </TableCell>
                        <TableCell className="max-w-[340px] truncate">{item.note || "-"}</TableCell>
                        <TableCell>{formatDateTime(item.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {filteredLedgers.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No wallet ledger entries</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="withdrawals">
              <div className="overflow-hidden rounded-3xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Withdrawal Address</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredWithdrawals.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold">{userLabel(item)}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.telegramUserId}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold">{formatUsdt(item.amount)}</div>
                          <div className="text-xs text-muted-foreground">Fee {formatUsdt(item.fee)} / Frozen {formatUsdt(item.totalFrozen)}</div>
                        </TableCell>
                        <TableCell><Badge variant={withdrawalStatusVariant(item.status)}>{item.status}</Badge></TableCell>
                        <TableCell>
                          <button className="font-mono text-xs underline-offset-4 hover:underline" onClick={() => copyText(item.withdrawalAddress)}>{shortValue(item.withdrawalAddress)}</button>
                          <div className="text-xs text-muted-foreground">{item.chain} / {item.tokenSymbol}</div>
                        </TableCell>
                        <TableCell className="max-w-[300px] truncate">{item.adminNote || item.note || "-"}</TableCell>
                        <TableCell>
                          <div className="text-sm">Requested {formatDateTime(item.requestedAt)}</div>
                          {item.processedAt && <div className="text-xs text-muted-foreground">Processed {formatDateTime(item.processedAt)}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredWithdrawals.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No withdrawal requests</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="chain">
              <div className="overflow-hidden rounded-3xl border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Transaction</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredChainDeposits.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-semibold">{userLabel(item)}</div>
                          <div className="font-mono text-xs text-muted-foreground">{item.telegramUserId}</div>
                        </TableCell>
                        <TableCell className="font-semibold">{formatUsdt(item.amount)}</TableCell>
                        <TableCell><Badge variant={item.status === "CONFIRMED" ? "default" : "outline"}>{item.status}</Badge></TableCell>
                        <TableCell>
                          <button className="font-mono text-xs underline-offset-4 hover:underline" onClick={() => copyText(item.txHash)}>{shortValue(item.txHash, 10, 10)}</button>
                          <div className="text-xs text-muted-foreground">Block {item.blockNumber} · {item.confirmations} conf</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-mono text-xs">from {shortValue(item.fromAddress)}</div>
                          <div className="font-mono text-xs text-muted-foreground">to {shortValue(item.toAddress)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">Detected {formatDateTime(item.createdAt)}</div>
                          {item.creditedAt && <div className="text-xs text-success">Credited {formatDateTime(item.creditedAt)}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredChainDeposits.length === 0 && <TableRow><TableCell colSpan={6} className="h-32 text-center text-muted-foreground">No on-chain credits</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
          <AdminListPagination pagination={pagination} loading={loading} onPageChange={setPage} className="mt-4" />

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1"><DatabaseIcon className="size-3.5" />Ledger total {data.summary.ledgerCount}</span>
            <span className="rounded-full bg-muted px-3 py-1">Deposit orders total {data.summary.depositOrderCount}</span>
            <span className="rounded-full bg-muted px-3 py-1">On-chain records total {data.summary.chainDepositCount}</span>
            <span className="rounded-full bg-muted px-3 py-1">Total user spending {formatUsdt(data.summary.totalSpent)}</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Deposit Correction</DialogTitle>
            <DialogDescription>
              For handling amount collisions and incorrect credits under a unified deposit address. Preview the impact first, then execute after confirming.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-[1.4fr_0.7fr]">
            <div className="space-y-3">
              <div className="grid gap-2">
                <Label htmlFor="correction-tx">Transaction Hash</Label>
                <Input
                  id="correction-tx"
                  value={correctionTxHash}
                  onChange={(event) => { setCorrectionTxHash(event.target.value); resetCorrectionPreview(); }}
                  placeholder="0x..."
                  className="font-mono"
                />
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="correction-log-index">LogIndex (optional)</Label>
                  <Input
                    id="correction-log-index"
                    value={correctionLogIndex}
                    onChange={(event) => { setCorrectionLogIndex(event.target.value); resetCorrectionPreview(); }}
                    placeholder="Fill when there are multiple Transfers"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="correction-target">Correct Recipient</Label>
                  <Input
                    id="correction-target"
                    value={correctionTarget}
                    onChange={(event) => { setCorrectionTarget(event.target.value); resetCorrectionPreview(); }}
                    placeholder="Telegram ID or @username"
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="correction-note">Note (optional)</Label>
                <Input
                  id="correction-note"
                  value={correctionNote}
                  onChange={(event) => setCorrectionNote(event.target.value)}
                  placeholder="Leave blank to auto-generate correction note"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void previewCorrection()} disabled={correctionLoading || !correctionTxHash.trim() || !correctionTarget.trim()}>
                <SearchIcon data-icon="inline-start" className={correctionLoading ? "animate-spin" : undefined} />
                {correctionLoading ? "Previewing..." : "Preview Correction"}
              </Button>
            </div>

            <div className="rounded-2xl border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
              <div className="mb-2 flex items-center gap-2 font-semibold text-warning">
                <AlertTriangleIcon className="size-4" />
                Safety Rules
              </div>
              <ul className="list-disc space-y-1 pl-4">
                <li>The system re-verifies wallet, order, ledger, and tx state before execution.</li>
                <li>Will not execute if the incorrect user has insufficient balance.</li>
                <li>Will not execute if CONFIRM input is wrong; please copy the correct CONFIRM.</li>
                <li>Only process transactions confirmed with the user.</li>
              </ul>
            </div>
          </div>

          {correctionPreview && (
            <div className="space-y-4 rounded-3xl border border-border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold">Correction Preview</div>
                  <div className="font-mono text-xs text-muted-foreground">{shortValue(correctionPreview.tx.txHash, 14, 12)} · logIndex {correctionPreview.tx.logIndex}</div>
                </div>
                <Badge variant={correctionPreview.plan.canExecute ? "default" : "destructive"}>
                  {correctionPreview.plan.canExecute ? "Executable" : "Not Executable"}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">On-chain Amount</div>
                  <div className="mt-1 text-lg font-semibold">{formatUsdt(correctionPreview.tx.amount)}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">from {shortValue(correctionPreview.tx.fromAddress)}</div>
                </div>
                <div className="rounded-2xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">Current Incorrect Owner</div>
                  <div className="mt-1 font-semibold">{userLabel(correctionPreview.current)}</div>
                  <div className="text-xs text-muted-foreground">Available {formatUsdt(correctionPreview.current.availableBalance)} → {formatUsdt(correctionPreview.plan.debit.afterAvailable)}</div>
                  <div className="text-xs text-muted-foreground">Total deposited {formatUsdt(correctionPreview.current.totalDeposited)} → {formatUsdt(correctionPreview.plan.debit.afterTotalDeposited)}</div>
                </div>
                <div className="rounded-2xl bg-background p-3">
                  <div className="text-xs text-muted-foreground">Correct Recipient</div>
                  <div className="mt-1 font-semibold">{userLabel(correctionPreview.target)}</div>
                  <div className="text-xs text-muted-foreground">Available {formatUsdt(correctionPreview.target.availableBalance)} → {formatUsdt(correctionPreview.plan.credit.afterAvailable)}</div>
                  <div className="text-xs text-muted-foreground">Total deposited {formatUsdt(correctionPreview.target.totalDeposited)} → {formatUsdt(correctionPreview.plan.credit.afterTotalDeposited)}</div>
                </div>
              </div>

              <div className="grid gap-2 text-sm">
                <div className="rounded-2xl bg-background p-3">{correctionPreview.plan.wrongOrderAction}</div>
                <div className="rounded-2xl bg-background p-3">{correctionPreview.plan.chainDepositAction}</div>
                <div className="rounded-2xl bg-background p-3">{correctionPreview.plan.ledgerAction}</div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="correction-target-order">Target Deposit Order Binding</Label>
                <select
                  id="correction-target-order"
                  value={correctionTargetOrderId}
                  onChange={(event) => { setCorrectionTargetOrderId(event.target.value); setCorrectionPreview(null); setCorrectionConfirmText(""); }}
                  className="h-10 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Do not bind order, credit balance by TX only</option>
                  {correctionPreview.candidateOrders.map((order) => (
                    <option key={order.id} value={order.id} disabled={!order.canBind}>
                      {order.orderNo} · {order.status} · Pay {formatUsdt(order.payAmount)}{order.canBind ? "" : " · Already paid by another TX"}
                    </option>
                  ))}
                </select>
                <div className="text-xs text-muted-foreground">After switching the binding target, click &quot;Preview Correction&quot; again.</div>
              </div>

              {(correctionPreview.plan.errors.length > 0 || correctionPreview.plan.warnings.length > 0) && (
                <div className="space-y-2">
                  {correctionPreview.plan.errors.map((item) => (
                    <div key={item} className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{item}</div>
                  ))}
                  {correctionPreview.plan.warnings.map((item) => (
                    <div key={item} className="rounded-2xl border border-warning/30 bg-warning/5 p-3 text-sm text-warning">{item}</div>
                  ))}
                </div>
              )}

              <div className="grid gap-2">
                <Label htmlFor="correction-confirm">Confirm Text</Label>
                <Input
                  id="correction-confirm"
                  value={correctionConfirmText}
                  onChange={(event) => setCorrectionConfirmText(event.target.value)}
                  placeholder="Type CONFIRM to proceed"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCorrectionOpen(false)} disabled={correctionExecuting}>Close</Button>
            <Button
              type="button"
              disabled={!correctionPreview?.plan.canExecute || correctionConfirmText !== "CONFIRM" || correctionExecuting}
              onClick={() => void executeCorrection()}
            >
              {correctionExecuting ? <RefreshCwIcon data-icon="inline-start" className="animate-spin" /> : <CheckCircle2Icon data-icon="inline-start" />}
              {correctionExecuting ? "Executing..." : "Confirm Correction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppFrame>
  );
}
