import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string }) {
  const getStatusColor = (s: string) => {
    switch (s.toLowerCase()) {
      case "idea":
        return "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200";
      case "review":
        return "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200";
      case "approved":
        return "bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-emerald-200";
      case "prototype":
        return "bg-amber-100 text-amber-700 hover:bg-amber-200 border-amber-200";
      case "pilot":
        return "bg-orange-100 text-orange-700 hover:bg-orange-200 border-orange-200";
      case "production":
        return "bg-green-100 text-green-700 hover:bg-green-200 border-green-200";
      case "closed":
        return "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200";
      case "declined":
        return "bg-red-100 text-red-700 hover:bg-red-200 border-red-200";
      default:
        return "bg-slate-100 text-slate-700 hover:bg-slate-200 border-slate-200";
    }
  };

  return (
    <Badge variant="outline" className={`font-medium ${getStatusColor(status)}`}>
      {status}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const getPriorityColor = (p: string) => {
    switch (p.toLowerCase()) {
      case "critical":
        return "bg-red-100 text-red-800 border-red-200";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "medium":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "low":
        return "bg-slate-100 text-slate-800 border-slate-200";
      default:
        return "bg-slate-100 text-slate-800 border-slate-200";
    }
  };

  return (
    <Badge variant="outline" className={`${getPriorityColor(priority)}`}>
      {priority}
    </Badge>
  );
}
