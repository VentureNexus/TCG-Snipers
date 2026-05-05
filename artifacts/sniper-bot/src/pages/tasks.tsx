import { Fragment, useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  useListTasks,
  useStartAllTasks,
  useStopAllTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  useStartTask,
  useStopTask,
  useListProfiles,
  useListTaskGroups,
  useListProxies,
  getListTasksQueryKey,
  SUPPORTED_RETAILERS,
} from "@workspace/api-client-react";
import type { Task, Profile, SupportedRetailer, BulkActionResult } from "@workspace/api-client-react";
import { isProfileIncomplete } from "./profiles";
import { ProductThumbnail } from "@/components/shared/ProductThumbnail";
import { Button } from "@/components/ui/button";
import {
  Play,
  Square,
  Plus,
  Trash2,
  StopCircle,
  ListChecks,
  ChevronDown,
  ChevronRight,
  Copy,
  X,
  Loader2,
  Pencil,
  ArrowDown,
  AlertTriangle,
  Info,
} from "lucide-react";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
import { SystemPerformanceGraph } from "@/components/shared/SystemPerformanceGraph";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, useWatch } from "react-hook-form";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useTaskLogs, type TaskLogEntry, type RetryProgress } from "@/hooks/useTaskLogs";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";

const NO_PROXY_SENTINEL = "__none__";

