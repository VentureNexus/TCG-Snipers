import { useState, useEffect } from "react";
import {
  useListProxies,
  useCreateProxy,
  useUpdateProxy,
  useDeleteProxy,
  useTestProxy,
  getListProxiesQueryKey,
} from "@workspace/api-client-react";
import type { Proxy, ProxyTestResult } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Globe,
  Plus,
  Trash2,
  Pencil,
  MoreVertical,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Search,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const proxySchema = z.object({
  label: z.string().optional(),
  host: z.string().min(1, "Host is required"),
  port: z.string().min(1, "Port is required"),
  username: z.string().optional(),
  password: z.string().optional(),
});

type ProxyFormValues = z.infer<typeof proxySchema>;

interface TestResult {
  success: boolean;
  latency: string;
  ip: string;
  message: string;
}

/** Strip any trailing "ms" suffix from latency strings returned by the backend. */
function fmtLatency(latency: string): string {
  return latency.endsWith("ms") ? latency.slice(0, -2) : latency;
}

function StatusChip({
  status,
  latency,
}: {
  status: string;
  latency: string;
}) {
  if (status === "pass") {
    return (
      <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10">
        <CheckCircle2 className="w-3 h-3" />
        Pass · {fmtLatency(latency)}ms
      </Badge>
    );
  }
  if (status === "fail") {
    return (
      <Badge className="gap-1.5 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/10">
        <XCircle className="w-3 h-3" />
        Fail
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1.5 text-muted-foreground">
      <Clock className="w-3 h-3" />
      Untested
    </Badge>
  );
}

interface ProxyFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProxy: Proxy | null;
}

