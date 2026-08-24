import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListOrganizations,
  useCreateOrganization,
  useUpdateOrganization,
  useDeleteOrganization,
  getListOrganizationsQueryKey,
} from "@workspace/api-client-react";
import type { Organization } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Building2, PlusCircle, Trash2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function OrganizationDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Organization | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", status: "Active" });
  const [formKey, setFormKey] = useState<string | null>(null);

  const targetKey = open ? (editing ? `edit-${editing.id}` : "create") : null;
  if (targetKey !== formKey) {
    setFormKey(targetKey);
    if (targetKey !== null) {
      setForm(editing ? { name: editing.name, status: editing.status } : { name: "", status: "Active" });
    }
  }

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListOrganizationsQueryKey() });
  };

  const createMutation = useCreateOrganization({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Organization created" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to create organization", variant: "destructive" }),
    },
  });

  const updateMutation = useUpdateOrganization({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Organization updated" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to update organization", variant: "destructive" }),
    },
  });

  const deleteMutation = useDeleteOrganization({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Organization deleted" });
        onOpenChange(false);
      },
      onError: () => toast({ title: "Failed to delete organization", variant: "destructive" }),
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const submit = () => {
    if (!form.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const data = { name: form.name.trim(), status: form.status };
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
          <DialogTitle>{editing ? `Edit Organization` : "New Organization"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update organization details." : "Add a new organization."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Acme Corp"
            />
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

export default function OrganizationsPage() {
  const { data: organizations, isLoading } = useListOrganizations();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Organization | null>(null);

  const columns = useMemo<ColumnDef<Organization>[]>(() => [
    {
      accessorKey: "name",
      header: "Organization Name",
      size: 300,
      cell: ({ row }) => <div className="font-medium">{row.original.name}</div>,
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
  ], []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Organizations
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage overarching organizational entities.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <PlusCircle className="mr-2 h-4 w-4" /> New Organization
        </Button>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4">
        <DataTable columns={columns} data={organizations ?? []} />
      </div>

      <OrganizationDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
