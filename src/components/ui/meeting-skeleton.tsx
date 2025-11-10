import { Card } from "@/components/ui/card";

/**
 * TeamMeeting-specific loading skeleton
 * Matches the complex layout with sidebar and multiple sections
 */
export function MeetingSkeleton() {
  return (
    <div className="min-h-screen bg-blue-50">
      {/* Header skeleton */}
      <header className="sticky top-0 z-50 border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="h-9 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse" />
            <div className="flex gap-3">
              <div className="h-9 w-9 bg-gray-200 rounded-full animate-pulse" />
              <div className="h-9 w-9 bg-gray-200 rounded-full animate-pulse" />
            </div>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="h-12 w-64 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>
      </header>

      {/* Main content with sidebar */}
      <main className="container mx-auto px-4 py-8">
        <div className="flex gap-6">
          {/* Sidebar skeleton */}
          <div className="hidden lg:block w-72 shrink-0">
            <Card className="p-6">
              <div className="h-7 w-32 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-5 w-full bg-gray-200 rounded animate-pulse" />
                ))}
              </div>
            </Card>
          </div>

          {/* Main content */}
          <div className="flex-1 space-y-8">
            {/* Priorities section */}
            <Card className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="h-8 w-32 bg-gray-200 rounded animate-pulse" />
                <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-16 w-full bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            </Card>

            {/* Topics section */}
            <Card className="p-6">
              <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 w-full bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            </Card>

            {/* Action Items section */}
            <Card className="p-6">
              <div className="h-8 w-40 bg-gray-200 rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 w-full bg-gray-100 rounded animate-pulse" />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

