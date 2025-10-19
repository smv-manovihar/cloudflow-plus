"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  deleteFile,
  downloadFile,
  getFileInfo,
  listFiles,
} from "@/api/files.api";
import {
  FileItem,
  PageCache,
  PaginationInfo,
  S3File,
  UploadFilesErrorResponse,
  UploadFilesResponse,
} from "@/types/files.types";
import FileList from "./files-list";
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
import { syncBucket, syncFile } from "@/api/sync.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatFileSize } from "@/utils/helpers";

export default function FileBrowser() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prefix = searchParams.get("prefix") || "";

  const [currentPageData, setCurrentPageData] = useState<FileItem[]>([]);
  const [currentPagination, setCurrentPagination] =
    useState<PaginationInfo | null>(null);
  const [pageHistory, setPageHistory] = useState<PageCache[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("list");
  const [searchQuery, setSearchQuery] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncingFiles, setSyncingFiles] = useState<Set<string>>(new Set());
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingFolderName, setPendingFolderName] = useState<string>("");

  const relativeName = useCallback(
    (key: string) => {
      const base = prefix || "";
      if (base && key.startsWith(base)) return key.substring(base.length);
      return key;
    },
    [prefix]
  );

  const transformFiles = useCallback(
    (s3Files: S3File[]): FileItem[] => {
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
            modified: f.last_modified
              ? new Date(f.last_modified).toLocaleDateString()
              : "",
            isFolder,
            key: f.key,
            synced: Boolean(f.synced),
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
        const data = await listFiles(prefix, cursor, pageSize);
        if (!data.success) {
          toast.error(data.error || "Failed to load files from server", {
            duration: 3000,
          });
          setCurrentPageData([]);
          setCurrentPagination(null);
          return null;
        }
        const transformed = transformFiles(data.files || []);
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
    [prefix, transformFiles]
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
    setSearchQuery("");
    return () => {
      mounted = false;
    };
  }, [prefix, loadFiles]);

  const handleSync = async () => {
    setIsSyncing(true);
    const toastId = toast.loading("Syncing all files...");
    const res = await syncBucket();
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
    const res = await syncFile(fileKey);
    if (res.success) {
      setCurrentPageData((prev) =>
        prev.map((f) => (f.key === fileKey ? { ...f, synced: true } : f))
      );
      setSyncingFiles((prev) => {
        const next = new Set(prev);
        next.delete(fileName);
        return next;
      });
      toast.success(`${fileName} synced`, {
        id: toastId,
        duration: 2000,
      });
    } else {
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

  const handleShare = async (fileName: string, fileKey: string) => {
    const toastId = toast.loading(`Generating share link for ${fileName}...`);
    try {
      const fileInfo = await getFileInfo(fileKey);
      if (fileInfo.success) {
        const dummyLink = `${window.location.origin}/share/${fileKey}`;
        navigator.clipboard.writeText(dummyLink);
        toast.success(`Share link created for ${fileName}`, {
          id: toastId,
          duration: 2000,
        });
        toast.success(`Link for ${fileName} copied to clipboard`, {
          duration: 2000,
        });
      } else {
        toast.error(
          fileInfo.error || `Failed to create share link for ${fileName}`,
          {
            id: toastId,
            duration: 3000,
          }
        );
      }
    } catch (error) {
      console.error("Share error:", error);
      toast.error(`An unexpected error occurred while sharing ${fileName}`, {
        id: toastId,
        duration: 3000,
      });
    }
  };

  const handleDelete = async (fileName: string, fileKey: string) => {
    // setDeleteDialogOpen(true);
    // setDeleteType("local");
    const toastId = toast.loading(`Deleting ${fileName}...`);
    try {
      const result = await deleteFile(fileKey, false);
      if (result.success) {
        setCurrentPageData((prev) => prev.filter((f) => f.key !== fileKey));
        toast.success(`${fileName} deleted`, {
          id: toastId,
          duration: 2000,
        });
      } else {
        toast.error(result.error || `Failed to delete ${fileName}`, {
          id: toastId,
          duration: 3000,
        });
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error(`An unexpected error occurred while deleting ${fileName}`, {
        id: toastId,
        duration: 3000,
      });
    }
  };

  const handleFolderClick = (folderName: string) => {
    const newPrefix = `${prefix}${folderName}/`;
    router.push(`/?prefix=${encodeURIComponent(newPrefix)}`);
  };

  const handleFileClick = (fileName: string, fileKey: string) => {
    router.push(`/${encodeURIComponent(fileKey)}`);
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
    if (searchQuery.trim()) {
      router.push(`/?prefix=${encodeURIComponent(searchQuery)}`);
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
            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                if (searchQuery.trim()) {
                  handleSearch();
                }
              }}
              title="Search"
              className="transition-all hover:scale-105 bg-transparent"
            >
              <Search className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={handleSync}
              disabled={isSyncing}
              title="Sync all files"
              className="transition-all hover:scale-105 bg-transparent"
            >
              <CloudSun
                className={cn(
                  "h-4 w-4",
                  isSyncing && "animate-spin text-primary"
                )}
              />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setShowCreateFolderDialog(true)}
              title="Create new folder"
              className="transition-all hover:scale-105 bg-transparent"
            >
              <FolderPlus className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRefresh}
              disabled={isLoading}
              title="Refresh file list"
              className="transition-all hover:scale-105 bg-transparent"
            >
              <RefreshCw
                className={cn("h-4 w-4", isLoading && "animate-spin")}
              />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              title="Toggle view"
              className="transition-all hover:scale-105"
            >
              {viewMode === "grid" ? (
                <List className="h-4 w-4" />
              ) : (
                <Grid3x3 className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {/* <Breadcrumbs prefix={prefix} router={router} /> */}
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
