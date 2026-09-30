import { useState, useMemo } from "react";
import { 
  useListResources, 
  useCreateResource, 
  useUpdateResource, 
  useDeleteResource,
  useGetResource,
  useGetSettings,
  getListResourcesQueryKey
} from "@workspace/api-client-react";
import type { ResourceWithCapacity, ResourceCreate, ResourceUpdate } from "@workspace/api-client-react";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { ColumnDef } from "@tanstack/react-table";
import { Users, PlusCircle, Pencil, Trash2, ChevronDown, ChevronRight, Activity, Percent } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function CapacityBadge({ flag }: { flag: string }) {
  if (flag === "Overallocated") {
    return <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-red-200">Overallocated</Badge>;
  }
  if (flag === "Near Capacity") {
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">Near Capacity</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Available</Badge>;
}

export default function ResourcesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: resources, isLoading } = useListResources();
  const { data: settings } = useGetSettings();

  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("Active");
  const [overallocatedOnly, setOverallocatedOnly] = useState(false);

  // Dialog State
  const [formOpen, setFormOpen] = useState(false);
  const [editingResource, setEditingResource] = useState<ResourceWithCapacity | null>(null);
  const [formData, setFormData] = useState<ResourceCreate>({
    name: "",
    department: "",
    status: "Active",
    weeklyCapacityHours: 40,
    roleTitle: "",
  });

  const [expandedId, setExpandedId] = useState<number | null>(null);

  const createMutation = useCreateResource({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        setFormOpen(false);
        toast({ title: "Resource created" });
      }
    }
  });

  const updateMutation = useUpdateResource({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        setFormOpen(false);
        toast({ title: "Resource updated" });
      }
    }
  });

  const deleteMutation = useDeleteResource({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListResourcesQueryKey() });
        toast({ title: "Resource deleted" });
      }
    }
  });

  const departmentsList = useMemo(() => {
    const existing = new Set(resources?.map(r => r.department) ?? []);
    settings?.departments.forEach(d => existing.add(d));
    return Array.from(existing).sort();
  }, [resources, settings]);

  const filteredResources = useMemo(() => {
    if (!resources) return [];
    let result = resources;

    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(r => 
        r.name.toLowerCase().includes(s) || 
        r.roleTitle?.toLowerCase().includes(s)
      );
    }
    if (departmentFilter !== "all") {
      result = result.filter(r => r.department === departmentFilter);
    }
    if (statusFilter !== "all") {
      result = result.filter(r => r.status === statusFilter);
    }
    if (overallocatedOnly) {
      result = result.filter(r => r.capacityFlag === "Overallocated");
    }

    return result;
  }, [resources, search, departmentFilter, statusFilter, overallocatedOnly]);

  const handleEdit = (resource: ResourceWithCapacity) => {
    setEditingResource(resource);
    setFormData({
      name: resource.name,
      department: resource.department,
      status: resource.status as any,
      weeklyCapacityHours: resource.weeklyCapacityHours ?? 40,
      roleTitle: resource.roleTitle ?? "",
    });
    setFormOpen(true);
  };

  const handleDelete = (resource: ResourceWithCapacity) => {
    if (window.confirm(`Are you sure you want to delete ${resource.name}? Any assignments will become department-only demand.`)) {
      deleteMutation.mutate({ id: resource.id });
    }
  };

  const handleSubmit = () => {
    if (!formData.name || !formData.department) {
      toast({ title: "Name and department are required", variant: "destructive" });
      return;
    }
    
    if (editingResource) {
      updateMutation.mutate({ 
        id: editingResource.id, 
        data: formData as ResourceUpdate 
      });
    } else {
      createMutation.mutate({ data: formData });
    }
  };

  const columns = useMemo<ColumnDef<ResourceWithCapacity>[]>(() => [
    {
      id: "expander",
      header: () => null,
      cell: ({ row }) => (
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6 p-0" 
          onClick={() => setExpandedId(expandedId === row.original.id ? null : row.original.id)}
        >
          {expandedId === row.original.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
      ),
      size: 40
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-foreground">{row.original.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.roleTitle || "No title"}</div>
        </div>
      )
    },
    {
      accessorKey: "department",
      header: "Department",
    },
    {
      id: "capacity",
      header: "Capacity Allocation",
      cell: ({ row }) => {
        const { allocatedPercent, capacityFlag } = row.original;
        return (
          <div className="flex items-center gap-3 max-w-[200px]">
            <div className="flex-1">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-muted-foreground">{allocatedPercent.toFixed(0)}% Allocated</span>
              </div>
              <Progress 
                value={Math.min(allocatedPercent, 100)} 
                className={`h-2 ${capacityFlag === "Overallocated" ? "[&>div]:bg-red-500" : capacityFlag === "Near Capacity" ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`} 
              />
            </div>
            <CapacityBadge flag={capacityFlag} />
          </div>
        );
      }
    },
    {
      accessorKey: "activeProjects",
      header: "Active Projects",
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={() => handleEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(row.original)} className="text-destructive hover:text-destructive hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ], [expandedId]);

  if (isLoading) {
    return (
      <div className="space-y-6 p-4">
        <Skeleton className="h-12 w-1/3" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Resources
          </h1>
          <p className="text-muted-foreground mt-1 text-lg">
            Manage team capacity, assignments, and utilization.
          </p>
        </div>
        <Button onClick={() => {
          setEditingResource(null);
          setFormData({ name: "", department: "", status: "Active", weeklyCapacityHours: 40, roleTitle: "" });
          setFormOpen(true);
        }}>
          <PlusCircle className="h-4 w-4 mr-2" /> New Resource
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-end sm:items-center bg-card p-3 rounded-lg border shadow-sm">
        <div className="flex-1 w-full relative">
          <Input 
            placeholder="Search by name or role..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-background"
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto items-center pb-1 sm:pb-0">
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger className="w-[180px] bg-background"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Departments</SelectItem>
              {departmentsList.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] bg-background"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2 bg-background border px-3 py-1.5 rounded-md h-9">
            <Switch 
              id="overallocated" 
              checked={overallocatedOnly} 
              onCheckedChange={setOverallocatedOnly} 
            />
            <Label htmlFor="overallocated" className="text-xs cursor-pointer">Overallocated</Label>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border shadow-sm p-4">
        {filteredResources.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-foreground">No resources found</h3>
            <p className="text-muted-foreground">Adjust your filters or add a new resource.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredResources.map(resource => (
              <div key={resource.id} className="border rounded-lg overflow-hidden group">
                <div className="flex items-center gap-4 p-4 bg-card hover:bg-muted/30 transition-colors">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 shrink-0" 
                    onClick={() => setExpandedId(expandedId === resource.id ? null : resource.id)}
                  >
                    {expandedId === resource.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                  
                  <div className="w-1/4 min-w-[200px]">
                    <div className="font-semibold text-foreground">{resource.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{resource.roleTitle || "No title"}</div>
                  </div>
                  
                  <div className="w-1/6 min-w-[120px]">
                    <Badge variant="outline" className="font-normal">{resource.department}</Badge>
                  </div>
                  
                  <div className="flex-1 min-w-[200px] flex items-center gap-3">
                    <div className="flex-1">
                      <Progress 
                        value={Math.min(resource.allocatedPercent, 100)} 
                        className={`h-2 ${resource.capacityFlag === "Overallocated" ? "[&>div]:bg-red-500" : resource.capacityFlag === "Near Capacity" ? "[&>div]:bg-amber-500" : "[&>div]:bg-green-500"}`} 
                      />
                    </div>
                    <div className="text-xs font-medium w-12 text-right">{resource.allocatedPercent.toFixed(0)}%</div>
                    <CapacityBadge flag={resource.capacityFlag} />
                  </div>
                  
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" onClick={() => handleEdit(resource)}>
                      <Pencil className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(resource)}>
                      <Trash2 className="h-4 w-4 text-destructive/70 hover:text-destructive" />
                    </Button>
                  </div>
                </div>
                
                {expandedId === resource.id && (
                  <div className="border-t bg-muted/20 p-4 pl-16">
                    <ResourceAssignments resourceId={resource.id} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingResource ? "Edit Resource" : "New Resource"}</DialogTitle>
            <DialogDescription>Add or update team member details and capacity.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Name</Label>
              <Input 
                value={formData.name} 
                onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))} 
                placeholder="Full Name"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Role Title</Label>
                <Input 
                  value={formData.roleTitle || ""} 
                  onChange={(e) => setFormData(f => ({ ...f, roleTitle: e.target.value }))} 
                  placeholder="e.g. Senior Engineer"
                />
              </div>
              <div className="grid gap-2">
                <Label>Department</Label>
                <Select value={formData.department} onValueChange={value => setFormData(f => ({ ...f, department: value }))}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {formData.department && !settings?.departments.includes(formData.department) && <SelectItem value={formData.department}>{formData.department} (Inactive)</SelectItem>}
                    {settings?.departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Weekly Capacity (Hours)</Label>
                <Input 
                  type="number"
                  value={formData.weeklyCapacityHours || ""} 
                  onChange={(e) => setFormData(f => ({ ...f, weeklyCapacityHours: parseFloat(e.target.value) || 40 }))} 
                />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <Select 
                  value={formData.status} 
                  onValueChange={(v) => setFormData(f => ({ ...f, status: v as any }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {editingResource ? "Save Changes" : "Create Resource"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResourceAssignments({ resourceId }: { resourceId: number }) {
  const { data: resourceDetail, isLoading } = useGetResource(resourceId);

  if (isLoading) {
    return <Skeleton className="h-20 w-full" />;
  }

  const assignments = resourceDetail?.assignments || [];

  if (assignments.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground italic">
        No active project assignments.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Assignments</h4>
      <div className="grid gap-2">
        {assignments.map(a => (
          <div key={a.id} className="flex items-center gap-4 bg-background p-2 rounded border text-sm">
            <div className="flex-1 font-medium text-foreground">{a.projectName}</div>
            <div className="w-1/4 text-muted-foreground">{a.roleDescription || "No role specified"}</div>
            <div className="w-24 text-right font-medium">{a.allocationPercent}%</div>
            <div className="w-24 text-right text-muted-foreground text-xs">{a.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
