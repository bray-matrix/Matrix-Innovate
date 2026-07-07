import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListBacklogItems,
  useCreateBacklogItem,
  useUpdateBacklogItem,
  useDeleteBacklogItem,
  useListParkingLotItems,
  useCreateParkingLotItem,
  useUpdateParkingLotItem,
  useDeleteParkingLotItem,
  useListInitiatives,
  useListValidations,
  getListBacklogItemsQueryKey,
  getListParkingLotItemsQueryKey,
  getGetProductHealthQueryKey,
} from "@workspace/api-client-react";
import type {
  BacklogItem,
  ParkingLotItem,
  BacklogItemCreate,
  ParkingLotItemCreate,
} from "@workspace/api-client-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Link2, ListTodo, PauseCircle, PlusCircle, Trash2 } from "lucide-react";

const BACKLOG_TYPES = [
  "Feature",
  "Enhancement",
  "Bug",
  "Technical Debt",
  "Architecture",
  "UX/UI",
  "Documentation",
] as const;
const BACKLOG_PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
const BACKLOG_STATUSES = [
  "New",
  "Grooming",
  "Approved",
  "In Progress",
  "Testing",
  "Complete",
  "Deferred",
] as const;
const BACKLOG_MODULES = [
  "Foundation",
  "Intelligence",
  "Portfolio",
  "Knowledge",
  "Collaboration",
  "Integrations",
] as const;

const STATUS_STYLES: Record<string, string> = {
  New: "bg-slate-100 text-slate-700 border-slate-200",
  Grooming: "bg-purple-100 text-purple-700 border-purple-200",
  Approved: "bg-blue-100 text-blue-700 border-blue-200",
  "In Progress": "bg-[#00A3E0]/15 text-[#00688F] border-[#00A3E0]/30",
  Testing: "bg-amber-100 text-amber-700 border-amber-200",
  Complete: "bg-green-100 text-green-700 border-green-200",
  Deferred: "bg-gray-100 text-gray-500 border-gray-200",
};

const PRIORITY_STYLES: Record<string, string> = {
  Critical: "bg-red-100 text-red-700 border-red-200",
  High: "bg-orange-100 text-orange-700 border-orange-200",
  Medium: "bg-amber-100 text-amber-700 border-amber-200",
  Low: "bg-slate-100 text-slate-600 border-slate-200",
};

function StatusPill({ value }: { value: string }) {
  return (
    <Badge
      variant="outline"
      className={STATUS_STYLES[value] ?? "bg-muted text-muted-foreground"}
    >
      {value}
    </Badge>
  );
}

function PriorityPill({ value }: { value: string }) {
  return (
    <Badge
      variant="outline"
      className={PRIORITY_STYLES[value] ?? "bg-muted text-muted-foreground"}
    >
      {value}
    </Badge>
  );
}

