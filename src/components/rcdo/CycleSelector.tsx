import { useNavigate, useLocation } from "react-router-dom";
import { useCycles } from "@/hooks/useRCDO";
import { parseLocalDate } from "@/lib/dateUtils";
import { format } from "date-fns";
import { ChevronDown } from "lucide-react";

interface CycleSelectorProps {
  currentCycleId?: string;
}

/**
 * Cycle picker dropdown for the RCDO secondary toolbar.
 * Renders inline — parent is responsible for layout positioning.
 */
export function CycleSelector({ currentCycleId }: CycleSelectorProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { cycles, loading } = useCycles();

  if (loading || cycles.length === 0) return null;

  const handleChange = (cycleId: string) => {
    if (!cycleId) return;
    // Stay on current page type (canvas vs detail) when switching cycles
    if (location.pathname.includes("/rcdo/canvas")) {
      navigate(`/rcdo/canvas?cycle=${cycleId}`);
    } else if (location.pathname.includes("/rcdo/all-hands")) {
      navigate(`/rcdo/all-hands?cycle=${cycleId}`);
    } else {
      navigate(`/rcdo/canvas?cycle=${cycleId}`);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">Cycle:</span>
      <div className="relative">
        <select
          value={currentCycleId || ""}
          onChange={(e) => handleChange(e.target.value)}
          className="appearance-none bg-transparent text-sm font-medium pr-6 pl-2 py-1 rounded-md border border-border/60 hover:border-border cursor-pointer focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {!currentCycleId && (
            <option value="" disabled>Select a cycle</option>
          )}
          {cycles.map((cycle) => (
            <option key={cycle.id} value={cycle.id}>
              {format(parseLocalDate(cycle.start_date), "MMM yyyy")} – {format(parseLocalDate(cycle.end_date), "MMM yyyy")}
              {cycle.status === "active" ? " (Active)" : cycle.status === "draft" ? " (Draft)" : ""}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
      </div>
    </div>
  );
}
