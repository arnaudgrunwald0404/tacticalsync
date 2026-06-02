import { Card } from "@/components/ui/card";

export function ContentSkeleton() {
  return (
    <main className="flex-1 container mx-auto px-4 py-8 space-y-6">
      <div className="h-10 w-64 bg-gray-200 rounded animate-pulse mb-8" />

      <Card className="p-6">
        <div className="space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-5/6 bg-gray-200 rounded animate-pulse" />
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse" />
        </div>
      </Card>
    </main>
  );
}