function formatDate(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

// ---------------------------------------------------------------------------
// Backlog item form
// ---------------------------------------------------------------------------

interface BacklogFormState {
  title: string;
  description: string;
  type: string;
  priority: string;
  status: string;
  targetVersion: string;
  module: string;
  submittedBy: string;
  assignedTo: string;
  notes: string;
  linkedInitiativeId: number | null;
  linkedValidationId: number | null;
  linkedVersion: string;
}

const EMPTY_BACKLOG_FORM: BacklogFormState = {
  title: "",
  description: "",
  type: "Feature",
  priority: "Medium",
  status: "New",
  targetVersion: "",
  module: "Foundation",
  submittedBy: "",
  assignedTo: "",
  notes: "",
  linkedInitiativeId: null,
  linkedValidationId: null,
  linkedVersion: "",
};

function backlogItemToForm(item: BacklogItem): BacklogFormState {
  return {
    title: item.title,
    description: item.description,
    type: item.type,
    priority: item.priority,
    status: item.status,
    targetVersion: item.targetVersion,
    module: item.module,
    submittedBy: item.submittedBy,
    assignedTo: item.assignedTo,
    notes: item.notes,
    linkedInitiativeId: item.linkedInitiativeId ?? null,
    linkedValidationId: item.linkedValidationId ?? null,
    linkedVersion: item.linkedVersion,
  };
}

function BacklogItemDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: BacklogItem | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BacklogFormState>(EMPTY_BACKLOG_FORM);
  const [formKey, setFormKey] = useState<string | null>(null);

  // Re-initialize the form when the dialog opens for a different target.
  const targetKey = open ? (editing ? `edit-${editing.id}` : "create") : null;
  if (targetKey !== formKey) {
    setFormKey(targetKey);
    if (targetKey !== null) {
      setForm(editing ? backlogItemToForm(editing) : EMPTY_BACKLOG_FORM);
    }
  }

  const { data: initiatives } = useListInitiatives();
  const { data: validations } = useListValidations();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getListBacklogItemsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetProductHealthQueryKey() });
  };

  const createMutation = useCreateBacklogItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Backlog item created" });
        onOpenChange(false);
      },
      onError: () =>
        toast({ title: "Failed to create backlog item", variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateBacklogItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Backlog item updated" });
        onOpenChange(false);
      },
      onError: () =>
        toast({ title: "Failed to update backlog item", variant: "destructive" }),
    },
  });
  const deleteMutation = useDeleteBacklogItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Backlog item deleted" });
        onOpenChange(false);
      },
      onError: () =>
        toast({ title: "Failed to delete backlog item", variant: "destructive" }),
    },
  });

  const set = <K extends keyof BacklogFormState>(
    key: K,
    value: BacklogFormState[K],
  ) => setForm((f) => ({ ...f, [key]: value }));

  const submit = () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const data: BacklogItemCreate = {
      title: form.title.trim(),
      description: form.description,
      type: form.type as BacklogItemCreate["type"],
      priority: form.priority as BacklogItemCreate["priority"],
      status: form.status as BacklogItemCreate["status"],
      targetVersion: form.targetVersion,
      module: form.module as BacklogItemCreate["module"],
      submittedBy: form.submittedBy,
      assignedTo: form.assignedTo,
      notes: form.notes,
      linkedInitiativeId: form.linkedInitiativeId,
      linkedValidationId: form.linkedValidationId,
      linkedVersion: form.linkedVersion,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Edit ${editing.displayId}: ${editing.title}`
              : "New Backlog Item"}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the details of this product backlog item."
              : "Capture a feature, enhancement, bug, or idea for the Matrix Innovation Hub itself."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bl-title">Title</Label>
            <Input
              id="bl-title"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Short, action-oriented summary"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bl-desc">Description</Label>
            <Textarea
              id="bl-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What should change and why?"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKLOG_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Priority</Label>
              <Select
                value={form.priority}
                onValueChange={(v) => set("priority", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKLOG_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKLOG_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Module</Label>
              <Select
                value={form.module}
                onValueChange={(v) => set("module", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BACKLOG_MODULES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bl-target">Target Version</Label>
              <Input
                id="bl-target"
                value={form.targetVersion}
                onChange={(e) => set("targetVersion", e.target.value)}
                placeholder="e.g. v0.3.0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bl-submitted">Submitted By</Label>
              <Input
                id="bl-submitted"
                value={form.submittedBy}
                onChange={(e) => set("submittedBy", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bl-assigned">Assigned To</Label>
              <Input
                id="bl-assigned"
                value={form.assignedTo}
                onChange={(e) => set("assignedTo", e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="bl-linked-version">Linked App Version</Label>
              <Input
                id="bl-linked-version"
                value={form.linkedVersion}
                onChange={(e) => set("linkedVersion", e.target.value)}
                placeholder="e.g. v0.2.2"
              />
            </div>
            <div className="grid gap-2">
              <Label>Linked Initiative</Label>
              <Select
                value={
                  form.linkedInitiativeId === null
                    ? "none"
                    : String(form.linkedInitiativeId)
                }
                onValueChange={(v) =>
                  set("linkedInitiativeId", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(initiatives ?? []).map((i) => (
                    <SelectItem key={i.id} value={String(i.id)}>
                      {i.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Linked Validation</Label>
              <Select
                value={
                  form.linkedValidationId === null
                    ? "none"
                    : String(form.linkedValidationId)
                }
                onValueChange={(v) =>
                  set("linkedValidationId", v === "none" ? null : Number(v))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {(validations ?? []).map((v) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {v.applicationVersion} — {v.releaseName || "Validation"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="bl-notes">Notes</Label>
            <Textarea
              id="bl-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
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
                  if (
                    window.confirm(
                      `Delete ${editing.displayId}? This cannot be undone.`,
                    )
                  ) {
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {editing ? "Save Changes" : "Create Item"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Parking lot form
// ---------------------------------------------------------------------------

interface ParkingLotFormState {
  title: string;
  description: string;
  reasonParked: string;
  estimatedValue: string;
  futureReleaseCandidate: boolean;
}

const EMPTY_PARKING_FORM: ParkingLotFormState = {
  title: "",
  description: "",
  reasonParked: "",
  estimatedValue: "",
  futureReleaseCandidate: false,
};

function ParkingLotDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ParkingLotItem | null;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ParkingLotFormState>(EMPTY_PARKING_FORM);
  const [formKey, setFormKey] = useState<string | null>(null);

  const targetKey = open ? (editing ? `edit-${editing.id}` : "create") : null;
  if (targetKey !== formKey) {
    setFormKey(targetKey);
    if (targetKey !== null) {
      setForm(
        editing
          ? {
              title: editing.title,
              description: editing.description,
              reasonParked: editing.reasonParked,
              estimatedValue: editing.estimatedValue,
              futureReleaseCandidate: editing.futureReleaseCandidate,
            }
          : EMPTY_PARKING_FORM,
      );
    }
  }

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: getListParkingLotItemsQueryKey(),
    });
    queryClient.invalidateQueries({ queryKey: getGetProductHealthQueryKey() });
  };

  const createMutation = useCreateParkingLotItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Parking lot item added" });
        onOpenChange(false);
      },
      onError: () =>
        toast({ title: "Failed to add parking lot item", variant: "destructive" }),
    },
  });
  const updateMutation = useUpdateParkingLotItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Parking lot item updated" });
        onOpenChange(false);
      },
      onError: () =>
        toast({
          title: "Failed to update parking lot item",
          variant: "destructive",
        }),
    },
  });
  const deleteMutation = useDeleteParkingLotItem({
    mutation: {
      onSuccess: () => {
        invalidate();
        toast({ title: "Parking lot item deleted" });
        onOpenChange(false);
      },
      onError: () =>
        toast({
          title: "Failed to delete parking lot item",
          variant: "destructive",
        }),
    },
  });

  const busy =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending;

  const submit = () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    const data: ParkingLotItemCreate = {
      title: form.title.trim(),
      description: form.description,
      reasonParked: form.reasonParked,
      estimatedValue: form.estimatedValue,
      futureReleaseCandidate: form.futureReleaseCandidate,
    };
    if (editing) {
      updateMutation.mutate({ id: editing.id, data });
    } else {
      createMutation.mutate({ data });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? `Edit ${editing.displayId}: ${editing.title}`
              : "New Parking Lot Item"}
          </DialogTitle>
          <DialogDescription>
            Ideas intentionally set aside — captured so they are not lost.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="pl-title">Title</Label>
            <Input
              id="pl-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pl-desc">Description</Label>
            <Textarea
              id="pl-desc"
              rows={3}
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pl-reason">Reason Parked</Label>
            <Textarea
              id="pl-reason"
              rows={2}
              value={form.reasonParked}
              onChange={(e) =>
                setForm((f) => ({ ...f, reasonParked: e.target.value }))
              }
              placeholder="Why is this on hold?"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="pl-value">Estimated Value</Label>
            <Input
              id="pl-value"
              value={form.estimatedValue}
              onChange={(e) =>
                setForm((f) => ({ ...f, estimatedValue: e.target.value }))
              }
              placeholder="e.g. High — reduces manual reporting effort"
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="pl-candidate"
              checked={form.futureReleaseCandidate}
              onCheckedChange={(c) =>
                setForm((f) => ({ ...f, futureReleaseCandidate: c === true }))
              }
            />
            <Label htmlFor="pl-candidate" className="font-normal">
              Future release candidate
            </Label>
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
                  if (
                    window.confirm(
                      `Delete ${editing.displayId}? This cannot be undone.`,
                    )
                  ) {
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy}>
              {editing ? "Save Changes" : "Add Item"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProductBacklogPage() {
  const { data: backlogItems, isLoading: backlogLoading } =
    useListBacklogItems();
  const { data: parkingItems, isLoading: parkingLoading } =
    useListParkingLotItems();
  const { data: initiatives } = useListInitiatives();

  const [backlogDialogOpen, setBacklogDialogOpen] = useState(false);
  const [editingBacklog, setEditingBacklog] = useState<BacklogItem | null>(
    null,
  );
  const [parkingDialogOpen, setParkingDialogOpen] = useState(false);
  const [editingParking, setEditingParking] = useState<ParkingLotItem | null>(
    null,
  );

  const initiativeTitleById = useMemo(() => {
    const map = new Map<number, string>();
    for (const i of initiatives ?? []) map.set(i.id, i.title);
    return map;
  }, [initiatives]);

  const backlogColumns = useMemo<ColumnDef<BacklogItem, unknown>[]>(
    () => [
      {
        accessorKey: "displayId",
        header: "ID",
        size: 90,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.displayId}</span>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        size: 260,
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.title}</div>
            {(row.original.linkedInitiativeId ||
              row.original.linkedValidationId ||
              row.original.linkedVersion) && (
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <Link2 className="h-3 w-3" />
                {[
                  row.original.linkedInitiativeId
                    ? (initiativeTitleById.get(row.original.linkedInitiativeId) ??
                      "Initiative")
                    : null,
                  row.original.linkedValidationId
                    ? `Validation #${row.original.linkedValidationId}`
                    : null,
                  row.original.linkedVersion || null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}
          </div>
        ),
        meta: { exportValue: (r) => r.title },
      },
      {
        accessorKey: "type",
        header: "Type",
        size: 130,
        meta: { filterable: true },
      },
      {
        accessorKey: "priority",
        header: "Priority",
        size: 110,
        meta: { filterable: true },
        cell: ({ row }) => <PriorityPill value={row.original.priority} />,
      },
      {
        accessorKey: "status",
        header: "Status",
        size: 120,
        meta: { filterable: true },
        cell: ({ row }) => <StatusPill value={row.original.status} />,
      },
      {
        accessorKey: "targetVersion",
        header: "Target",
        size: 90,
        meta: { filterable: true },
        cell: ({ row }) => (
          <span className="font-mono text-xs">
            {row.original.targetVersion || "—"}
          </span>
        ),
      },
      {
        accessorKey: "module",
        header: "Module",
        size: 120,
        meta: { filterable: true },
      },
      {
        accessorKey: "submittedBy",
        header: "Submitted By",
        size: 130,
        cell: ({ row }) => row.original.submittedBy || "—",
      },
      {
        accessorKey: "assignedTo",
        header: "Assigned To",
        size: 130,
        cell: ({ row }) => row.original.assignedTo || "—",
      },
      {
        accessorKey: "createdAt",
        header: "Created",
        size: 100,
        cell: ({ row }) => formatDate(row.original.createdAt),
        meta: { exportValue: (r) => r.createdAt },
      },
      {
        accessorKey: "updatedAt",
        header: "Last Updated",
        size: 110,
        cell: ({ row }) => formatDate(row.original.updatedAt),
        meta: { exportValue: (r) => r.updatedAt },
      },
    ],
    [initiativeTitleById],
  );

  const parkingColumns = useMemo<ColumnDef<ParkingLotItem, unknown>[]>(
    () => [
      {
        accessorKey: "displayId",
        header: "ID",
        size: 90,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.displayId}</span>
        ),
      },
      {
        accessorKey: "title",
        header: "Title",
        size: 240,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.title}</span>
        ),
      },
      {
        accessorKey: "description",
        header: "Description",
        size: 280,
        cell: ({ row }) => (
          <span className="line-clamp-2 text-muted-foreground">
            {row.original.description || "—"}
          </span>
        ),
      },
      {
        accessorKey: "reasonParked",
        header: "Reason Parked",
        size: 220,
        cell: ({ row }) => (
          <span className="line-clamp-2">{row.original.reasonParked || "—"}</span>
        ),
      },
      {
        accessorKey: "estimatedValue",
        header: "Estimated Value",
        size: 180,
        cell: ({ row }) => row.original.estimatedValue || "—",
      },
      {
        accessorKey: "futureReleaseCandidate",
        header: "Future Candidate",
        size: 130,
        meta: {
          exportValue: (r) => (r.futureReleaseCandidate ? "Yes" : "No"),
        },
        cell: ({ row }) =>
          row.original.futureReleaseCandidate ? (
            <Badge
              variant="outline"
              className="bg-[#FFC72C]/20 text-[#8A6D00] border-[#FFC72C]/50"
            >
              Yes
            </Badge>
          ) : (
            <span className="text-muted-foreground">No</span>
          ),
      },
      {
        accessorKey: "createdAt",
        header: "Date Added",
        size: 110,
        cell: ({ row }) => formatDate(row.original.createdAt),
        meta: { exportValue: (r) => r.createdAt },
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Product Backlog</h1>
        <p className="text-muted-foreground">
          The Matrix Innovation Hub manages its own evolution here — features,
          fixes, technical debt, and parked ideas.
        </p>
      </div>

      <Tabs defaultValue="backlog">
        <TabsList>
          <TabsTrigger value="backlog">
            <ListTodo className="mr-2 h-4 w-4" />
            Active Product Backlog
            {backlogItems && (
              <Badge variant="secondary" className="ml-2">
                {backlogItems.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="parking">
            <PauseCircle className="mr-2 h-4 w-4" />
            Parking Lot
            {parkingItems && (
              <Badge variant="secondary" className="ml-2">
                {parkingItems.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="backlog" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingBacklog(null);
                setBacklogDialogOpen(true);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              New Backlog Item
            </Button>
          </div>
          <DataTable
            columns={backlogColumns}
            data={backlogItems ?? []}
            onRowClick={(item) => {
              setEditingBacklog(item);
              setBacklogDialogOpen(true);
            }}
            searchPlaceholder="Search backlog..."
            exportFileName="product-backlog"
            storageKey="product-backlog"
            initialPageSize={25}
            emptyMessage={
              backlogLoading ? "Loading..." : "No backlog items yet."
            }
          />
        </TabsContent>

        <TabsContent value="parking" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingParking(null);
                setParkingDialogOpen(true);
              }}
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              New Parking Lot Item
            </Button>
          </div>
          <DataTable
            columns={parkingColumns}
            data={parkingItems ?? []}
            onRowClick={(item) => {
              setEditingParking(item);
              setParkingDialogOpen(true);
            }}
            searchPlaceholder="Search parking lot..."
            exportFileName="parking-lot"
            storageKey="parking-lot"
            initialPageSize={25}
            emptyMessage={
              parkingLoading ? "Loading..." : "The parking lot is empty."
            }
          />
        </TabsContent>
      </Tabs>

      <BacklogItemDialog
        open={backlogDialogOpen}
        onOpenChange={setBacklogDialogOpen}
        editing={editingBacklog}
      />
      <ParkingLotDialog
        open={parkingDialogOpen}
        onOpenChange={setParkingDialogOpen}
        editing={editingParking}
      />
    </div>
  );
}
