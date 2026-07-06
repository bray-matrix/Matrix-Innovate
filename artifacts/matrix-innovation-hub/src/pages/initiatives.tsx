import { useState } from "react";
import { useListInitiatives, useGetSettings } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";

export default function InitiativeList() {
  const { data: initiatives, isLoading } = useListInitiatives();
  const { data: settings } = useGetSettings();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const filteredInitiatives = initiatives?.filter(init => {
    const matchesSearch = init.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          init.submitterName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === "all" || init.status === statusFilter;
    const matchesDept = deptFilter === "all" || init.department === deptFilter;
    return matchesSearch && matchesStatus && matchesDept;
  }) || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Initiatives</h2>
        <p className="text-muted-foreground">Manage and track all innovation initiatives.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row gap-4 justify-between space-y-0 pb-4">
          <CardTitle className="text-lg">All Initiatives</CardTitle>
          <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {settings && (
              <>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    {settings.statuses.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                
                <Select value={deptFilter} onValueChange={setDeptFilter}>
                  <SelectTrigger className="w-full sm:w-40">
                    <SelectValue placeholder="Department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {settings.departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Priority</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInitiatives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No initiatives found matching filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredInitiatives.map(init => (
                    <TableRow key={init.id} className="cursor-pointer hover:bg-muted/50">
                      <TableCell className="font-medium max-w-xs truncate">
                        <Link href={`/initiatives/${init.id}`} className="hover:underline text-primary">
                          {init.title}
                        </Link>
                      </TableCell>
                      <TableCell>{init.department}</TableCell>
                      <TableCell className="text-muted-foreground">{init.category}</TableCell>
                      <TableCell><StatusBadge status={init.status} /></TableCell>
                      <TableCell className="font-mono">{init.score}</TableCell>
                      <TableCell><PriorityBadge priority={init.priority} /></TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