function ProxyFormDialog({ open, onOpenChange, editingProxy }: ProxyFormDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createProxy = useCreateProxy();
  const updateProxy = useUpdateProxy();

  const isEditing = !!editingProxy;
  const isPending = createProxy.isPending || updateProxy.isPending;

  const form = useForm<ProxyFormValues>({
    resolver: zodResolver(proxySchema),
    defaultValues: {
      label: "",
      host: "",
      port: "",
      username: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editingProxy) {
      form.reset({
        label: editingProxy.label ?? "",
        host: editingProxy.host,
        port: editingProxy.port,
        username: editingProxy.username ?? "",
        password: "",
      });
    } else {
      form.reset({ label: "", host: "", port: "", username: "", password: "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingProxy?.id]);

  function onSubmit(values: ProxyFormValues) {
    const base = {
      ...values,
      label: values.label || `${values.host}:${values.port}`,
    };

    // When editing, omit password from the payload if left blank so the
    // stored credential is not overwritten (backend leaves it unchanged).
    const data = isEditing && !values.password
      ? (({ password: _omit, ...rest }) => rest)(base)
      : base;

    if (isEditing && editingProxy) {
      updateProxy.mutate(
        { id: editingProxy.id, data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
            toast({ title: "Proxy updated" });
            onOpenChange(false);
          },
          onError: () => toast({ title: "Failed to update proxy", variant: "destructive" }),
        }
      );
    } else {
      createProxy.mutate(
        { data },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
            toast({ title: "Proxy added" });
            onOpenChange(false);
            form.reset();
          },
          onError: () => toast({ title: "Failed to add proxy", variant: "destructive" }),
        }
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Proxy" : "Add Proxy"}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="label" render={({ field }) => (
              <FormItem>
                <FormLabel>Label <span className="text-muted-foreground text-xs">(optional)</span></FormLabel>
                <FormControl>
                  <Input placeholder="My Residential Proxy" {...field} data-testid="input-proxy-label" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="host" render={({ field }) => (
                <FormItem>
                  <FormLabel>Host / IP</FormLabel>
                  <FormControl>
                    <Input placeholder="192.168.1.1" {...field} data-testid="input-proxy-host" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="port" render={({ field }) => (
                <FormItem>
                  <FormLabel>Port</FormLabel>
                  <FormControl>
                    <Input placeholder="8080" {...field} data-testid="input-proxy-port" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="username" render={({ field }) => (
                <FormItem>
                  <FormLabel>Username</FormLabel>
                  <FormControl>
                    <Input {...field} data-testid="input-proxy-username" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="password" render={({ field }) => (
                <FormItem>
                  <FormLabel>Password{isEditing && <span className="text-muted-foreground text-xs ml-1">(leave blank to keep)</span>}</FormLabel>
                  <FormControl>
                    <Input type="password" {...field} data-testid="input-proxy-password" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <div className="flex gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel-proxy"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1"
                disabled={isPending}
                data-testid="button-save-proxy"
              >
                {isPending ? "Saving..." : isEditing ? "Save Changes" : "Add Proxy"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface BulkImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function BulkImportDialog({ open, onOpenChange }: BulkImportDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createProxy = useCreateProxy();
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  async function handleImport() {
    if (lines.length === 0) return;
    setImporting(true);
    let imported = 0;
    let failed = 0;
    for (const line of lines) {
      const parts = line.split(":");
      if (parts.length < 2) { failed++; continue; }
      await new Promise<void>((resolve) => {
        createProxy.mutate(
          {
            data: {
              host: parts[0],
              port: parts[1],
              username: parts[2] ?? "",
              password: parts[3] ?? "",
              label: line,
            },
          },
          {
            onSuccess: () => { imported++; resolve(); },
            onError: () => { failed++; resolve(); },
          }
        );
      });
    }
    queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
    toast({
      title: "Bulk import complete",
      description: `${imported} added${failed > 0 ? `, ${failed} failed` : ""}`,
    });
    setImporting(false);
    setText("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Bulk Import Proxies</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>
              Paste proxies{" "}
              <span className="text-muted-foreground text-xs font-normal">
                — one per line, format: <code className="font-mono bg-muted/40 px-1 rounded">host:port:user:pass</code>
              </span>
            </Label>
            <Textarea
              className="font-mono text-xs h-44 resize-none"
              placeholder={"192.168.1.1:8080:user:pass\n10.0.0.1:3128:admin:secret"}
              value={text}
              onChange={(e) => setText(e.target.value)}
              data-testid="textarea-bulk-proxies"
            />
            <p className="text-xs text-muted-foreground">
              {lines.length} line{lines.length !== 1 ? "s" : ""} detected
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => { setText(""); onOpenChange(false); }}
              data-testid="button-cancel-bulk"
            >
              Cancel
            </Button>
            <Button
              className="flex-1"
              onClick={handleImport}
              disabled={lines.length === 0 || importing}
              data-testid="button-confirm-bulk-import"
            >
              {importing ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Importing...</>
              ) : (
                `Import ${lines.length} ${lines.length === 1 ? "Proxy" : "Proxies"}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ProxiesPage() {
  const { data: proxies = [], isLoading } = useListProxies();
  const deleteProxy = useDeleteProxy();
  const testProxy = useTestProxy();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingProxy, setEditingProxy] = useState<Proxy | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [testingIds, setTestingIds] = useState<Set<number>>(new Set());
  const [inlineResults, setInlineResults] = useState<Map<number, TestResult>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");

  function openCreate() {
    setEditingProxy(null);
    setFormOpen(true);
  }

  function openEdit(proxy: Proxy) {
    setEditingProxy(proxy);
    setFormOpen(true);
  }

  function handleDelete(id: number) {
    deleteProxy.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
          toast({ title: "Proxy removed" });
          setDeleteConfirmId(null);
          setInlineResults((prev) => {
            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        },
        onError: () => toast({ title: "Failed to delete proxy", variant: "destructive" }),
      }
    );
  }

  function handleTest(proxy: Proxy) {
    setTestingIds((prev) => new Set(prev).add(proxy.id));
    testProxy.mutate(
      { id: proxy.id },
      {
        onSuccess: (result: ProxyTestResult) => {
          queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
          setInlineResults((prev) => {
            const next = new Map(prev);
            next.set(proxy.id, result);
            return next;
          });
          setTestingIds((prev) => {
            const next = new Set(prev);
            next.delete(proxy.id);
            return next;
          });
          if (result.success) {
            toast({ title: `Proxy passed — ${fmtLatency(result.latency)}ms · ${result.ip}` });
          } else {
            toast({ title: "Proxy test failed", description: result.message, variant: "destructive" });
          }
        },
        onError: () => {
          setTestingIds((prev) => {
            const next = new Set(prev);
            next.delete(proxy.id);
            return next;
          });
          toast({ title: "Test request failed", variant: "destructive" });
        },
      }
    );
  }

  const q = searchQuery.trim().toLowerCase();
  const filteredProxies = q
    ? proxies.filter(
        (p) =>
          p.host.toLowerCase().includes(q) ||
          (p.label ?? "").toLowerCase().includes(q)
      )
    : proxies;

  const passCount = filteredProxies.filter((p) => p.lastTestStatus === "pass").length;
  const failCount = filteredProxies.filter((p) => p.lastTestStatus === "fail").length;
  const untestedCount = filteredProxies.filter((p) => !p.lastTestStatus || p.lastTestStatus === "untested").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold">Proxies</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="text-xs text-muted-foreground">{filteredProxies.length}{q ? ` of ${proxies.length}` : ""} total</span>
            {passCount > 0 && (
              <span className="text-xs text-emerald-400">{passCount} passing</span>
            )}
            {failCount > 0 && (
              <span className="text-xs text-red-400">{failCount} failing</span>
            )}
            {untestedCount > 0 && (
              <span className="text-xs text-muted-foreground">{untestedCount} untested</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 text-xs"
            onClick={() => setBulkOpen(true)}
            data-testid="button-bulk-import"
          >
            <Plus className="w-3.5 h-3.5" /> Bulk Paste
          </Button>
          <Button
            size="sm"
            className="gap-2"
            onClick={openCreate}
            data-testid="button-add-proxy"
          >
            <Plus className="w-4 h-4" /> Add Proxy
          </Button>
        </div>
      </div>

      {/* Search */}
      {proxies.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="Search by host or label…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            data-testid="input-search-proxies"
          />
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border/50 overflow-hidden glass-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b border-border/50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Label / Host
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Auth
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Last Result
              </th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {!isLoading && proxies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-3">
                    <Globe className="w-10 h-10 opacity-15" />
                    <p className="font-medium">No proxies configured</p>
                    <p className="text-xs text-muted-foreground/60">
                      Add proxies to avoid IP bans during parallel task runs.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)} data-testid="button-empty-bulk">
                        Bulk Paste
                      </Button>
                      <Button size="sm" onClick={openCreate} data-testid="button-empty-add-proxy">
                        <Plus className="w-4 h-4 mr-1" /> Add Proxy
                      </Button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {proxies.length > 0 && filteredProxies.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Search className="w-8 h-8 opacity-15" />
                    <p className="font-medium">No proxies match "{searchQuery}"</p>
                    <p className="text-xs text-muted-foreground/60">Try a different host or label.</p>
                  </div>
                </td>
              </tr>
            )}
            {filteredProxies.map((proxy) => {
              const isTesting = testingIds.has(proxy.id);
              const inlineResult = inlineResults.get(proxy.id);

              return (
                <tr
                  key={proxy.id}
                  className="hover:bg-muted/20 transition-colors group"
                  data-testid={`row-proxy-${proxy.id}`}
                >
                  {/* Label / Host */}
                  <td className="px-4 py-3">
                    <div className="font-mono text-primary/80 text-sm">
                      {proxy.host}:{proxy.port}
                    </div>
                    {proxy.label && proxy.label !== `${proxy.host}:${proxy.port}` && (
                      <div className="text-xs text-muted-foreground mt-0.5">{proxy.label}</div>
                    )}
                  </td>

                  {/* Auth */}
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {proxy.username ? (
                      <span>{proxy.username}:•••••</span>
                    ) : (
                      <span className="italic opacity-50">No auth</span>
                    )}
                  </td>

                  {/* Status chip */}
                  <td className="px-4 py-3">
                    <StatusChip
                      status={proxy.lastTestStatus ?? ""}
                      latency={proxy.lastTestLatency ?? ""}
                    />
                  </td>

                  {/* Inline test result */}
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {isTesting ? (
                      <span className="flex items-center gap-1.5 text-primary animate-pulse">
                        <Loader2 className="w-3 h-3 animate-spin" /> Testing…
                      </span>
                    ) : inlineResult ? (
                      <div className="space-y-0.5">
                        {inlineResult.success ? (
                          <>
                            <div className="text-emerald-400 font-medium">{fmtLatency(inlineResult.latency)}ms</div>
                            {inlineResult.ip && (
                              <div className="font-mono text-[11px]">{inlineResult.ip}</div>
                            )}
                          </>
                        ) : (
                          <div className="text-red-400 text-[11px] max-w-[160px] truncate" title={inlineResult.message}>
                            {inlineResult.message || "Test failed"}
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="opacity-0 group-hover:opacity-60 transition-opacity text-[11px]">—</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground hover:text-primary gap-1"
                        onClick={() => handleTest(proxy)}
                        disabled={isTesting}
                        data-testid={`button-test-proxy-${proxy.id}`}
                      >
                        {isTesting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Activity className="w-3 h-3" />
                        )}
                        Test
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground"
                            data-testid={`button-menu-proxy-${proxy.id}`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEdit(proxy)} data-testid={`menu-edit-proxy-${proxy.id}`}>
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteConfirmId(proxy.id)}
                            data-testid={`menu-delete-proxy-${proxy.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Single proxy form */}
      <ProxyFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editingProxy={editingProxy}
      />

      {/* Bulk import */}
      <BulkImportDialog open={bulkOpen} onOpenChange={setBulkOpen} />

      {/* Delete confirm */}
      <AlertDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Proxy?</AlertDialogTitle>
            <AlertDialogDescription>
              This proxy will be permanently removed from your list.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-proxy">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirmId !== null && handleDelete(deleteConfirmId)}
              data-testid="button-confirm-delete-proxy"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
