import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Rows returned by the mocked ai_usage_daily view — reassigned per test.
let mockRows: unknown[] = [];
let mockError: { message: string } | null = null;

vi.mock("@/integrations/supabase/client", () => {
  const builder = () => {
    const q = {
      select: () => q,
      gte: () => q,
      order: async () => ({ data: mockRows, error: mockError }),
    };
    return q;
  };
  return { supabase: { from: () => builder() } };
});

// recharts' ResponsiveContainer renders nothing at 0×0 in jsdom; these tests
// assert on the tiles and table, not chart geometry.
const { default: AiUsagePanel } = await import("@/components/settings/AiUsagePanel");

const today = new Date().toISOString().slice(0, 10);

describe("AiUsagePanel", () => {
  beforeEach(() => {
    mockRows = [];
    mockError = null;
  });

  it("shows the empty state when no usage is logged", async () => {
    render(<AiUsagePanel />);
    await waitFor(() =>
      expect(screen.getByText("No AI usage logged yet")).toBeInTheDocument(),
    );
  });

  it("shows the error state when the query fails", async () => {
    mockError = { message: "permission denied for view ai_usage_daily" };
    render(<AiUsagePanel />);
    await waitFor(() =>
      expect(screen.getByText(/Failed to load usage data/)).toBeInTheDocument(),
    );
  });

  it("renders summary tiles and the per-function table from daily rows", async () => {
    mockRows = [
      {
        usage_date: today,
        function_name: "extract-inbox-action-items",
        model: "claude-haiku-4-5",
        call_count: 40,
        input_tokens: 2_000_000,
        output_tokens: 100_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      {
        usage_date: today,
        function_name: "generate-1on1-prep",
        model: "claude-sonnet-4-6",
        call_count: 10,
        input_tokens: 1_000_000,
        output_tokens: 200_000,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    ];
    render(<AiUsagePanel />);

    await waitFor(() =>
      expect(screen.getByText("extract-inbox-action-items")).toBeInTheDocument(),
    );
    expect(screen.getByText("generate-1on1-prep")).toBeInTheDocument();
    // 40 + 10 calls
    expect(screen.getByText("50")).toBeInTheDocument();
    // Haiku: 2M*$1 + 0.1M*$5 = $2.50; Sonnet 4.6: 1M*$3 + 0.2M*$15 = $6.00 → $8.50
    expect(screen.getAllByText("$8.50").length).toBeGreaterThan(0);
    // Sonnet function costs more, so it sorts first in the table
    const cells = screen.getAllByRole("cell").map(c => c.textContent);
    expect(cells.indexOf("generate-1on1-prep")).toBeLessThan(
      cells.indexOf("extract-inbox-action-items"),
    );
  });
});