const TASK_PRIORITIES = [1, 2, 3] as const;
type TaskPriority = (typeof TASK_PRIORITIES)[number];

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; cls: string }> = {
  1: { label: "High",   cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  2: { label: "Normal", cls: "text-muted-foreground bg-muted/30 border-border/40" },
  3: { label: "Low",    cls: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const taskSchema = z.object({
  retailer: z.enum(SUPPORTED_RETAILERS),
  productUrl: z.string().optional(),
  productKeywords: z.string().optional(),
  profileId: z.coerce.number().min(1, "Required"),
  proxyId: z.string().optional(),
  groupId: z.string().optional(),
  priority: z.coerce.number().int().default(2),
  quantity: z.coerce.number().min(1).default(1),
  monitorDelay: z.coerce.number().min(1).default(200),
  monitorDelayMax: z.coerce.number().min(1).default(800),
  retryCount: z.coerce.number().min(-1).default(3),
  maxPrice: z.coerce.number().min(0).optional(),
  stopAfterHours: z.coerce.number().min(0.1).optional(),
  stopAtTime: z.string().optional(),
}).refine(
  (data) => data.monitorDelayMax > data.monitorDelay,
  { message: "Min must be less than Max", path: ["monitorDelayMax"] },
);

type TaskFormValues = z.infer<typeof taskSchema>;

function formValuesToPayload(values: TaskFormValues) {
  const isUnlimited = values.retryCount === -1;
  return {
    retailer: values.retailer,
    productUrl: values.productUrl,
    productKeywords: values.productKeywords,
    profileId: values.profileId,
    proxyId: values.proxyId && values.proxyId !== NO_PROXY_SENTINEL
      ? Number(values.proxyId)
      : undefined,
    groupId: values.groupId && values.groupId !== "0"
      ? Number(values.groupId)
      : undefined,
    priority: values.priority ?? 2,
    quantity: values.quantity,
    monitorDelay: values.monitorDelay,
    monitorDelayMax: values.monitorDelayMax,
    retryCount: values.retryCount,
    maxPrice: values.maxPrice !== undefined && values.maxPrice !== null
      ? Math.round(values.maxPrice * 100)
      : undefined,
    stopAfterMs: isUnlimited && values.stopAfterHours
      ? Math.round(values.stopAfterHours * 3_600_000)
      : null,
    stopAtTime: isUnlimited && values.stopAtTime ? values.stopAtTime : null,
  };
}

function taskToFormValues(task: Task): TaskFormValues {
  return {
    retailer: task.retailer as SupportedRetailer,
    productUrl: task.productUrl ?? "",
    productKeywords: task.productKeywords ?? "",
    profileId: task.profileId ?? 0,
    proxyId: task.proxyId != null ? String(task.proxyId) : NO_PROXY_SENTINEL,
    groupId: task.groupId != null ? String(task.groupId) : "0",
    priority: (TASK_PRIORITIES.includes(task.priority as TaskPriority) ? task.priority : 2) as TaskPriority,
    quantity: task.quantity,
    monitorDelay: task.monitorDelay,
    monitorDelayMax: task.monitorDelayMax ?? 800,
    retryCount: task.retryCount,
    maxPrice: task.maxPrice != null ? task.maxPrice / 100 : undefined,
    stopAfterHours: task.stopAfterMs != null && !task.stopAtTime
      ? task.stopAfterMs / 3_600_000
      : undefined,
    stopAtTime: task.stopAtTime ?? undefined,
  };
}

function TimeLimitBadge({ task, isRunning }: { task: Task; isRunning: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning || (!task.stopAfterMs && !task.stopAtTime)) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [isRunning, task.stopAfterMs, task.stopAtTime]);

  if (!isRunning) return null;

  if (task.stopAtTime) {
    const [h, m] = task.stopAtTime.split(":").map(Number);
    const target = new Date(now);
    target.setHours(h, m, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    const remainingMs = target.getTime() - now;
    const totalMins = Math.floor(remainingMs / 60000);
    const rh = Math.floor(totalMins / 60);
    const rm = totalMins % 60;
    const remaining = rh > 0 ? `${rh}h ${rm}m` : `${rm}m`;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-mono text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5 rounded"
        data-testid={`time-limit-badge-${task.id}`}
      >
        ⏱ stops at {task.stopAtTime} ({remaining})
      </span>
    );
  }

  if (task.stopAfterMs) {
    const startedAtMs = task.startedAt ? new Date(task.startedAt).getTime() : null;
    if (startedAtMs !== null) {
      const deadline = startedAtMs + task.stopAfterMs;
      const remainingMs = Math.max(0, deadline - now);
      const totalSecs = Math.floor(remainingMs / 1000);
      const rh = Math.floor(totalSecs / 3600);
      const rm = Math.floor((totalSecs % 3600) / 60);
      const rs = totalSecs % 60;
      const remaining = rh > 0
        ? `${rh}h ${rm}m`
        : rm > 0
          ? `${rm}m ${rs}s`
          : `${rs}s`;
      const stopTime = new Date(deadline);
      const stopLabel = stopTime.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5 rounded"
          data-testid={`time-limit-badge-${task.id}`}
        >
          ⏱ stops at {stopLabel} ({remaining})
        </span>
      );
    }
    const totalMins = Math.round(task.stopAfterMs / 60000);
    const lh = Math.floor(totalMins / 60);
    const lm = totalMins % 60;
    const label = lh > 0 ? (lm > 0 ? `${lh}h ${lm}m limit` : `${lh}h limit`) : `${lm}m limit`;
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-mono text-sky-400 bg-sky-400/10 border border-sky-400/20 px-1.5 py-0.5 rounded"
        data-testid={`time-limit-badge-${task.id}`}
      >
        ⏱ {label}
      </span>
    );
  }

  return null;
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; dot?: string }> = {
  idle: { label: "IDLE", cls: "status-idle" },
  monitoring: { label: "MONITORING", cls: "status-monitoring", dot: "animate-pulse" },
  adding_to_cart: { label: "ADDING TO CART", cls: "status-cart", dot: "animate-pulse" },
  checking_out: { label: "CHECKING OUT", cls: "status-checkout", dot: "animate-pulse" },
  success: { label: "SUCCESS", cls: "status-success" },
  failed: { label: "FAILED", cls: "status-failed" },
  stopped: { label: "STOPPED", cls: "status-stopped" },
};

const LOG_COLORS: Record<string, string> = {
  INFO: "text-foreground/80",
  SUCCESS: "text-emerald-400",
  WARN: "text-yellow-400",
  ERROR: "text-red-400",
};

const RETRY_ACTIVE_STATUSES = new Set(["monitoring"]);

