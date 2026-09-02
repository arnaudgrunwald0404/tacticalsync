import React, { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseLocalDate } from "@/lib/dateUtils";
import { estimateCostUsd, formatUsd, normalizeModelId } from "@/lib/aiPricing";
import { cn } from "@/lib/utils";

interface UsageDailyRow {
  usage_date: string; // YYYY-MM-DD
  function_name: string;
  model: string;
  call_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
}

const RANGE_OPTIONS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
] as const;

// Validated categorical palette (fixed slot order — never cycled). Functions
// beyond the first 7 fold into a muted "Other" so the stack stays readable.
const SERIES_COLORS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
];
const OTHER_COLOR = "#898781";
const OTHER_KEY = "Other";
const MAX_SERIES = 7;

function rowCost(r: UsageDailyRow): number {
  return estimateCostUsd(r.model, r);
}

const AiUsagePanel: React.FC = () => {
  const [rows, setRows] = useState<UsageDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<number>(30);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const since = new Date();
      since.setDate(since.getDate() - 90);
      const { data, error: qErr } = await supabase
        .from("ai_usage_daily" as never)
        .select("*")
        .gte("usage_date", since.toISOString().slice(0, 10))
        .order("usage_date", { ascending: true });
      if (qErr) {
        setError(qErr.message);
      } else {
        setRows((data ?? []) as unknown as UsageDailyRow[]);
        setError(null);
      }
      setLoading(false);
    };
    load();
  }, []);

  // Stable series assignment: rank functions by cost over the full 90-day
  // fetch so switching the visible range never repaints a surviving series.
  const seriesOrder = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows) {
      totals.set(r.function_name, (totals.get(r.function_name) ?? 0) + rowCost(r));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([fn]) => fn);
  }, [rows]);

  const topFunctions = seriesOrder.slice(0, MAX_SERIES);
  const hasOther = seriesOrder.length > MAX_SERIES;

  const visibleRows = useMemo(() => {
    const since = new Date();
    since.setDate(since.getDate() - rangeDays);
    const sinceStr = since.toISOString().slice(0, 10);
    return rows.filter(r => r.usage_date >= sinceStr);
  }, [rows, rangeDays]);

  // One chart datum per day: { date, [fn]: cost, Other: cost }
  const chartData = useMemo(() => {
    const byDay = new Map<string, Record<string, number>>();
    for (const r of visibleRows) {
      const day = byDay.get(r.usage_date) ?? {};
      const key = topFunctions.includes(r.function_name) ? r.function_name : OTHER_KEY;
      day[key] = (day[key] ?? 0) + rowCost(r);
      byDay.set(r.usage_date, day);
    }
    return [...byDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => ({ date, ...values }));
  }, [visibleRows, topFunctions]);

  // Per-function rollup for the table
  const functionTable = useMemo(() => {
    const byFn = new Map<
      string,
      { calls: number; input: number; output: number; cacheRead: number; cost: number; models: Set<string> }
    >();
    for (const r of visibleRows) {
      const agg = byFn.get(r.function_name) ?? {
        calls: 0, input: 0, output: 0, cacheRead: 0, cost: 0, models: new Set<string>(),
      };
      agg.calls += r.call_count;
      agg.input += r.input_tokens + r.cache_creation_input_tokens + r.cache_read_input_tokens;
      agg.output += r.output_tokens;
      agg.cacheRead += r.cache_read_input_tokens;
      agg.cost += rowCost(r);
      agg.models.add(normalizeModelId(r.model));
      byFn.set(r.function_name, agg);
    }
    return [...byFn.entries()]
      .map(([fn, agg]) => ({ fn, ...agg }))
      .sort((a, b) => b.cost - a.cost);
  }, [visibleRows]);

  const totalCost = functionTable.reduce((s, f) => s + f.cost, 0);
  const totalCalls = functionTable.reduce((s, f) => s + f.calls, 0);
  const daysWithData = chartData.length;

  const colorFor = (fn: string): string => {
    const idx = topFunctions.indexOf(fn);
    return idx >= 0 ? SERIES_COLORS[idx] : OTHER_COLOR;
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-destructive">
          Failed to load usage data: {error}
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="font-medium mb-1">No AI usage logged yet</p>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Every edge function now records its Anthropic token usage here as it runs.
            Data starts accruing from the moment the updated functions are deployed —
            check back after the next inbox sync or brief generation.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex items-center gap-1">
        {RANGE_OPTIONS.map(opt => (
          <Button
            key={opt.days}
            variant={rangeDays === opt.days ? "default" : "ghost"}
            size="sm"
            onClick={() => setRangeDays(opt.days)}
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Estimated cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatUsd(totalCost)}</p>
            <p className="text-xs text-muted-foreground">last {rangeDays} days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">API calls</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{totalCalls.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">across {functionTable.length} functions</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg cost / day</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {formatUsd(daysWithData > 0 ? totalCost / daysWithData : 0)}
            </p>
            <p className="text-xs text-muted-foreground">{daysWithData} days with activity</p>
          </CardContent>
        </Card>
      </div>

      {/* Daily cost chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily cost by function</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e1e0d9" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d: string) => format(parseLocalDate(d), "MMM d")}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  tickLine={false}
                  axisLine={{ stroke: "#c3c2b7" }}
                />
                <YAxis
                  tickFormatter={(v: number) => formatUsd(v)}
                  tick={{ fontSize: 11, fill: "#898781" }}
                  tickLine={false}
                  axisLine={false}
                  width={56}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatUsd(value), name]}
                  labelFormatter={(d: string) => format(parseLocalDate(d), "EEE, MMM d")}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {topFunctions.map(fn => (
                  <Bar key={fn} dataKey={fn} stackId="cost" fill={colorFor(fn)} />
                ))}
                {hasOther && <Bar dataKey={OTHER_KEY} stackId="cost" fill={OTHER_COLOR} />}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per-function breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cost by function</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Function</TableHead>
                  <TableHead>Model(s)</TableHead>
                  <TableHead className="text-right">Calls</TableHead>
                  <TableHead className="text-right">Input tokens</TableHead>
                  <TableHead className="text-right">Output tokens</TableHead>
                  <TableHead className="text-right">Est. cost</TableHead>
                  <TableHead className="text-right">Avg / call</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {functionTable.map(f => (
                  <TableRow key={f.fn}>
                    <TableCell className="font-medium">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn("inline-block w-2.5 h-2.5 rounded-sm shrink-0")}
                          style={{ backgroundColor: colorFor(f.fn) }}
                        />
                        {f.fn}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {[...f.models].join(", ")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.calls.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.input.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.output.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatUsd(f.cost)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {f.calls > 0 ? formatUsd(f.cost / f.calls) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Costs are estimates computed from logged token counts at each model&rsquo;s
            list price (see src/lib/aiPricing.ts). High &ldquo;Avg / call&rdquo;
            values are the best optimization targets.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AiUsagePanel;
