import { Card } from "@/components/ui/card";

/**
 * Dashboard-specific loading skeleton
 * Matches the layout of the Dashboard page with team cards
 */
export function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header skeleton */}
      <header className="sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="h-8 w-40 bg-gray-200 rounded animate-pulse" />
            <div className="flex gap-3">
              <div className="h-10 w-10 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {/* Welcome section */}
        <div className="mb-8">
          <div className="h-10 w-64 bg-gray-200 rounded animate-pulse mb-3" />
          <div className="h-5 w-96 bg-gray-200 rounded animate-pulse" />
        </div>

        {/* Team cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
                  <div className="h-6 w-16 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="space-y-2">
                  <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
                  <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
                </div>
                <div className="flex gap-2 pt-2">
                  <div className="h-9 flex-1 bg-gray-200 rounded animate-pulse" />
                  <div className="h-9 w-9 bg-gray-200 rounded animate-pulse" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}

