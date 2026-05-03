import React, { useState } from "react";
import { useListTaskGroups, useCreateTaskGroup, useDeleteTaskGroup, getListTaskGroupsQueryKey, useListTasks } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Layers } from "lucide-react";
import { RetailerBadge } from "@/components/shared/RetailerBadge";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const groupSchema = z.object({
  name: z.string().min(1, "Required"),
  retailer: z.string().min(1, "Required"),
});

export default function TaskGroupsPage() {
  const { data: groups = [] } = useListTaskGroups();
  const { data: tasks = [] } = useListTasks();
  const createGroup = useCreateTaskGroup();
  const deleteGroup = useDeleteTaskGroup();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const form = useForm<z.infer<typeof groupSchema>>({
    resolver: zodResolver(groupSchema),
    defaultValues: {
      name: "",
      retailer: "",
    },
  });

  const onSubmit = (values: z.infer<typeof groupSchema>) => {
    createGroup.mutate({ data: values }, {
      onSuccess: () => {
        setCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: getListTaskGroupsQueryKey() });
        form.reset();
      }
    });
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
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Group Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Target PS5 Restock" {...field} />
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
                <Button type="submit" className="w-full" disabled={createGroup.isPending}>
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
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {groups.map(group => {
            const groupTasks = tasks.filter(t => t.groupId === group.id);
            return (
              <Card key={group.id} className="glass-card relative group hover:border-primary/50 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-lg">{group.name}</CardTitle>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      onClick={() => deleteGroup.mutate({ id: group.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTaskGroupsQueryKey() }) })}
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
                    <div className="text-sm text-muted-foreground">
                      <span className="font-mono text-foreground font-bold">{groupTasks.length}</span> Tasks
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
