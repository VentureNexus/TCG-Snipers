import { useState } from "react";
import {
  useListTaskGroups,
  useCreateTaskGroup,
  useDeleteTaskGroup,
  useStartTaskGroup,
  useStopTaskGroup,
  getListTaskGroupsQueryKey,
  getListTasksQueryKey,
  useListTasks,
  SUPPORTED_RETAILERS,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Plus,
  Trash2,
  Layers,
  Play,
  Square,
  Loader2,
} from "lucide-react";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
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
import { useForm } from "react-hook-form";
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const groupSchema = z.object({
  name: z.string().min(1, "Required"),
  retailer: z.enum(SUPPORTED_RETAILERS),
});

const RUNNING_STATUSES = ["monitoring", "adding_to_cart", "checking_out"];

function getGroupStatusSummary(tasks: { status: string }[]) {
  if (tasks.length === 0) return { label: "No tasks", cls: "text-muted-foreground" };
  const running = tasks.filter((t) => RUNNING_STATUSES.includes(t.status)).length;
  const success = tasks.filter((t) => t.status === "success").length;
  const failed = tasks.filter((t) => t.status === "failed").length;

  if (running > 0) {
    return {
      label: `${running} running`,
      cls: "text-emerald-400",
      dot: true,
    };
  }
  if (success > 0 && failed === 0) {
    return { label: `All succeeded`, cls: "text-emerald-400" };
  }
  if (failed > 0) {
    return { label: `${failed} failed`, cls: "text-red-400" };
  }
  return { label: "All idle", cls: "text-muted-foreground" };
}

export default function TaskGroupsPage() {
  const { data: groups = [] } = useListTaskGroups({
    query: { refetchInterval: 3000, queryKey: getListTaskGroupsQueryKey() },
  });
  const { data: tasks = [] } = useListTasks(undefined, {
    query: { refetchInterval: 3000, queryKey: getListTasksQueryKey() },
  });
  const createGroup = useCreateTaskGroup();
  const deleteGroup = useDeleteTaskGroup();
  const startGroup = useStartTaskGroup();
  const stopGroup = useStopTaskGroup();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingGroupId, setPendingGroupId] = useState<number | null>(null);

  const form = useForm<z.infer<typeof groupSchema>, unknown, z.infer<typeof groupSchema>>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
    },
  });

  const onSubmit = (values: z.infer<typeof groupSchema>) => {
    createGroup.mutate(
      { data: values },
      {
        onSuccess: () => {
          setCreateOpen(false);
          queryClient.invalidateQueries({ queryKey: getListTaskGroupsQueryKey() });
          form.reset();
        },
        onError: (err: unknown) => toast({ title: "Failed to create group", description: err instanceof Error ? err.message : undefined, variant: "destructive" }),
      },
    );
  };

  const handleStartGroup = (groupId: number) => {
    setPendingGroupId(groupId);
    startGroup.mutate(
      { id: groupId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTaskGroupsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          setPendingGroupId(null);
        },
        onError: (err: unknown) => {
          setPendingGroupId(null);
          toast({ title: "Failed to start group", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        },
      },
    );
  };

  const handleStopGroup = (groupId: number) => {
    setPendingGroupId(groupId);
    stopGroup.mutate(
      { id: groupId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTaskGroupsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
          setPendingGroupId(null);
        },
        onError: (err: unknown) => {
          setPendingGroupId(null);
          toast({ title: "Failed to stop group", description: err instanceof Error ? err.message : undefined, variant: "destructive" });
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold hidden">Task Groups</h2>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-create-group">
              <Plus className="w-4 h-4" /> Create Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Task Group</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, () => toast({ title: "Please fill in all required fields", variant: "destructive" }))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. Target PS5 Restock"
                          data-testid="input-group-name"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="retailer"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Retailer</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-group-retailer">
                            <SelectValue placeholder="Select Retailer" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {SUPPORTED_RETAILERS.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="submit"
                  className="w-full"
                  disabled={createGroup.isPending}
                  data-testid="button-submit-create-group"
                >
                  {createGroup.isPending ? "Creating..." : "Create Group"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground glass-card rounded-lg">
          <Layers className="w-10 h-10 mx-auto opacity-20 mb-4" />
          <p>No task groups created yet.</p>
          <p className="text-sm mt-1 opacity-60">
            Create a group to organise tasks by retailer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map((group) => {
            const groupTasks = tasks.filter((t) => t.groupId === group.id);
            const runningTasks = groupTasks.filter((t) =>
              RUNNING_STATUSES.includes(t.status),
            );
            const hasRunning = runningTasks.length > 0;
            const statusInfo = getGroupStatusSummary(groupTasks);
            const isPending = pendingGroupId === group.id;

            return (
              <Card
                key={group.id}
                className="glass-card relative group hover:border-primary/50 transition-colors"
                data-testid={`card-group-${group.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg pr-8">{group.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      data-testid={`button-delete-group-${group.id}`}
                      onClick={() =>
                        deleteGroup.mutate(
                          { id: group.id },
                          {
                            onSuccess: () =>
                              queryClient.invalidateQueries({
                                queryKey: getListTaskGroupsQueryKey(),
                              }),
                          },
                        )
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <CardDescription>
                    <RetailerBadge retailer={group.retailer} />
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex justify-between items-center">
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground">
                        <span className="font-mono text-foreground font-bold">
                          {groupTasks.length}
                        </span>{" "}
                        {groupTasks.length === 1 ? "Task" : "Tasks"}
                      </div>
                      <div className={`text-xs font-mono flex items-center gap-1.5 ${statusInfo.cls}`}>
                        {(statusInfo as { dot?: boolean }).dot && (
                          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                        )}
                        {statusInfo.label}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasRunning ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-red-500 hover:text-red-400 hover:bg-red-500/10 border border-red-500/20 gap-1"
                          data-testid={`button-stop-group-${group.id}`}
                          disabled={isPending}
                          onClick={() => handleStopGroup(group.id)}
                        >
                          {isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Square className="w-3 h-3 fill-current" />
                          )}
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 border border-emerald-500/20 gap-1"
                          data-testid={`button-start-group-${group.id}`}
                          disabled={isPending || groupTasks.length === 0}
                          onClick={() => handleStartGroup(group.id)}
                        >
                          {isPending ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Play className="w-3 h-3 fill-current" />
                          )}
                          Start
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