function TaskRetryBadge({
  taskId,
  retryProgress,
  liveStatus,
}: {
  taskId: number;
  retryProgress: RetryProgress | null;
  liveStatus: string | null;
}) {
  if (!retryProgress || retryProgress.attempt <= 0) return null;
  if (liveStatus && !RETRY_ACTIVE_STATUSES.has(liveStatus)) return null;
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-mono text-orange-400 bg-orange-400/10 border border-orange-400/20 px-1.5 py-0.5 rounded"
      data-testid={`badge-row-retry-progress-${taskId}`}
    >
      Retry {retryProgress.attempt} of {retryProgress.total === null ? "∞" : retryProgress.total}
    </span>
  );
}

function LogPanel({
  taskId,
  enabled,
  logs,
  liveStatus,
  retryProgress,
  isReconnecting,
  clear,
  copyLogs,
}: {
  taskId: number;
  enabled: boolean;
  logs: TaskLogEntry[];
  liveStatus: string | null;
  retryProgress: RetryProgress | null;
  isReconnecting: boolean;
  clear: () => void;
  copyLogs: () => void;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    if (isAtBottom) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, isAtBottom]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
  }, []);

  const handleCopy = () => {
    copyLogs();
    toast({ title: "Logs copied to clipboard" });
  };

  return (
    <div className="bg-black/60 border-t border-border/30 rounded-b-lg">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/20">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Task Log</span>
          {retryProgress && retryProgress.attempt > 0 && (!liveStatus || RETRY_ACTIVE_STATUSES.has(liveStatus)) && (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded" data-testid={`badge-retry-progress-${taskId}`}>
              Retry {retryProgress.attempt} of {retryProgress.total === null ? "∞" : retryProgress.total}
            </span>
          )}
          {isReconnecting && (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded" data-testid={`badge-reconnecting-${taskId}`}>
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              Reconnecting…
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={handleCopy} data-testid={`button-copy-logs-${taskId}`} title="Copy logs">
            <Copy className="w-3 h-3" />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={clear} data-testid={`button-clear-logs-${taskId}`} title="Clear logs">
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
      <div className="relative">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="h-48 overflow-y-auto p-3 font-mono text-xs space-y-0.5"
          data-testid={`log-panel-${taskId}`}
        >
          {logs.length === 0 ? (
            <div className="text-muted-foreground/50 text-center py-4">
              {enabled ? "Waiting for log output..." : "Start task to see logs"}
            </div>
          ) : (
            logs.map((entry: TaskLogEntry, i: number) => (
              <div key={i} className="flex gap-2 leading-5">
                <span className="text-muted-foreground/40 shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className={`font-bold w-10 shrink-0 ${LOG_COLORS[entry.level] ?? "text-foreground"}`}>{entry.level}</span>
                <span className={`flex-1 break-all ${LOG_COLORS[entry.level] ?? "text-foreground/80"}`}>{entry.message}</span>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>
        {!isAtBottom && (
          <button
            onClick={scrollToBottom}
            className="absolute bottom-2 right-3 flex items-center gap-1 bg-primary/80 hover:bg-primary text-primary-foreground text-xs font-mono px-2 py-1 rounded shadow-lg transition-colors"
            data-testid={`button-scroll-bottom-${taskId}`}
            title="Scroll to bottom"
          >
            <ArrowDown className="w-3 h-3" />
            Bottom
          </button>
        )}
      </div>
    </div>
  );
}


function TaskRow({
  task,
  isExpanded,
  profiles,
  onToggle,
  onStatusChange,
  onStart,
  onStop,
  onDelete,
  onEdit,
}: {
  task: Task;
  isExpanded: boolean;
  profiles: Profile[];
  onToggle: () => void;
  onStatusChange: (s: string) => void;
  onStart: () => void;
  onStop: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const baseIsRunning = !["idle", "stopped", "failed", "success"].includes(task.status);
  const logsEnabled = baseIsRunning || isExpanded;
  const { logs, liveStatus, retryProgress, isReconnecting, clear, copyLogs } = useTaskLogs(task.id, logsEnabled);

  const onStatusChangeRef = useRef(onStatusChange);
  useEffect(() => { onStatusChangeRef.current = onStatusChange; });
  useEffect(() => {
    if (liveStatus) onStatusChangeRef.current(liveStatus);
  }, [liveStatus]);

  const effectiveStatus = liveStatus ?? task.status;
  const isRunning = !["idle", "stopped", "failed", "success"].includes(effectiveStatus);
  const canStart = ["idle", "stopped", "failed"].includes(effectiveStatus);
  const cfg = STATUS_CONFIG[effectiveStatus] ?? STATUS_CONFIG["idle"];

  return (
    <Fragment>
      <tr
        className={`border-b ${isExpanded ? "" : "border-border/50"} hover:bg-muted/20 transition-colors group cursor-pointer`}
        onClick={onToggle}
        data-testid={`row-task-${task.id}`}
      >
        <td className="px-3 py-3 text-muted-foreground/50">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">#{task.id}</td>
        <td className="px-4 py-3"><RetailerBadge retailer={task.retailer} /></td>
        <td className="px-4 py-3 max-w-[220px]" title={task.productUrl ?? task.productKeywords ?? ""}>
          <div className="flex items-center gap-2">
            {task.productUrl && <ProductThumbnail fallbackUrl={task.productUrl} className="w-8 h-8 rounded object-cover bg-muted shrink-0" />}
            <div className="min-w-0">
              <div className="truncate font-mono text-xs text-primary/80">{task.productUrl || task.productKeywords || "-"}</div>
              {task.maxPrice != null && (
                <div className="text-amber-400/80 font-mono text-[10px] mt-0.5" data-testid={`max-price-${task.id}`}>≤ ${(task.maxPrice / 100).toFixed(2)}</div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-muted-foreground">
          {(() => {
            const profile = profiles.find((p) => p.id === task.profileId);
            return (
              <div className="flex items-center gap-1.5">
                <span>{profile?.name ?? "Unknown"}</span>
                {profile && isProfileIncomplete(profile) && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent>Profile is missing shipping details</TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })()}
        </td>
        <td className="px-4 py-3">
          {(() => {
            const raw = typeof task.priority === "string"
              ? ({ high: 1, normal: 2, low: 3 } as Record<string, number>)[task.priority] ?? 2
              : task.priority;
            const p = (TASK_PRIORITIES.includes(raw as TaskPriority) ? raw : 2) as TaskPriority;
            const pcfg = PRIORITY_CONFIG[p];
            return (
              <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded border ${pcfg.cls}`} data-testid={`priority-badge-${task.id}`}>
                {pcfg.label}
              </span>
            );
          })()}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground" data-testid={`retries-task-${task.id}`}>
          {task.retryCount === -1 ? "∞" : task.retryCount}
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col items-start gap-1">
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs font-mono tracking-wide ${cfg.cls}`} data-testid={`status-task-${task.id}`}>
              {cfg.dot && <span className={`w-1.5 h-1.5 rounded-full bg-current ${cfg.dot}`} />}
              {cfg.label}
            </span>
            <TimeLimitBadge task={task} isRunning={isRunning} />
            <TaskRetryBadge taskId={task.id} retryProgress={retryProgress} liveStatus={liveStatus} />
          </div>
        </td>
        <td className="px-4 py-3 text-right space-x-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          {canStart ? (
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
              data-testid={`button-start-task-${task.id}`}
              onClick={onStart}
            >
              <Play className="w-4 h-4 fill-current" />
            </Button>
          ) : (
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10"
              data-testid={`button-stop-task-${task.id}`}
              onClick={onStop}
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10"
            data-testid={`button-edit-task-${task.id}`}
            onClick={onEdit}
            disabled={isRunning}
            title="Edit task"
          >
            <Pencil className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost" size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            data-testid={`button-delete-task-${task.id}`}
            onClick={onDelete}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="border-b border-border/50">
          <td colSpan={9} className="p-0">
            <LogPanel
              taskId={task.id}
              enabled={logsEnabled}
              logs={logs}
              liveStatus={liveStatus}
              retryProgress={retryProgress}
              isReconnecting={isReconnecting}
              clear={clear}
              copyLogs={copyLogs}
            />
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function TaskFormFields({
  form,
  profiles,
  groups,
  proxies,
}: {
  form: ReturnType<typeof useForm<TaskFormValues>>;
  profiles: Profile[];
  groups: { id: number; name: string }[];
  proxies: { id: number; label: string }[];
}) {
  const selectedProfileId = useWatch({ control: form.control, name: "profileId" });
  const selectedProfile = profiles.find((p) => p.id === Number(selectedProfileId));
  const retryCountValue = useWatch({ control: form.control, name: "retryCount" });
  const stopAtTimeValue = useWatch({ control: form.control, name: "stopAtTime" });
  const [isUnlimited, setIsUnlimited] = useState(retryCountValue === -1);
  const [prevRetryCount, setPrevRetryCount] = useState(retryCountValue === -1 ? 3 : (retryCountValue ?? 3));
  const [stopMode, setStopMode] = useState<"hours" | "time">(() =>
    form.getValues("stopAtTime") ? "time" : "hours"
  );

  useEffect(() => {
    if (retryCountValue === -1) {
      setIsUnlimited(true);
    } else if (retryCountValue >= 0) {
      setIsUnlimited(false);
    }
  }, [retryCountValue]);

  useEffect(() => {
    if (stopAtTimeValue) {
      setStopMode("time");
    } else {
      setStopMode("hours");
    }
  }, [stopAtTimeValue]);
  const selectedIncomplete = selectedProfile ? isProfileIncomplete(selectedProfile) : false;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="retailer"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Retailer</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger data-testid="select-retailer">
                    <SelectValue placeholder="Select Retailer" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {SUPPORTED_RETAILERS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="profileId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Profile</FormLabel>
              <Select onValueChange={field.onChange} value={field.value?.toString()}>
                <FormControl>
                  <SelectTrigger data-testid="select-profile">
                    <SelectValue placeholder="Select Profile" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id.toString()}>
                      <span className="flex items-center gap-1.5">
                        {isProfileIncomplete(p) && (
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                        )}
                        {p.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedIncomplete && (
                <p className="flex items-center gap-1.5 text-xs text-yellow-500 mt-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  This profile is missing required shipping details — fix the profile before saving this task.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name="productUrl"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Product URL</FormLabel>
            <FormControl>
              <Input placeholder="https://..." data-testid="input-product-url" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name="productKeywords"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Keywords (if no URL)</FormLabel>
            <FormControl>
              <Input placeholder="+ps5, +console" data-testid="input-keywords" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="priority"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Priority</FormLabel>
            <Select onValueChange={(v) => field.onChange(Number(v))} value={String(field.value ?? 2)}>
              <FormControl>
                <SelectTrigger data-testid="select-priority">
                  <SelectValue placeholder="Normal" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {TASK_PRIORITIES.map((p) => (
                  <SelectItem key={p} value={String(p)}>
                    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-1.5 py-0.5 rounded border ${PRIORITY_CONFIG[p].cls}`}>
                      {PRIORITY_CONFIG[p].label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Used to determine which tasks are stopped first when RAM guard triggers auto-stop.</p>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="groupId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Task Group (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? "0"}>
                <FormControl>
                  <SelectTrigger data-testid="select-group">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="0">None</SelectItem>
                  {groups.map((g) => <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="proxyId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Proxy List (Optional)</FormLabel>
              <Select onValueChange={field.onChange} value={field.value ?? NO_PROXY_SENTINEL}>
                <FormControl>
                  <SelectTrigger data-testid="select-proxy">
                    <SelectValue placeholder="No Proxy" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value={NO_PROXY_SENTINEL}>No Proxy</SelectItem>
                  {proxies.map((p) => <SelectItem key={p.id} value={p.id.toString()}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Qty</FormLabel>
              <FormControl><Input type="number" data-testid="input-quantity" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="maxPrice"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Max Price ($) <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
              <FormControl><Input type="number" step="0.01" min="0" placeholder="No limit" data-testid="input-max-price" {...field} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="monitorDelay"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                Min Delay (ms)
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Minimum wait between stock checks. The bot picks a random delay between Min and Max each check. Recommended: 200–800ms.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <FormControl><Input type="number" min={1} data-testid="input-delay-min" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="monitorDelayMax"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                Max Delay (ms)
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[220px] text-xs">
                      Maximum wait between stock checks. Recommended: 200–800ms. Values under 150ms may trigger bot detection.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <FormControl><Input type="number" min={1} data-testid="input-delay-max" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      <p className="text-xs text-muted-foreground -mt-2">Recommended: 200–800ms. Values under 150ms may trigger bot detection on some retailers.</p>

      <div className="grid grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="retryCount"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="flex items-center gap-1">
                Retries
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-[240px] text-xs">
                      Maximum number of re-checks after the first attempt. e.g. 3 = 4 total stock checks. Set to Unlimited to keep retrying until the item is found or the task is stopped.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </FormLabel>
              <FormControl>
                <Input
                  type="number"
                  data-testid="input-retries"
                  disabled={isUnlimited}
                  {...field}
                  value={isUnlimited ? "" : field.value}
                  onChange={(e) => {
                    field.onChange(e);
                    const parsed = parseInt(e.target.value, 10);
                    if (Number.isFinite(parsed) && parsed >= 0) setPrevRetryCount(parsed);
                  }}
                />
              </FormControl>
              <div className="flex items-center gap-2 mt-1.5">
                <Checkbox
                  id="unlimited-retries"
                  checked={isUnlimited}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      const safeVal = Number.isFinite(field.value) && field.value >= 0 ? Math.round(field.value) : 3;
                      setPrevRetryCount(safeVal);
                      form.setValue("retryCount", -1);
                      setIsUnlimited(true);
                    } else {
                      const restore = Number.isFinite(prevRetryCount) && prevRetryCount >= 0 ? prevRetryCount : 3;
                      form.setValue("retryCount", restore);
                      form.setValue("stopAfterHours", undefined);
                      form.setValue("stopAtTime", undefined);
                      setIsUnlimited(false);
                      setStopMode("hours");
                    }
                  }}
                />
                <label htmlFor="unlimited-retries" className="text-sm text-muted-foreground cursor-pointer select-none">
                  Unlimited
                </label>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        {isUnlimited && (
          <div className="col-span-2 space-y-2">
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm font-medium leading-none">Auto-stop</span>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px] text-xs">
                    Optionally stop the task after a set duration or at a specific wall-clock time. Leave blank to run indefinitely.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex gap-1 p-0.5 bg-muted/40 border border-border/40 rounded-md w-fit">
              <button
                type="button"
                data-testid="stop-mode-hours"
                onClick={() => {
                  setStopMode("hours");
                  form.setValue("stopAtTime", undefined);
                }}
                className={`px-3 py-1 text-xs rounded transition-colors ${stopMode === "hours" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Duration
              </button>
              <button
                type="button"
                data-testid="stop-mode-time"
                onClick={() => {
                  setStopMode("time");
                  form.setValue("stopAfterHours", undefined);
                }}
                className={`px-3 py-1 text-xs rounded transition-colors ${stopMode === "time" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                At time
              </button>
            </div>
            {stopMode === "hours" ? (
              <FormField
                control={form.control}
                name="stopAfterHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Stop after (hours)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.5"
                        min="0.1"
                        placeholder="No limit"
                        data-testid="input-stop-after-hours"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : e.target.valueAsNumber)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                control={form.control}
                name="stopAtTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Stop at (wall-clock time)</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        data-testid="input-stop-at-time"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value || undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TasksPage() {
  const { data: tasks = [] } = useListTasks(undefined, {
    query: { refetchInterval: 3000, queryKey: getListTasksQueryKey() },
  });
  const startAll = useStartAllTasks();
  const stopAll = useStopAllTasks();
  const startTask = useStartTask();
  const stopTask = useStopTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useListProfiles();
  const { data: groups = [] } = useListTaskGroups();
  const { data: proxies = [] } = useListProxies();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<number | null>(null);
  const [liveStatuses, setLiveStatuses] = useState<Record<number, string>>({});
  const { toast } = useToast();

  const createForm = useForm<TaskFormValues, unknown, TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { productUrl: "", productKeywords: "", quantity: 1, monitorDelay: 200, monitorDelayMax: 800, retryCount: 3 },
  });

  const editForm = useForm<TaskFormValues, unknown, TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues: { productUrl: "", productKeywords: "", quantity: 1, monitorDelay: 200, monitorDelayMax: 800, retryCount: 3 },
  });

  const createProfileId = useWatch({ control: createForm.control, name: "profileId" });
  const editProfileId = useWatch({ control: editForm.control, name: "profileId" });

  const createSelectedProfile = profiles.find((p) => p.id === Number(createProfileId));
  const editSelectedProfile = profiles.find((p) => p.id === Number(editProfileId));

  const isCreateProfileIncomplete = createSelectedProfile ? isProfileIncomplete(createSelectedProfile) : false;
  const isEditProfileIncomplete = editSelectedProfile ? isProfileIncomplete(editSelectedProfile) : false;

  const openEdit = (task: Task) => {
    editForm.reset(taskToFormValues(task));
    setEditingTask(task);
  };

  const onCreateSubmit = (values: TaskFormValues) => {
    const chosenProfile = profiles.find((p) => p.id === values.profileId);
    if (chosenProfile && isProfileIncomplete(chosenProfile)) {
      createForm.setError("profileId", { message: "Complete the shipping details on this profile before assigning it." });
      return;
    }
    createTask.mutate(
      { data: formValuesToPayload(values) },
      {
        onSuccess: () => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          createForm.reset();
        },
        onError: (err: unknown) => toast({ title: "Failed to create task", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };

  const onEditSubmit = (values: TaskFormValues) => {
    if (!editingTask) return;
    const chosenProfile = profiles.find((p) => p.id === values.profileId);
    if (chosenProfile && isProfileIncomplete(chosenProfile)) {
      editForm.setError("profileId", { message: "Complete the shipping details on this profile before assigning it." });
      return;
    }
    updateTask.mutate(
      {
        id: editingTask.id,
        data: {
          ...formValuesToPayload(values),
          maxPrice: values.maxPrice !== undefined && values.maxPrice !== null
            ? Math.round(values.maxPrice * 100)
            : null,
        },
      },
      {
        onSuccess: () => {
          setEditingTask(null);
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        },
        onError: (err: unknown) => toast({ title: "Failed to save task", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };

  const getStatus = (task: { id: number; status: string }) =>
    liveStatuses[task.id] ?? task.status;

  const handleStatusChange = useCallback(
    (taskId: number) => (status: string) => {
      setLiveStatuses((prev) => ({ ...prev, [taskId]: status }));
      queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
    },
    [queryClient],
  );

  const activeTasks = tasks.filter(
    (t) => !["idle", "stopped", "failed", "success"].includes(getStatus(t)),
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            onClick={() => startAll.mutate(undefined, {
              onSuccess: (data: BulkActionResult) => {
                queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
                if (data?.skipped && data.skipped > 0) {
                  toast({ title: `${data.skipped} task${data.skipped !== 1 ? "s" : ""} skipped`, description: "Some profiles are missing required shipping fields. Edit those profiles to complete the address before starting.", variant: "destructive" });
                }
              },
              onError: (err: unknown) => toast({ title: "Failed to start all tasks", description: err instanceof Error ? err.message : undefined, variant: "destructive" })
            })}
            data-testid="button-start-all-tasks"
            className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white border-none"
            disabled={startAll.isPending}
          >
            {startAll.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            Start All
          </Button>
          <Button
            onClick={() => stopAll.mutate(undefined, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }), onError: (err: unknown) => toast({ title: "Failed to stop all tasks", description: err instanceof Error ? err.message : undefined, variant: "destructive" }) })}
            variant="secondary"
            data-testid="button-stop-all-tasks"
            className="gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
            disabled={stopAll.isPending}
          >
            <Square className="w-4 h-4 fill-current" /> Stop All
          </Button>
          {activeTasks > 0 && (
            <span className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20" data-testid="text-active-task-count">
              {activeTasks} running
            </span>
          )}
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-task">
              <Plus className="w-4 h-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px] flex flex-col max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <Form {...createForm}>
              <form onSubmit={createForm.handleSubmit(onCreateSubmit, () => toast({ title: "Please fill in all required fields", variant: "destructive" }))} className="flex flex-col flex-1 min-h-0 gap-4">
                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                  <TaskFormFields form={createForm} profiles={profiles} groups={groups} proxies={proxies} />
                </div>
                <Button type="submit" className="w-full shrink-0" disabled={createTask.isPending || isCreateProfileIncomplete} data-testid="button-submit-create-task">
                  {createTask.isPending ? "Creating..." : "Create Task"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        <Dialog open={editingTask !== null} onOpenChange={(open) => { if (!open) setEditingTask(null); }}>
          <DialogContent className="sm:max-w-[500px] flex flex-col max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Edit Task #{editingTask?.id}</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit, () => toast({ title: "Please fill in all required fields", variant: "destructive" }))} className="flex flex-col flex-1 min-h-0 gap-4">
                <div className="flex-1 overflow-y-auto pr-1 space-y-4">
                  <TaskFormFields form={editForm} profiles={profiles} groups={groups} proxies={proxies} />
                </div>
                <Button type="submit" className="w-full shrink-0" disabled={updateTask.isPending || isEditProfileIncomplete} data-testid="button-submit-edit-task">
                  {updateTask.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <SystemPerformanceGraph />

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 glass-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground uppercase text-xs">
            <tr>
              <th className="px-4 py-3 font-medium w-8"></th>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Retailer</th>
              <th className="px-4 py-3 font-medium">Product / Keywords</th>
              <th className="px-4 py-3 font-medium">Profile</th>
              <th className="px-4 py-3 font-medium">Priority</th>
              <th className="px-4 py-3 font-medium">Retries</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <ListChecks className="w-8 h-8 opacity-20" />
                    <p>No tasks found. Create your first task to start sniping.</p>
                  </div>
                </td>
              </tr>
            ) : (
              tasks.map((task) => {
                const isExpanded = expandedTaskId === task.id;
                return (
                  <TaskRow
                    key={task.id}
                    task={task}
                    isExpanded={isExpanded}
                    profiles={profiles}
                    onToggle={() => setExpandedTaskId(isExpanded ? null : task.id)}
                    onStatusChange={handleStatusChange(task.id)}
                    onStart={() => {
                      const profile = profiles.find((p) => p.id === task.profileId);
                      if (!profile || !profile.shipFirstName || !profile.shipLastName || !profile.shipAddress1 || !profile.shipCity || !profile.shipState || !profile.shipZip) {
                        toast({ title: "Profile incomplete", description: "This profile is missing required shipping fields. Edit the profile and fill in the shipping address before starting.", variant: "destructive" });
                        return;
                      }
                      startTask.mutate({ id: task.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); setExpandedTaskId(task.id); }, onError: (err: unknown) => toast({ title: "Failed to start task", description: err instanceof Error ? err.message : undefined, variant: "destructive" }) });
                    }}
                    onStop={() => stopTask.mutate({ id: task.id }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); setLiveStatuses((prev) => ({ ...prev, [task.id]: "stopped" })); }, onError: (err: unknown) => toast({ title: "Failed to stop task", description: err instanceof Error ? err.message : undefined, variant: "destructive" }) })}
                    onDelete={() => deleteTask.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }), onError: (err: unknown) => toast({ title: "Failed to delete task", description: err instanceof Error ? err.message : undefined, variant: "destructive" }) })}
                    onEdit={() => openEdit(task)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
