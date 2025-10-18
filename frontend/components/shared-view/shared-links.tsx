"use client";

import { useState } from "react";
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

interface SharedLink {
  id: string;
  fileName: string;
  fileSize: number;
  link: string;
  status: "active" | "expired";
  expiresAt: string;
  createdAt: string;
  downloads: number;
}

export function SharedLinks() {
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState("");
  const [showExpired, setShowExpired] = useState(false);
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [linkToRevoke, setLinkToRevoke] = useState<SharedLink | null>(null);
  const [links, setLinks] = useState<SharedLink[]>([
    {
      id: "1",
      fileName: "presentation.pdf",
      fileSize: 2.5,
      link: "https://cloudflow.app/shared/abc123",
      status: "active",
      expiresAt: "2024-02-15",
      createdAt: "2024-01-15",
      downloads: 5,
    },
    {
      id: "2",
      fileName: "budget.xlsx",
      fileSize: 1.2,
      link: "https://cloudflow.app/shared/def456",
      status: "active",
      expiresAt: "2024-02-20",
      createdAt: "2024-01-10",
      downloads: 12,
    },
    {
      id: "3",
      fileName: "old-report.docx",
      fileSize: 0.8,
      link: "https://cloudflow.app/shared/ghi789",
      status: "expired",
      expiresAt: "2024-01-05",
      createdAt: "2023-12-15",
      downloads: 3,
    },
  ]);

  const filteredLinks = links.filter((link) => {
    const matchesSearch = link.fileName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesExpired = showExpired || link.status === "active";
    return matchesSearch && matchesExpired;
  });

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard", { duration: 2000 });
  };

  const handleToggleStatus = (id: string) => {
    setLinks((prev) =>
      prev.map((link) =>
        link.id === id
          ? { ...link, status: link.status === "active" ? "expired" : "active" }
          : link
      )
    );
    toast.success("Share status updated", { duration: 2000 });
  };

  const handleRevoke = (id: string) => {
    setLinks((prev) => prev.filter((link) => link.id !== id));
    toast.success("Share link revoked", { duration: 2000 });
  };

  const confirmRevoke = () => {
    if (linkToRevoke) {
      handleRevoke(linkToRevoke.id);
      setRevokeDialogOpen(false);
      setLinkToRevoke(null);
    }
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

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {filteredLinks.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-center animate-in fade-in duration-500">
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
            {filteredLinks.map((link, index) => (
              <Card
                key={link.id}
                className={cn(
                  "p-4 hover:shadow-md transition-all animate-in fade-in slide-in-from-left-2 duration-300",
                  link.status === "expired" && "opacity-60"
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {link.fileName}
                      </p>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full font-medium animate-in fade-in duration-300",
                          link.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {link.status === "active" ? "Active" : "Expired"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {link.fileSize} MB • Expires at {link.expiresAt}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap md:flex-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(link.link)}
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
                      onClick={() => handleToggleStatus(link.id)}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      {link.status === "active" ? (
                        <>
                          <Eye className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Active</span>
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-4 w-4 md:mr-2" />
                          <span className="hidden md:inline">Inactive</span>
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

      <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke Share Link</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke the share link for &ldquo;
              {linkToRevoke?.fileName}&rdquo;? This action cannot be undone.
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
