import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListPrograms,
  useCreateProgram,
  useUpdateProgram,
  useDeleteProgram,
  useListOrganizations,
  useListClients,
  getListProgramsQueryKey,
} from "@workspace/api-client-react";
import type { Program } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { FolderKanban, PlusCircle, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function ProgramDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Program | null;
}) {
  const queryClient = useQueryClient();
  const { data: organizations } = useListOrganizations();
  const { data: clients } = useListClients();
  
  const [form, setForm] = useState<{name: string; description: string; status: string; owner: string; organizationId: number | null; clientId: number | null}>({ 
    name: "", description: "", status: "Active", owner: "", organizationId: null, clientId: null 
  });
  const [formKey, setFormKey] = useState<string | null>(null);

  const targetKey = open ? (editing ? `edit-${editing.id}` : "create") : null;
  if (targetKey !== formKey) {
    setFormKey(targetKey);
    if (targetKey !== null) {
      setForm(editing ? { 
        name: editing.name, 
        description: editing.description, 
        status: editing.status, 
        owner: editing.owner,
        organizationId: editing.organizationId ?? null,
        clientId: editing.clientId ?? null
      } : { name: "", description: "", status: "Active", owner: "", organizationId: null, clientId: null });
    }
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListProgramsQueryKey() });
  };

  const createMutation = useCreateProgram({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Program created" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to create program", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateProgram({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Program updated" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to update program", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteProgram({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Program deleted" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to delete program", variant: "destructive" }),
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const data = { 
      name: form.name.trim(), 
      description: form.description, 
      status: form.status, 
      owner: form.owner,
      organizationId: form.organizationId,
      clientId: form.clientId
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Program` : "New Program"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update program details." : "Add a new program."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="prog-name">Name</Label>
            <Input
              id="prog-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Q3 Rollout"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prog-desc">Description</Label>
            <Textarea
              id="prog-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="prog-owner">Owner</Label>
            <Input
              id="prog-owner"
              value={form.owner}
              onChange={(e) => setForm({ ...form, owner: e.target.value })}
            />
          </div>
          <div className="grid gap-2">
            <Label>Organization (Optional)</Label>
            <Select value={form.organizationId ? String(form.organizationId) : "none"} onValueChange={(v) => setForm({ ...form, organizationId: v === "none" ? null : Number(v) })}>
              <SelectTrigger>
                <SelectValue placeholder="Select Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(organizations ?? []).map(org => (
                  <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Client (Optional)</Label>
            <Select value={form.clientId ? String(form.clientId) : "none"} onValueChange={(v) => setForm({ ...form, clientId: v === "none" ? null : Number(v) })}>
              <SelectTrigger>
                <SelectValue placeholder="Select Client" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(clients ?? []).map(c => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Status</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="On Hold">On Hold</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {editing && (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`Delete ${editing.name}? This cannot be undone.`)) {
                    deleteMutation.mutate({ id: editing.id });
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={submit} disabled={busy}>
              {editing ? "Save Changes" : "Create"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_COLORS: Record<string, string> = {
  "Active": "bg-green-100 text-green-700 border-green-200",
  "On Hold": "bg-amber-100 text-amber-700 border-amber-200",
  "Completed": "bg-blue-100 text-blue-700 border-blue-200",
  "Cancelled": "bg-gray-100 text-gray-700 border-gray-200",
};

export default function ProgramsPage() {
  const { data: programs, isLoading: programsLoading } = useListPrograms();
  const { data: organizations, isLoading: orgsLoading } = useListOrganizations();
  const { data: clients, isLoading: clientsLoading } = useListClients();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);

  const orgMap = useMemo(() => {
    const map = new Map<number, string>();
    if (organizations) {
      organizations.forEach(o => map.set(o.id, o.name));
    }
    return map;
  }, [organizations]);

  const clientMap = useMemo(() => {
    const map = new Map<number, string>();
    if (clients) {
      clients.forEach(c => map.set(c.id, c.name));
    }
    return map;
  }, [clients]);

  const columns = useMemo<ColumnDef<Program>[]>(() => [
    {
      accessorKey: "name",
      header: "Program Name",
      size: 200,
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      id: "context",
      header: "Context",
      size: 200,
      cell: ({ row }) => {
        const parts = [];
        if (row.original.organizationId) parts.push(orgMap.get(row.original.organizationId) || "Org");
        if (row.original.clientId) parts.push(clientMap.get(row.original.clientId) || "Client");
        return <span className="text-muted-foreground">{parts.length ? parts.join(" / ") : "Internal"}</span>;
      },
    },
    {
      accessorKey: "owner",
      header: "Owner",
      size: 150,
      cell: ({ row }) => row.original.owner || "—",
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 150,
      cell: ({ row }) => (
        <Badge variant="outline" className={STATUS_COLORS[row.original.status] ?? ""}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      size: 120,
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
    {
      id: "actions",
      size: 100,
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => { setEditing(row.original); setDialogOpen(true); }}>
          Edit
        </Button>
      ),
    },
  ], [orgMap, clientMap]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <FolderKanban className="h-8 w-8 text-primary" />
            Programs
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage programs that group related projects together.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <PlusCircle className="mr-2 h-4 w-4" /> New Program
        </Button>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4">
        <DataTable 
          columns={columns} 
          data={programs ?? []} 
          
          
          
        />
      </div>

      <ProgramDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
