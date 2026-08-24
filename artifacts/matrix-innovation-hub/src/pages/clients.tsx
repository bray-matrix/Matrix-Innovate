import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  useListOrganizations,
  getListClientsQueryKey,
} from "@workspace/api-client-react";
import type { Client } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Users, PlusCircle, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function ClientDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Client | null;
}) {
  const queryClient = useQueryClient();
  const { data: organizations } = useListOrganizations();
  const [form, setForm] = useState<{name: string; status: string; organizationId: number | null}>({ name: "", status: "Active", organizationId: null });
  const [formKey, setFormKey] = useState<string | null>(null);

  const targetKey = open ? (editing ? `edit-${editing.id}` : "create") : null;
  if (targetKey !== formKey) {
    setFormKey(targetKey);
    if (targetKey !== null) {
      setForm(editing ? { name: editing.name, status: editing.status, organizationId: editing.organizationId ?? null } : { name: "", status: "Active", organizationId: null });
    }
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
  };

  const createMutation = useCreateClient({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Client created" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to create client", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateClient({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Client updated" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to update client", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteClient({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Client deleted" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to delete client", variant: "destructive" }),
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const data = { name: form.name.trim(), status: form.status, organizationId: form.organizationId };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit Client` : "New Client"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update client details." : "Add a new client entity."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="client-name">Name</Label>
            <Input
              id="client-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Globex"
            />
          </div>
          <div className="grid gap-2">
            <Label>Organization (Optional)</Label>
            <Select value={form.organizationId ? String(form.organizationId) : "none"} onValueChange={(v) => setForm({ ...form, organizationId: v === "none" ? null : Number(v) })}>
              <SelectTrigger>
                <SelectValue placeholder="Select Organization" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (Independent Client)</SelectItem>
                {(organizations ?? []).map(org => (
                  <SelectItem key={org.id} value={String(org.id)}>{org.name}</SelectItem>
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
                <SelectItem value="Inactive">Inactive</SelectItem>
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

export default function ClientsPage() {
  const { data: clients, isLoading: clientsLoading } = useListClients();
  const { data: organizations, isLoading: orgsLoading } = useListOrganizations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const orgMap = useMemo(() => {
    const map = new Map<number, string>();
    if (organizations) {
      organizations.forEach(o => map.set(o.id, o.name));
    }
    return map;
  }, [organizations]);

  const columns = useMemo<ColumnDef<Client>[]>(() => [
    {
      accessorKey: "name",
      header: "Client Name",
      size: 250,
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
    },
    {
      id: "organization",
      header: "Organization",
      size: 250,
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.organizationId ? orgMap.get(row.original.organizationId) || "Unknown" : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 150,
      cell: ({ row }) => (
        <Badge variant={row.original.status === "Active" ? "outline" : "secondary"} className={row.original.status === "Active" ? "bg-green-100 text-green-700 border-green-200" : ""}>
          {row.original.status}
        </Badge>
      ),
    },
    {
      accessorKey: "createdAt",
      header: "Created",
      size: 150,
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
  ], [orgMap]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Clients
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage external client entities.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <PlusCircle className="mr-2 h-4 w-4" /> New Client
        </Button>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4">
        <DataTable columns={columns} data={clients ?? []} />
      </div>

      <ClientDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
