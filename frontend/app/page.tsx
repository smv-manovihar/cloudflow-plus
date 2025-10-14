"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BucketsView, type BucketItem } from "@/components/buckets-view";
import { LayoutList, Grid3x3, Plus, RefreshCw } from "lucide-react";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CreateBucketDialog } from "@/components/create-bucket-dialog";
import { awsApi } from "@/api/aws.api";
import { toast } from "sonner";

export default function BucketsPage() {
  const router = useRouter();
  const [view, setView] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [buckets, setBuckets] = useState<BucketItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBuckets = async (showRefreshToast = false) => {
    try {
      if (showRefreshToast) {
        setIsRefreshing(true);
      }
      const result = await awsApi.listBuckets();
      if (result.success) {
        // Transform API response to match BucketItem interface
        const transformedBuckets = result.buckets.map((bucket: any) => ({
          id: bucket.Name, // Changed from bucket.name
          name: bucket.Name, // Changed from bucket.name
          updatedAt: bucket.CreationDate
            ? new Date(bucket.CreationDate).toISOString().split("T")[0]
            : new Date().toISOString().split("T")[0],
        }));
        setBuckets(transformedBuckets);
        if (showRefreshToast) {
          toast.success("Buckets refreshed successfully");
        }
      }
    } catch (error) {
      console.error("Error fetching buckets:", error);
      toast.error("Failed to load buckets");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBuckets();
  }, []);

  const handleCreateBucket = async (bucketName: string) => {
    const result = await awsApi.createBucket(bucketName);
    if (result.success) {
      toast.success(`Bucket "${bucketName}" created successfully`);
      setShowCreate(false);
      // Refresh the buckets list
      await fetchBuckets();
    }
    return result.success;
  };

  const handleRefresh = () => {
    fetchBuckets(true);
  };

  const filtered = useMemo(
    () =>
      query
        ? buckets.filter((b) =>
            b.name.toLowerCase().includes(query.toLowerCase())
          )
        : buckets,
    [buckets, query]
  );

  return (
    <div className="min-h-dvh grid md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="p-4 md:p-6">
        <header className="mb-6">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Buckets" }]}
          />

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:gap-3">
              <h1 className="text-balance text-2xl font-semibold tracking-tight">
                Buckets
              </h1>
              <div className="md:ml-2">
                <label htmlFor="search" className="sr-only">
                  Search buckets
                </label>
                <Input
                  id="search"
                  placeholder="Search buckets"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full sm:w-[260px]"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 self-stretch md:self-auto">
              <Button
                variant="outline"
                size="icon"
                aria-label="Refresh buckets"
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw
                  className={`size-4 ${isRefreshing ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="secondary"
                aria-label="Create bucket"
                onClick={() => setShowCreate(true)}
                disabled={isLoading}
              >
                <Plus className="mr-2 size-4" />
                Create Bucket
              </Button>
              <ToggleGroup
                type="single"
                value={view}
                onValueChange={(v) => v && setView(v as "list" | "grid")}
                aria-label="Choose buckets view"
                disabled={isLoading}
              >
                <ToggleGroupItem
                  value="list"
                  aria-label="List view"
                  className="data-[state=on]:bg-muted"
                >
                  <LayoutList className="size-4" />
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="grid"
                  aria-label="Grid view"
                  className="data-[state=on]:bg-muted"
                >
                  <Grid3x3 className="size-4" />
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
        </header>

        <section aria-label="Buckets browser">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex flex-col items-center gap-2">
                <RefreshCw className="size-8 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Loading buckets...
                </p>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-muted-foreground">
                {query
                  ? `No buckets found matching "${query}"`
                  : "No buckets found. Create one to get started."}
              </p>
            </div>
          ) : (
            <BucketsView
              items={filtered}
              view={view}
              onOpen={(b) =>
                router.push(`/buckets/${encodeURIComponent(b.id)}`)
              }
            />
          )}
        </section>

        <CreateBucketDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onCreateBucket={handleCreateBucket}
        />
      </main>
    </div>
  );
}
