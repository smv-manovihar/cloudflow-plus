"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteFile, downloadFile, listFiles } from "@/api/files.api";
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
import { syncFile, syncBucketAsyncFile, syncBucketAsync } from "@/api/sync.api";
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingFiles, setSyncingFiles] = useState<Set<string>>(new Set());
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingFolderName, setPendingFolderName] = useState<string>("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [deleteType, setDeleteType] = useState<"local" | "aws" | "both">(
    "local"
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareFile, setShareFile] = useState<FileItem | null>(null);
  const [shareExpires, setShareExpires] = useState("");
  const [sharePassword, setSharePassword] = useState("");
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
          return !(prefix && f.key === prefix);
        })
        .map((f) => {
          const isFolder = f.key.endsWith("/");
          const rel = relativeName(f.key);
          const name = isFolder ? rel.replace(/\/$/, "") : rel;
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
            syncStatus: f.synced as "pending" | "true" | "false",
            bucket,
            isShared: false,
            sharedLinkId: null,
            lastSynced: null,
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
    const res = await syncBucketAsync();
    if (res.success) {
      handleRefresh();
      toast.success("Sync completed", {
        id: toastId,
        duration: 2000,
      });
    } else {
      toast.error(res.error || "Failed to sync files", {
        id: toastId,
        duration: 3000,
      });
    }
    setIsSyncing(false);
  };

  const handleSyncFile = async (fileName: string, fileKey: string) => {
    setSyncingFiles((prev) => new Set(prev).add(fileName));
    const toastId = toast.loading(`Syncing ${fileName}...`);

    const file = currentPageData.find((f) => f.key === fileKey);
    const SIZE_THRESHOLD = 20 * 1024 * 1024;
    const isLargeFile = file ? file.sizeBytes > SIZE_THRESHOLD : false;

    const res = isLargeFile
      ? await syncBucketAsyncFile(fileKey)
      : await syncFile(fileKey);

    if (res.success) {
      if (isLargeFile) {
        setCurrentPageData((prev) =>
          prev.map((f) =>
            f.key === fileKey
              ? {
                  ...f,
                  syncStatus: "pending",
                  lastSynced: new Date().toLocaleString(),
                }
              : f
          )
        );
        toast.success(
          `${fileName} queued for sync. This may take a few minutes.`,
          { id: toastId, duration: 4000 }
        );
      } else {
        setCurrentPageData((prev) =>
          prev.map((f) =>
            f.key === fileKey
              ? {
                  ...f,
                  syncStatus: "true",
                  lastSynced: new Date().toLocaleString(),
                  syncedBucket: res.result?.status || f.syncedBucket,
                }
              : f
          )
        );
        toast.success(`${fileName} synced`, {
          id: toastId,
          duration: 2000,
        });
      }
      setSyncingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
    } else {
      setCurrentPageData((prev) =>
        prev.map((f) =>
          f.key === fileKey
            ? {
                ...f,
                syncStatus: "false",
                lastSynced: new Date().toLocaleString(),
              }
            : f
        )
      );
      setSyncingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
      toast.error(res.error || `Failed to sync ${fileName}`, {
        id: toastId,
      });
    }
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
    setDeleteType("local");
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
    let success = false;
    let errorMsg = "Delete failed";

    try {
      const result = await deleteFile(selectedFile.key, deleteType);
      if (result.success) {
        success = true;
        if (deleteType === "local" || deleteType === "both") {
          setCurrentPageData((prev) =>
            prev.filter((f) => f.key !== selectedFile.key)
          );
        } else if (deleteType === "aws") {
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
        }
      } else {
        errorMsg = result.error || errorMsg;
      }
    } catch (err) {
      errorMsg = "An unexpected error occurred during deletion.";
    }

    if (success) {
      let successMsg = "File deleted successfully";
      if (deleteType === "local") {
        successMsg = "Deleted from local bucket.";
      } else if (deleteType === "aws") {
        successMsg = "Deleted from AWS bucket.";
      } else if (deleteType === "both") {
        successMsg = "Deleted from both buckets.";
      }
      toast.success(successMsg, {
        id: toastId,
        duration: 2000,
      });
      setShowDeleteDialog(false);
      setSelectedFile(null);
    } else {
      toast.error(errorMsg, {
        id: toastId,
        duration: 3000,
      });
    }
    setIsDeleting(false);
  };

  const handleFolderClick = (folderName: string) => {
    const newPrefix = `${prefix}${folderName}/`;
    const encodedPrefix = encodeURIComponent(newPrefix);
    router.push(`/?prefix=${encodedPrefix}`);
  };

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
      if (prefix) {
        router.push(`/?prefix=${encodeURIComponent(prefix)}`);
      } else {
        router.push(`/`);
      }
    }
  };

  const handleNavigateUp = () => {
    if (!prefix) return;
    const parts = prefix.slice(0, -1).split("/");
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join("/") + "/" : "";
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

  const handleCreateFolderConfirm = useCallback(() => {
    const name = newFolderName.trim();
    if (name && !name.includes("/") && !name.includes("..")) {
      setPendingFolderName(name);
      setNewFolderName("");
      setShowCreateFolderDialog(false);
    } else {
      toast.error('Invalid folder name. Avoid slashes and ".."', {
        duration: 3000,
      });
    }
  }, [newFolderName]);

  const handleCreateCancelled = useCallback(() => {
    setPendingFolderName("");
    toast.info("Folder creation cancelled. No files were uploaded.", {
      duration: 2000,
    });
  }, []);

  const handleFolderCreated = useCallback(
    (name: string) => {
      const newPrefix = `${prefix || ""}${name}/`;
      router.push(`/?prefix=${encodeURIComponent(newPrefix)}`);
      setPendingFolderName("");
      toast.success(`Folder "${name}" created successfully!`, {
        duration: 2000,
      });
    },
    [prefix, router]
  );

  const isValidFolderName = useCallback((name: string) => {
    const trimmed = name.trim();
    return trimmed && !trimmed.includes("/") && !trimmed.includes("..");
  }, []);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card p-4 md:p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <div className="flex-1 relative flex gap-2">
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              className="flex-1 transition-all focus:ring-2 focus:ring-primary/50"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (searchQuery.trim()) {
                      handleSearch();
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
        {pendingFolderName && (
          <div className="m-4 p-4 bg-primary/30 rounded-lg flex flex-col sm:flex-row sm:items-center gap-3">
            <p className="text-sm flex-1">
              Upload files to create &quot;/{pendingFolderName}&quot;.
            </p>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleCreateCancelled}
              className="sm:ml-auto"
            >
              Cancel
            </Button>
          </div>
        )}

        <UploadDropzone
          className="m-4 mb-2 p-8 border-2 border-dashed border-gray-300 rounded-lg"
          onFilesUploaded={handleUploadComplete}
          prefix={prefix}
          folderToCreate={pendingFolderName || undefined}
          onFolderCreated={handleFolderCreated}
          onCreateCancelled={handleCreateCancelled}
        />

        <FileList
          files={currentPageData}
          isLoading={isLoading}
          viewMode={viewMode}
          syncingFiles={syncingFiles}
          showNavigateUp={prefix.endsWith("/")}
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
              This will sync all files in the current directory with AWS. This
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
        isDeleting={isDeleting}
        onDeleteTypeChange={setDeleteType}
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
              Enter a name for the new folder. You will then select at least one
              file to upload, which will create the folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name (no slashes)"
              onKeyDown={(e) =>
                e.key === "Enter" && handleCreateFolderConfirm()
              }
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
              Next: Select Files
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
