import React, { useState } from "react";
import { useListTasks, useStartAllTasks, useStopAllTasks, useCreateTask, useDeleteTask, useStartTask, useStopTask, useListProfiles, useListTaskGroups, useListProxies, getListTasksQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Play, Square, Plus, Trash2, StopCircle, ListChecks } from "lucide-react";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
import { format } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const taskSchema = z.object({
  retailer: z.string().min(1, "Required"),
  productUrl: z.string().optional(),
  productKeywords: z.string().optional(),
  profileId: z.coerce.number().min(1, "Required"),
  proxyId: z.coerce.number().optional(),
  groupId: z.coerce.number().optional(),
  quantity: z.coerce.number().min(1).default(1),
  monitorDelay: z.coerce.number().min(100).default(3000),
  retryCount: z.coerce.number().min(0).default(3),
});

export default function TasksPage() {
  const { data: tasks = [] } = useListTasks();
  const startAll = useStartAllTasks();
  const stopAll = useStopAllTasks();
  const startTask = useStartTask();
  const stopTask = useStopTask();
  const deleteTask = useDeleteTask();
  const createTask = useCreateTask();
  const queryClient = useQueryClient();

  const { data: profiles = [] } = useListProfiles();
  const { data: groups = [] } = useListTaskGroups();
  const { data: proxies = [] } = useListProxies();

  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm<z.infer<typeof taskSchema>>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      retailer: "",
      productUrl: "",
      productKeywords: "",
      quantity: 1,
      monitorDelay: 3000,
      retryCount: 3,
    },
  });

  const onSubmit = (values: z.infer<typeof taskSchema>) => {
    createTask.mutate({
      data: {
        ...values,
      }
    }, {
      onSuccess: () => {
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        form.reset();
      }
    });
  };

  const getStatusClass = (status: string) => {
    switch (status) {
      case 'idle': return 'status-idle';
      case 'monitoring': return 'status-monitoring';
      case 'adding_to_cart': return 'status-cart';
      case 'checking_out': return 'status-checkout';
      case 'success': return 'status-success';
      case 'failed': return 'status-failed';
      case 'stopped': return 'status-stopped';
      default: return 'status-idle';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={() => startAll.mutate()} data-testid="button-start-all-tasks" className="gap-2 bg-emerald-500 hover:bg-emerald-600 text-white border-none">
            <Play className="w-4 h-4 fill-current" /> Start All
          </Button>
          <Button onClick={() => stopAll.mutate()} variant="secondary" data-testid="button-stop-all-tasks" className="gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20">
            <Square className="w-4 h-4 fill-current" /> Stop All
          </Button>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-task">
              <Plus className="w-4 h-4" /> New Task
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create New Task</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="retailer"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Retailer</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Retailer" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Target">Target</SelectItem>
                            <SelectItem value="Amazon">Amazon</SelectItem>
                            <SelectItem value="Best Buy">Best Buy</SelectItem>
                            <SelectItem value="Costco">Costco</SelectItem>
                            <SelectItem value="Pokemon Center">Pokemon Center</SelectItem>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select Profile" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {profiles.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
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
                        <Input placeholder="https://..." {...field} />
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
                        <Input placeholder="+ps5, +console" {...field} />
                      </FormControl>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">None</SelectItem>
                            {groups.map(g => <SelectItem key={g.id} value={g.id.toString()}>{g.name}</SelectItem>)}
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
                        <Select onValueChange={field.onChange} defaultValue={field.value?.toString()}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Local IP" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="0">Local IP</SelectItem>
                            {proxies.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="quantity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Qty</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="monitorDelay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delay (ms)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="retryCount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Retries</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={createTask.isPending}>
                  {createTask.isPending ? "Creating..." : "Create Task"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border/50 rounded-lg overflow-hidden bg-card/50 glass-card">
        <table className="w-full text-sm text-left">
          <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground uppercase text-xs">
            <tr>
              <th className="px-4 py-3 font-medium">ID</th>
              <th className="px-4 py-3 font-medium">Retailer</th>
              <th className="px-4 py-3 font-medium">Product / Keywords</th>
              <th className="px-4 py-3 font-medium">Profile</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tasks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  <div className="flex flex-col items-center gap-2">
                    <ListChecks className="w-8 h-8 opacity-20" />
                    <p>No tasks found. Create your first task to start sniping.</p>
                  </div>
                </td>
              </tr>
            ) : (
              tasks.map(task => (
                <tr key={task.id} className="border-b border-border/50 hover:bg-muted/20 transition-colors group">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{task.id}</td>
                  <td className="px-4 py-3">
                    <RetailerBadge retailer={task.retailer} />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs max-w-[200px] truncate text-primary/80" title={task.productUrl || task.productKeywords}>
                    {task.productUrl || task.productKeywords || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {profiles.find(p => p.id === task.profileId)?.name || 'Unknown'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-mono tracking-wide ${getStatusClass(task.status)}`}>
                      {task.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {['idle', 'stopped', 'failed'].includes(task.status) ? (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10" onClick={() => startTask.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) })}>
                        <Play className="w-4 h-4 fill-current" />
                      </Button>
                    ) : (
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-400 hover:bg-red-500/10" onClick={() => stopTask.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) })}>
                        <StopCircle className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => deleteTask.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) })}>
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
