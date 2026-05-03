import React, { useState } from "react";
import { useListProxies, useCreateProxy, useDeleteProxy, useTestProxy, getListProxiesQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Globe, Activity } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const proxySchema = z.object({
  host: z.string().min(1, "Required"),
  port: z.string().min(1, "Required"),
  username: z.string().optional(),
  password: z.string().optional(),
});

export default function ProxiesPage() {
  const { data: proxies = [] } = useListProxies();
  const createProxy = useCreateProxy();
  const deleteProxy = useDeleteProxy();
  const testProxy = useTestProxy();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkProxies, setBulkProxies] = useState("");

  const form = useForm<z.infer<typeof proxySchema>>({
    resolver: zodResolver(proxySchema),
    defaultValues: { host: "", port: "", username: "", password: "" },
  });

  const onSubmit = (values: z.infer<typeof proxySchema>) => {
    createProxy.mutate({ data: { ...values, label: `${values.host}:${values.port}` } }, {
      onSuccess: () => {
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
        form.reset();
      }
    });
  };

  const handleBulkSubmit = () => {
    const lines = bulkProxies.split('\n').map(l => l.trim()).filter(Boolean);
    let created = 0;
    // Simple naive sequential create for bulk just as a placeholder since we don't have a bulk API
    lines.forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        createProxy.mutate({
          data: {
            host: parts[0],
            port: parts[1],
            username: parts[2] || "",
            password: parts[3] || "",
            label: line
          }
        }, {
          onSuccess: () => {
            created++;
            if (created === lines.length) {
              setCreateOpen(false);
              queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() });
              setBulkProxies("");
            }
          }
        });
      }
    });
    if(lines.length === 0) setCreateOpen(false);
  };

  const getStatusChip = (status: string, latency: string) => {
    if (status === 'pass') return <span className="text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded text-xs border border-emerald-400/20">Pass ({latency}ms)</span>;
    if (status === 'fail') return <span className="text-red-400 bg-red-400/10 px-2 py-0.5 rounded text-xs border border-red-400/20">Fail</span>;
    return <span className="text-muted-foreground bg-muted/20 px-2 py-0.5 rounded text-xs border border-border/50">Untested</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold hidden">Proxies</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-proxy">
              <Plus className="w-4 h-4" /> Add Proxies
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Proxies</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2 mb-4 border-b border-border/50 pb-2">
               <Button variant={!bulkMode ? "default" : "ghost"} size="sm" onClick={() => setBulkMode(false)}>Single</Button>
               <Button variant={bulkMode ? "default" : "ghost"} size="sm" onClick={() => setBulkMode(true)}>Bulk Paste</Button>
            </div>
            
            {!bulkMode ? (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="host" render={({ field }) => (
                      <FormItem><FormLabel>Host / IP</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="port" render={({ field }) => (
                      <FormItem><FormLabel>Port</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField control={form.control} name="username" render={({ field }) => (
                      <FormItem><FormLabel>Username</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                    <FormField control={form.control} name="password" render={({ field }) => (
                      <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                    )} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createProxy.isPending}>Add Proxy</Button>
                </form>
              </Form>
            ) : (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Paste Proxies (ip:port:user:pass)</Label>
                  <Textarea 
                    className="font-mono text-sm h-48" 
                    placeholder="192.168.1.1:8080:user:pass&#10;192.168.1.2:8080:user:pass"
                    value={bulkProxies}
                    onChange={(e) => setBulkProxies(e.target.value)}
                  />
                </div>
                <Button className="w-full" onClick={handleBulkSubmit}>Add Proxies</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 glass-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground uppercase text-xs">
            <tr>
              <th className="px-4 py-3 font-medium">IP : Port</th>
              <th className="px-4 py-3 font-medium">Auth</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {proxies.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <Globe className="w-8 h-8 opacity-20" />
                    <p>No proxies configured.</p>
                  </div>
                </td>
              </tr>
            ) : (
              proxies.map(proxy => (
                <tr key={proxy.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-3 font-mono text-primary/80">{proxy.host}:{proxy.port}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {proxy.username ? `${proxy.username}:***` : 'None'}
                  </td>
                  <td className="px-4 py-3 font-mono">
                    {getStatusChip(proxy.lastTestStatus, proxy.lastTestLatency)}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-8 text-xs text-muted-foreground hover:text-primary" 
                      onClick={() => testProxy.mutate({ id: proxy.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() }) })}
                    >
                      <Activity className="w-3 h-3 mr-1" /> Test
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" 
                      onClick={() => deleteProxy.mutate({ id: proxy.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProxiesQueryKey() }) })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
