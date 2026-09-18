"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { createFolder, deleteFile, downloadFile, listFiles } from "@/api/files.api";
import { createSharedLink, getSharedLinkId } from "@/api/share.api";
import ShareDialog from "./browser-share-file-dialog";
import {
  FileItem,
  PageCache,
  PaginationInfo,
  S3File,
  UploadFilesErrorResponse,
  UploadFilesResponse,
} from "@/types/files.types";
import { getSyncStatus, triggerFullSync, syncFile } from "@/api/sync.api";
import { getPublicPlatformConfig } from "@/api/admin.api";
import FileList from "./file-list";
import PaginationControls from "../layout/pagination-controls";
import { Button } from "../ui/button";
import {
  CloudSun,
  FolderPlus,
  Grid3x3,
  List,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";
import { UploadDropzone } from "./upload-dropzone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatFileSize } from "@/utils/helpers";
import DeleteDialog from "./browser-delete-file-dialog";
import { useBreadcrumbs } from "@/contexts/breadcrumbs.context";

export default function FileBrowser() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefix = searchParams.get("prefix") || "";
  const q = searchParams.get("q") || "";
  const { setBreadcrumbs } = useBreadcrumbs();

  const [currentPageData, setCurrentPageData] = useState<FileItem[]>([]);
  const [currentPagination, setCurrentPagination] =
    useState<PaginationInfo | null>(null);
  const [pageHistory, setPageHistory] = useState<PageCache[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchQuery, setSearchQuery] = useState(q);
  const [hasSyncTarget, setHasSyncTarget] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingFiles, setSyncingFiles] = useState<Set<string>>(new Set());
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [deleteType, setDeleteType] = useState<"local" | "aws" | "both">("both");
  const [isDeleting, setIsDeleting] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [shareExpires, setShareExpires] = useState("");
  const [sharePassword, setSharePassword] = useState("");
  const [shareTargetPreference, setShareTargetPreference] = useState<"primary" | "sync_target">("primary");
  const [showSyncConfirmDialog, setShowSyncConfirmDialog] = useState(false);

  const relativeName = useCallback(
    (key: string) => {
      const base = prefix || "";
      if (base && key.startsWith(base)) return key.substring(base.length);
      return key;
    },
    [prefix]
  );

  const transformFiles = useCallback(
    (s3Files: S3File[], bucket: string | null): FileItem[] => {
      return s3Files
        .filter((f) => {
          if (!f || typeof f.key !== "string") return false;
          return !(prefix && (f.key === prefix || f.key === `${prefix}/`));
        })
        .map((f) => {
          const isFolder = Boolean(f.is_folder || f.key.endsWith("/"));
          const rel = relativeName(f.key);
          const name = isFolder
            ? rel.replace(/^\/+|\/+$/g, "").split("/").pop() || rel
            : rel.replace(/^\/+/, "").split("/").pop() || rel;
          const size = formatFileSize(f.size_bytes || 0);
          return {
            name,
            size,
            sizeBytes: f.size_bytes || 0,
            modified: f.last_modified
              ? new Date(f.last_modified).toLocaleDateString()
              : "",
            isFolder,
            key: f.key,
            syncStatus: (f.synced || (f.sync_status === "synced" ? "true" : f.sync_status === "pending" ? "pending" : "false")) as "pending" | "true" | "false",
            bucket,
            isShared: Boolean(f.is_shared),
            sharedLinkId: f.shared_link_id || null,
            lastSynced: f.last_synced || null,
            syncedBucket: null,
          };
        });
    },
    [prefix, relativeName]
  );

  const loadFiles = useCallback(
    async (
      cursor: string | null = null,
      pageSize = 12
    ): Promise<PageCache | null> => {
      setIsLoading(true);
      try {
        const data = await listFiles(prefix, q, cursor, pageSize);
        if (!data.success) {
          toast.error(data.error || "Failed to load files from server", {
            duration: 3000,
          });
          setCurrentPageData([]);
          setCurrentPagination(null);
          return null;
        }
        const transformed = transformFiles(data.files || [], data.bucket);
        setCurrentPageData(transformed);
        setCurrentPagination(data.pagination || null);
        return {
          files: transformed,
          pagination: data.pagination || null,
        };
      } catch (err) {
        toast.error("Failed to load files", {
          duration: 3000,
        });
        setCurrentPageData([]);
        setCurrentPagination(null);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [prefix, q, transformFiles]
  );

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      const res = await loadFiles(null);
      if (!mounted) return;
      if (res) {
        setPageHistory([res]);
        setCurrentPageIndex(0);
      } else {
        setPageHistory([]);
        setCurrentPageIndex(0);
      }
    };
    initialize();
    setSearchQuery(q);
    getSyncStatus().then((res) => {
      setHasSyncTarget(Boolean(res?.has_sync_target));
    });
    getPublicPlatformConfig().then((cfg) => {
      if (cfg?.share_target_preference) {
        setShareTargetPreference(cfg.share_target_preference);
      }
      if (cfg && !cfg.sync_enabled) {
        setHasSyncTarget(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [prefix, q, loadFiles]);

  useEffect(() => {
    const updateBreadcrumbs = () => {
      const breadcrumbs = [{ label: "Home", href: "/" }];

      if (prefix) {
        const parts = prefix.split("/").filter(Boolean);
        let currentPath = "";

        parts.forEach((part) => {
          currentPath += `${part}/`;
          breadcrumbs.push({
            label: decodeURIComponent(part),
            href: `/?prefix=${encodeURIComponent(currentPath)}`,
          });
        });
      }

      setBreadcrumbs(breadcrumbs);
    };

    updateBreadcrumbs();
  }, [prefix, setBreadcrumbs]);

  const handleSync = async () => {
    setIsSyncing(true);
    const toastId = toast.loading("Syncing all files...");
    const res = await triggerFullSync();
    if (res && res.job_id) {
      handleRefresh();
      toast.success("Sync job queued", {
        id: toastId,
        duration: 2000,
      });
    } else {
      toast.error("Failed to sync files", {
        id: toastId,
        duration: 3000,
      });
    }
    setIsSyncing(false);
  };

  const handleSyncFile = async (fileName: string, fileKey: string) => {
    setSyncingFiles((prev) => new Set(prev).add(fileName));
    const toastId = toast.loading(`Syncing ${fileName}...`);

    const res = await syncFile(fileKey);

    if (res.success) {
      toast.success(`${fileName} synced successfully`, {
        id: toastId,
        duration: 2000,
      });
      setCurrentPageData((prev) =>
        prev.map((f) =>
          f.key === fileKey
            ? {
                ...f,
                syncStatus: "true",
                lastSynced: new Date().toLocaleString(),
              }
            : f
        )
      );
    } else {
      toast.error(res.error || `Failed to sync ${fileName}`, {
        id: toastId,
      });
    }
    setSyncingFiles((prev) => {
      const next = new Set(prev);
      next.delete(fileName);
      return next;
    });
  };

  const handleDownload = async (fileName: string, fileKey: string) => {
    const toastId = toast.loading(`Downloading ${fileName}...`);
    try {
      const result = await downloadFile(fileKey, fileName);
      if (result.success) {
        toast.success(`Downloaded ${fileName}`, {
          id: toastId,
          duration: 2000,
          dismissible: true,
        });
      } else {
        toast.error(result.error || `Failed to download ${fileName}`, {
          id: toastId,
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Download error:", error);
      toast.error(
        `An unexpected error occurred while downloading ${fileName}`,
        {
          id: toastId,
          duration: 3000,
        }
      );
    }
  };

  const handleDelete = async (fileName: string, fileKey: string) => {
    const file = currentPageData.find((f) => f.key === fileKey);
    if (!file) {
      toast.error(`File ${fileName} not found`, {
        duration: 3000,
      });
      return;
    }
    setSelectedFile(file);
    setDeleteType(file.syncStatus === "true" ? "both" : "local");
    setShowDeleteDialog(true);
  };

  const handleShare = async (fileName: string, fileKey: string) => {
    const file = currentPageData.find((f) => f.key === fileKey);
    if (!file) {
      toast.error(`File ${fileName} not found`, {
        duration: 3000,
      });
      return;
    }

    if (file.isShared) {
      router.push(`/shared/${file.sharedLinkId}/view`);
      return;
    }

    const linkResult = await getSharedLinkId(file.key);

    if (linkResult.success && linkResult.linkId) {
      setCurrentPageData((prev) =>
        prev.map((f) =>
          f.key === file.key
            ? { ...f, sharedLinkId: linkResult.linkId, isShared: true }
            : f
        )
      );

      router.push(`/shared/${linkResult.linkId}/view`);
      return;
    }

    setShareFile(file);
    setShareExpires("");
    setSharePassword("");
    setShowShareDialog(true);
  };

  const handleCreateShareLink = async () => {
    if (!shareFile || !shareFile.bucket) return;

    const toastId = toast.loading("Creating share link...");

    const payload = {
      bucket: shareFile.bucket,
      object_key: shareFile.key,
      password: sharePassword || undefined,
      expires_at: shareExpires ? new Date(shareExpires) : undefined,
    };

    const result = await createSharedLink(payload);

    if (result.success) {
      const shareUrl = `${window.location.origin}/shared/${result.result.id}/download`;
      await navigator.clipboard.writeText(shareUrl);

      toast.success("Share link created and copied to clipboard!", {
        id: toastId,
        duration: 3000,
      });

      setCurrentPageData((prev) =>
        prev.map((f) =>
          f.key === shareFile.key
            ? { ...f, isShared: true, sharedLinkId: result.result.id }
            : f
        )
      );
      router.push(`/shared/${result.result.id}/view`);
      setShowShareDialog(false);
      setShareFile(null);
    } else {
      toast.error(result.error || "Failed to create share link", {
        id: toastId,
        duration: 3000,
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedFile) return;

    setIsDeleting(true);
    const toastId = toast.loading(`Deleting ${selectedFile.name}...`);

    try {
      const result = await deleteFile(selectedFile.key, deleteType);
      if (result.success) {
        if (deleteType === "aws") {
          setCurrentPageData((prev) =>
            prev.map((f) =>
              f.key === selectedFile.key
                ? {
                    ...f,
                    syncStatus: "false",
                    lastSynced: null,
                    syncedBucket: null,
                  }
                : f
            )
          );
          toast.success("File removed from secondary sync storage.", {
            id: toastId,
            duration: 2000,
          });
        } else {
          setCurrentPageData((prev) =>
            prev.filter((f) => f.key !== selectedFile.key)
          );
          toast.success("File deleted successfully.", {
            id: toastId,
            duration: 2000,
          });
        }
        setShowDeleteDialog(false);
        setSelectedFile(null);
      } else {
        toast.error(result.error || "Delete failed", {
          id: toastId,
          duration: 3000,
        });
      }
    } catch (err) {
      toast.error("An unexpected error occurred during deletion.", {
        id: toastId,
        duration: 3000,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFolderClick = useCallback((folderKey: string) => {
    const clean = folderKey.replace(/^\/+|\/+$/g, "");
    const newPrefix = `${clean}/`;
    const encodedPrefix = encodeURIComponent(newPrefix);
    router.push(`/?prefix=${encodedPrefix}`);
  }, [router]);

  const handleFileClick = (fileName: string, fileKey: string) => {
    const current =
      typeof window !== "undefined"
        ? window.location.pathname +
          window.location.search +
          window.location.hash
        : "/";
    const from = encodeURIComponent(current);
    router.push(`/${encodeURIComponent(fileKey)}?from=${from}`);
  };

  const handleRefresh = useCallback(async () => {
    try {
      const res = await loadFiles(null, 12);
      if (res) {
        setPageHistory([res]);
        setCurrentPageIndex(0);
      }
      return res;
    } catch (error) {
      console.error("Refresh error:", error);
      toast.error("An unexpected error occurred during refresh", {
        duration: 3000,
      });
    } finally {
      setIsLoading(false);
    }
  }, [loadFiles]);

  const handleSearch = () => {
    const trimmed = searchQuery.trim();
    if (trimmed) {
      if (prefix) {
        router.push(
          `/?prefix=${encodeURIComponent(prefix)}&q=${encodeURIComponent(
            trimmed
          )}`
        );
      } else {
        router.push(`/?q=${encodeURIComponent(trimmed)}`);
      }
    } else {
      handleClearSearch();
    }
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    if (prefix) {
      router.push(`/?prefix=${encodeURIComponent(prefix)}`);
    } else {
      router.push(`/`);
    }
  };

  const handleNavigateUp = () => {
    if (!prefix) return;
    const parts = prefix.replace(/\/+$/, "").split("/").filter(Boolean);
    parts.pop();
    const newPrefix = parts.length > 0 ? `${parts.join("/")}/` : "";
    router.push(newPrefix ? `/?prefix=${encodeURIComponent(newPrefix)}` : "/");
  };

  const handleNextPage = useCallback(async () => {
    if (!currentPagination?.has_more || !currentPagination.next_cursor) return;
    const res = await loadFiles(currentPagination.next_cursor || null);
    if (res) {
      setPageHistory((prev) => {
        const newHistory = prev.slice(0, currentPageIndex + 1);
        return [...newHistory, res];
      });
      setCurrentPageIndex((p) => p + 1);
    }
  }, [currentPagination, currentPageIndex, loadFiles]);

  const handlePreviousPage = useCallback(() => {
    if (currentPageIndex === 0) return;
    const prevIndex = currentPageIndex - 1;
    const prevPage = pageHistory[prevIndex];
    setCurrentPageData(prevPage.files);
    setCurrentPagination(prevPage.pagination);
    setCurrentPageIndex(prevIndex);
  }, [currentPageIndex, pageHistory]);

  const handleUploadComplete = useCallback(
    (response: UploadFilesResponse | UploadFilesErrorResponse) => {
      if (response.success && response.uploads) {
        handleRefresh();
      }
    },
    [handleRefresh]
  );

  const handleCreateFolderConfirm = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || name.includes("/") || name.includes("..")) {
      toast.error('Invalid folder name. Avoid slashes and ".."', {
        duration: 3000,
      });
      return;
    }

    const folderPath = `${prefix || ""}${name}/`;
    const toastId = toast.loading(`Creating folder "${name}"...`);

    try {
      const res = await createFolder(folderPath);
      if (res && res.success) {
        toast.success(`Folder "${name}" created successfully!`, {
          id: toastId,
          duration: 2000,
        });
        setShowCreateFolderDialog(false);
        setNewFolderName("");
        handleFolderClick(folderPath);
      } else {
        toast.error(res?.error || `Failed to create folder "${name}"`, {
          id: toastId,
          duration: 3000,
        });
      }
    } catch (_err) {
      toast.error(`Error creating folder "${name}"`, {
        id: toastId,
        duration: 3000,
      });
    }
  }, [newFolderName, prefix, handleFolderClick]);

  const isValidFolderName = useCallback((name: string) => {
    const trimmed = name.trim();
    return trimmed && !trimmed.includes("/") && !trimmed.includes("..");
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card p-4 md:p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="flex-1 relative flex gap-2">
            <div className="relative flex-1">
              <Input
                placeholder={prefix ? `Search in /${prefix}...` : "Search all files & folders in database..."}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleSearch();
                  }
                }}
                className="w-full pr-8 transition-all focus:ring-2 focus:ring-primary/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={handleClearSearch}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (searchQuery.trim()) {
                      handleSearch();
                    } else {
                      handleClearSearch();
                    }
                  }}
                  className="transition-all hover:scale-105 bg-transparent"
                >
                  <Search className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Search</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="flex gap-2">
            {hasSyncTarget && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowSyncConfirmDialog(true)}
                    disabled={isSyncing}
                    className="transition-all hover:scale-105 bg-transparent"
                  >
                    <CloudSun
                      className={cn(
                        "h-4 w-4",
                        isSyncing && "animate-spin text-primary"
                      )}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Sync all files</p>
                </TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowCreateFolderDialog(true)}
                  className="transition-all hover:scale-105 bg-transparent"
                >
                  <FolderPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Create new folder</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isLoading}
                  className="transition-all hover:scale-105 bg-transparent"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", isLoading && "animate-spin")}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Refresh file list</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    setViewMode(viewMode === "grid" ? "list" : "grid")
                  }
                  className="transition-all hover:scale-105"
                >
                  {viewMode === "grid" ? (
                    <List className="h-4 w-4" />
                  ) : (
                    <Grid3x3 className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Toggle view</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-auto">
        {q && (
          <div className="mx-4 mt-3 p-3 bg-muted/60 border border-border rounded-lg flex items-center justify-between gap-3 text-sm animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center gap-2 text-foreground font-medium truncate">
              <Search className="h-4 w-4 text-primary shrink-0" />
              <span className="truncate">
                Database search for &quot;<span className="text-primary font-semibold">{q}</span>&quot;
                {prefix && (
                  <span className="text-muted-foreground font-normal">
                    {" "}inside /{prefix}
                  </span>
                )}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleClearSearch}
              className="h-7 px-2.5 text-xs shrink-0"
            >
              Clear
            </Button>
          </div>
        )}

        <UploadDropzone
          className="m-4 mb-2 p-8 border-2 border-dashed border-gray-300 rounded-lg"
          onFilesUploaded={handleUploadComplete}
          prefix={prefix}
        />

        <FileList
          files={currentPageData}
          isLoading={isLoading}
          viewMode={viewMode}
          hasSyncTarget={hasSyncTarget}
          syncingFiles={syncingFiles}
          showNavigateUp={prefix.endsWith("/")}
          isSearching={Boolean(q)}
          navigateUp={handleNavigateUp}
          onFileClick={handleFileClick}
          onFolderClick={handleFolderClick}
          onDownload={handleDownload}
          onShare={handleShare}
          onSyncFile={handleSyncFile}
          onDelete={handleDelete}
        />
        {currentPagination && (
          <>
            <div className="flex-1" />
            <PaginationControls
              pagination={currentPagination}
              currentPageIndex={currentPageIndex}
              onPrevious={handlePreviousPage}
              onNext={handleNextPage}
            />
          </>
        )}
      </div>

      {/* Sync Confirmation Dialog */}
      <AlertDialog
        open={showSyncConfirmDialog}
        onOpenChange={setShowSyncConfirmDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sync All Files?</AlertDialogTitle>
            <AlertDialogDescription>
              This will sync all files in the current directory with secondary backup storage. This
              operation may take some time depending on the number of files. Are
              you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowSyncConfirmDialog(false);
                handleSync();
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={(open) => {
          setShowDeleteDialog(open);
          if (!open) setSelectedFile(null);
        }}
        fileData={selectedFile}
        deleteType={deleteType}
        onDeleteTypeChange={setDeleteType}
        hasSyncTarget={hasSyncTarget}
        isDeleting={isDeleting}
        onDelete={handleDeleteConfirm}
      />

      {shareFile && (
        <ShareDialog
          open={showShareDialog}
          onOpenChange={(open) => {
            setShowShareDialog(open);
            if (!open) setShareFile(null);
          }}
          fileData={shareFile}
          objectKey={shareFile.key}
          expires={shareExpires}
          password={sharePassword}
          shareTargetPreference={shareTargetPreference}
          onExpiresChange={setShareExpires}
          onPasswordChange={setSharePassword}
          onCreateShareLink={handleCreateShareLink}
        />
      )}

      <Dialog
        open={showCreateFolderDialog}
        onOpenChange={setShowCreateFolderDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              {prefix
                ? `Create a subfolder inside /${prefix}`
                : "Create a new folder in root directory"}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name (e.g. Documents)"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && isValidFolderName(newFolderName)) {
                  e.preventDefault();
                  handleCreateFolderConfirm();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowCreateFolderDialog(false);
                setNewFolderName("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreateFolderConfirm}
              disabled={!isValidFolderName(newFolderName)}
            >
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
