"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Copy, Eye, EyeOff, Trash2, SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  listSharedLinks,
  deleteSharedLink,
  updateSharedLink,
} from "@/api/share.api";
import { SharedLink } from "@/types/share.types";
import SharedPaginationControls from "./shared-pagination-controls";

export function SharedLinks() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [showExpired, setShowExpired] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [linkToRevoke, setLinkToRevoke] = useState<SharedLink | null>(null);
  const [links, setLinks] = useState<SharedLink[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const pageSize = 20;

  const fetchLinks = async (currentPage: number = page) => {
    setIsLoading(true);
    try {
      const response = await listSharedLinks(
        currentPage,
        pageSize,
        undefined,
        showExpired,
        searchQuery
      );
      if (response.success) {
        setLinks(response.result.items);
        setTotal(response.result.total);
        // Handle empty page by going to previous page
        if (response.result.items.length === 0 && currentPage > 1) {
          setPage(currentPage - 1);
        }
      } else {
        toast.error(response.error || "Failed to fetch shared links");
      }
    } catch (error) {
      toast.error("An error occurred while fetching shared links");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [searchQuery, showExpired]);

  useEffect(() => {
    fetchLinks();
  }, [page, showExpired, searchQuery]);

  const handleCopyLink = (linkId: string) => {
    const linkUrl = `${window.location.origin}/shared/${linkId}/download`;
    navigator.clipboard.writeText(linkUrl);
    toast.success("Link copied to clipboard", { duration: 2000 });
  };

  const handleToggleStatus = async (link: SharedLink) => {
    try {
      const response = await updateSharedLink(link.id, {
        enabled: !link.enabled,
      });
      if (response.success) {
        setLinks((prev) =>
          prev.map((l) =>
            l.id === link.id ? { ...l, enabled: response.result.enabled } : l
          )
        );
        toast.success(`Share link ${link.enabled ? "disabled" : "enabled"}`, {
          duration: 2000,
        });
      } else {
        toast.error(response.error || "Failed to update share status");
      }
    } catch (error) {
      toast.error("An error occurred while updating share status");
    }
  };

  const handleRevoke = async (linkId: string) => {
    try {
      const response = await deleteSharedLink(linkId);
      if (response.success) {
        toast.success("Share link revoked", { duration: 2000 });
        // Refetch to update list and total count efficiently
        fetchLinks();
      } else {
        toast.error(response.error || "Failed to revoke share link");
      }
    } catch (error) {
      toast.error("An error occurred while revoking share link");
    }
  };

  const confirmRevoke = () => {
    if (linkToRevoke) {
      handleRevoke(linkToRevoke.id);
      setRevokeDialogOpen(false);
      setLinkToRevoke(null);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return "Unknown";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const handlePrevious = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const handleNext = () => {
    const totalPages = Math.ceil(total / pageSize);
    setPage((p) => Math.min(totalPages, p + 1));
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card p-4 md:p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <Input
            placeholder="Search shared files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 transition-all focus:ring-2 focus:ring-primary/50"
          />
          <Button
            variant={showExpired ? "default" : "outline"}
            onClick={() => setShowExpired(!showExpired)}
            className="whitespace-nowrap transition-all hover:scale-105"
          >
            {showExpired ? "Hide Expired" : "Show Expired"}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-center animate-in fade-in duration-500">
            <p className="text-sm font-medium text-foreground">Loading...</p>
          </div>
        ) : links.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center animate-in fade-in duration-500">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                No shared links
              </p>
              <p className="text-xs text-muted-foreground">
                Share files to create links
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-6 space-y-3">
            {links.map((link, index) => (
              <Card
                key={link.id}
                className={cn(
                  "p-4 hover:shadow-md transition-all animate-in fade-in slide-in-from-left-2 duration-300",
                  !link.enabled && "opacity-60"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {link.name}
                      </p>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full font-medium animate-in fade-in duration-300",
                          link.enabled
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {link.enabled ? "Active" : "Disabled"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(link.size_bytes)} •{" "}
                      {link.expires_at
                        ? `Expires at ${new Date(
                            link.expires_at
                          ).toLocaleDateString()}`
                        : "No expiration"}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap md:flex-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(link.id)}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      <Copy className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Copy</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => router.push(`/shared/${link.id}/view`)}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      <SettingsIcon className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Manage</span>
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(link)}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      {link.enabled ? (
                        <>
                          <Eye className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Disable</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Enable</span>
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setLinkToRevoke(link);
                        setRevokeDialogOpen(true);
                      }}
                      className="flex-1 md:flex-none text-destructive hover:text-destructive hover:bg-destructive/20 transition-all hover:scale-105"
                    >
                      <Trash2 className="h-4 w-4 md:mr-2" />
                      <span className="hidden md:inline">Revoke</span>
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <SharedPaginationControls
        total={total}
        page={page}
        pageSize={pageSize}
        onPrevious={handlePrevious}
        onNext={handleNext}
      />

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Share Link</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the share link for &ldquo;
              {linkToRevoke?.name}&rdquo;? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="transition-all hover:scale-105">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-destructive-foreground transition-all hover:scale-105 hover:bg-red-600"
            >
              Revoke
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
