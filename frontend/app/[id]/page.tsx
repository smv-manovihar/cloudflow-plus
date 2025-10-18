"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Download,
  Share2,
  Trash2,
  Zap,
  ArrowLeft,
  Clock,
  HardDrive,
  Link2,
  Eye,
  Loader2,
  Calendar,
  Lock,
  Cloud,
  CloudCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FilePreview } from "@/components/files-view/file-preview";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadFile, getFileInfo, deleteFile } from "@/api/files.api";
import {
  FileInfoErrorResponse,
  FileInfoResponse,
  DeleteFileErrorResponse,
} from "@/types/files.types";
import { syncFile } from "@/api/sync.api";
import { createSharedLink, listSharedLinks } from "@/api/share.api";
import { CreateSharedLinkPayload, SharedLink } from "@/types/share.types";
import { formatFileSize } from "@/lib/helpers";

interface FileDetails {
  name: string;
  size: { value: string; unit: string };
  modified: string;
  type: string;
  bucket: string;
  objectKey: string;
  isShared: boolean;
  isSynced: boolean;
  lastSynced: string | null;
  syncedBucket?: string | null;
  sharedLink?: SharedLink;
}

export default function FileDetailsPage() {
  const router = useRouter();
  const params = useParams();
  const objectKey = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileData, setFileData] = useState<FileDetails | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [deleteType, setDeleteType] = useState<"local" | "aws">("local");

  // Share creation states
  const [expires, setExpires] = useState<string>("");
  const [password, setPassword] = useState<string>("");

  // Fetch file info on mount
  useEffect(() => {
    const fetchFileInfo = async () => {
      if (!objectKey) {
        setError("No file ID provided");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        const response = await getFileInfo(objectKey);

        if ("success" in response && response.success) {
          const apiData = response as FileInfoResponse;
          // Derive file name from object_key (basename) as API doesn't provide explicit 'name' field
          const fileName =
            apiData.object_key.split("/").pop() || apiData.object_key;
          const fileSizeBytes = apiData.content_length || 0;
          const fileType = getFileType(fileName);

          let details: FileDetails = {
            name: fileName, // Use API-derived name for header
            size: formatFileSize(fileSizeBytes),
            modified: new Date(apiData.last_modified).toLocaleString(),
            type: fileType,
            bucket: apiData.bucket || "",
            objectKey: apiData.object_key,
            isShared: apiData.is_shared || false,
            isSynced: apiData.synced || false,
            lastSynced: apiData.last_synced
              ? new Date(apiData.last_synced).toLocaleString()
              : null,
            syncedBucket: apiData.aws_bucket || null,
          };

          // If shared, fetch the shared link
          if (details.isShared) {
            const linksRes = await listSharedLinks(
              1,
              1,
              undefined,
              false,
              objectKey
            );
            if (
              "success" in linksRes &&
              linksRes.success &&
              linksRes.result.items.length > 0
            ) {
              details = { ...details, sharedLink: linksRes.result.items[0] };
            }
          }

          setFileData(details);
        } else {
          const apiError = response as FileInfoErrorResponse;
          setError(apiError.error || "Failed to fetch file info");
        }
      } catch (err) {
        console.error("Error fetching file info:", err);
        setError("An unexpected error occurred while fetching file info.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchFileInfo();
  }, [objectKey]);

  const getFileType = (fileName: string): string => {
    const extension = fileName.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      pdf: "application/pdf",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      txt: "text/plain",
      doc: "application/msword",
      docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
    return mimeTypes[extension] || "application/octet-stream";
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading file details...</p>
        </div>
      </div>
    );
  }

  if (error || !fileData) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Error</h2>
          <p className="text-muted-foreground mb-4">
            {error || "File not found"}
          </p>
          <Button onClick={() => router.back()} variant="outline">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const handleSync = async () => {
    setIsSyncing(true);
    const toastId = toast.loading(`Syncing ${fileData.name}...`);
    const res = await syncFile(fileData.objectKey);
    if (res.success) {
      toast.success(`${fileData.name} synced successfully`, {
        id: toastId,
        duration: 2000,
      });

      setFileData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          isSynced: true,
          lastSynced: new Date().toLocaleString(),
        };
      });
    } else {
      toast.error(res.error || "Sync failed", { id: toastId });
    }
    setIsSyncing(false);
  };

  const handleDownload = async () => {
    const toastId = toast.loading(`Downloading ${fileData.name}...`);
    const res = await downloadFile(objectKey, fileData.name);
    if (res.success) {
      toast.success(`Downloaded ${fileData.name}`, {
        id: toastId,
        duration: 2000,
      });
    } else {
      toast.error(res.error, { id: toastId });
    }
  };

  const handleShare = () => {
    if (fileData.isShared && fileData.sharedLink) {
      router.push(`/share/${fileData.sharedLink.id}/view`);
    } else {
      setShowShareDialog(true);
    }
  };

  const handleCreateShareLink = async () => {
    const payload: CreateSharedLinkPayload = {
      bucket: fileData.bucket,
      object_key: objectKey,
      ...(expires && { expires_at: new Date(expires) }),
      ...(password && { password }),
    };

    const res = await createSharedLink(payload);
    if (res.success) {
      toast.success("Share link created successfully");
      // Update local state
      const updatedFileData = {
        ...fileData,
        isShared: true,
        sharedLink: res.result,
      };
      setFileData(updatedFileData);
      // Reset form
      setExpires("");
      setPassword("");
    } else {
      toast.error(res.error || "Failed to create share link");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const sync = deleteType === "aws";
    const toastId = toast.loading(`Deleting ${fileData.name}...`);
    const response = await deleteFile(objectKey, sync);
    if ("success" in response && response.success) {
      toast.success(
        `File deleted successfully${sync ? " (including from AWS)" : ""}`,
        { id: toastId }
      );
      setIsDeleting(false);
      setShowDeleteDialog(false);
      // Redirect back to home
      setTimeout(() => router.push("/"), 500);
    } else {
      const apiError = response as DeleteFileErrorResponse;
      toast.error(apiError.error || "Delete failed", { id: toastId });
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card p-2 md:p-3 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex items-center gap-4 mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="hover:scale-110 transition-transform"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm md:text-xl font-bold text-foreground truncate">
              {fileData.name} {/* Displays API-derived file name */}
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground">
              Object Key: {fileData.objectKey}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 ml-2">
          <Button
            onClick={!fileData.isSynced ? handleSync : undefined}
            disabled={isSyncing || fileData.isSynced}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground animate-in fade-in slide-in-from-left-2 duration-500"
            size="sm"
          >
            {fileData.isSynced ? (
              <>
                <CloudCheck className="h-4 w-4" />
                <span className="hidden md:inline">Synced</span>
              </>
            ) : (
              <>
                <Cloud className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                <span className="hidden md:inline">
                  {isSyncing ? "Syncing..." : "Sync"}
                </span>
              </>
            )}
          </Button>

          <Button
            onClick={handleDownload}
            variant="outline"
            className="gap-2 animate-in fade-in slide-in-from-left-2 duration-500 delay-100 bg-transparent"
            size="sm"
          >
            <Download className="h-4 w-4" />
            <span className="hidden md:inline">Download</span>
          </Button>

          <Button
            onClick={() => setShowPreview(true)}
            variant="outline"
            className="gap-2 animate-in fade-in slide-in-from-left-2 duration-500 delay-150 bg-transparent"
            size="sm"
          >
            <Eye className="h-4 w-4" />
            <span className="hidden md:inline">Preview</span>
          </Button>

          <Button
            onClick={handleShare}
            variant="outline"
            className="gap-2 animate-in fade-in slide-in-from-left-2 duration-500 delay-200 bg-transparent"
            size="sm"
          >
            <Share2 className="h-4 w-4" />
            <span className="hidden md:inline">
              {fileData.isShared ? "Manage" : "Create Share Link"}
            </span>
          </Button>

          <Button
            onClick={() => setShowDeleteDialog(true)}
            variant="outline"
            className="gap-2 text-destructive hover:text-destructive animate-in fade-in slide-in-from-left-2 duration-500 delay-250"
            size="sm"
          >
            <Trash2 className="h-4 w-4" />
            <span className="hidden md:inline">Delete</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          {/* File Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
            {/* Left Column - Basic Info */}
            <Card className="p-4 md:p-6 space-y-4">
              <h3 className="font-semibold text-foreground">
                File Information
              </h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    File Name
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {fileData.name}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    File Size
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {fileData.size
                      ? `${fileData.size.value} ${fileData.size.unit}`
                      : "0 B"}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Object Key
                  </span>
                  <span className="text-xs font-mono text-foreground truncate">
                    {fileData.objectKey}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Bucket</span>
                  <span className="text-sm font-medium text-foreground">
                    {fileData.bucket}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Last Modified
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {fileData.modified}
                  </span>
                </div>
              </div>
            </Card>

            {/* Right Column - Status Info */}
            <Card className="p-4 md:p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Status & Sync</h3>

              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Share2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-muted-foreground">
                      Shared Status
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {fileData.isShared ? "Shared" : "Not Shared"}
                  </span>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm text-muted-foreground">
                      Sync Status
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {fileData.isSynced ? "Synced" : "Not Synced"}
                  </span>
                </div>

                {fileData.isSynced && fileData.syncedBucket && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <HardDrive className="h-4 w-4 text-blue-600" />
                      <span className="text-sm text-muted-foreground">
                        Synced to Bucket
                      </span>
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {fileData.syncedBucket}
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-muted-foreground">
                      Last Synced
                    </span>
                  </div>
                  <span className="text-sm font-medium text-foreground">
                    {fileData.lastSynced || "Never"}
                  </span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="flex flex-col w-full sm:w-[min(92vw,64rem)] max-w-4xl h-auto max-h-[85vh] sm:max-h-[80vh] p-0 m-0 bg-background rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
          <DialogHeader className="p-2 sm:p-4 border-b flex-shrink-0">
            <DialogTitle className="text-sm sm:text-base leading-tight">
              Preview
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {fileData.name}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            <FilePreview
              objectKey={objectKey}
              fileName={fileData.name}
              fileType={fileData.type}
              className="h-full"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete{" "}
              <span className="font-semibold text-foreground">
                {fileData.name}
              </span>
              ? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {/* Delete Type Selection */}
          <div className="space-y-4 mb-4">
            <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
              <Button
                type="button"
                variant={deleteType === "local" ? "default" : "outline"}
                size="sm"
                onClick={() => setDeleteType("local")}
                className="flex-1"
              >
                Delete Local Only
              </Button>
              <Button
                type="button"
                variant={deleteType === "aws" ? "default" : "outline"}
                size="sm"
                onClick={() => setDeleteType("aws")}
                className="flex-1"
                disabled={!fileData.isSynced}
              >
                Delete from AWS Too
                {fileData.isSynced ? "" : " (Not Synced)"}
              </Button>
            </div>
            <p
              className={cn(
                "text-xs text-muted-foreground",
                deleteType === "aws" && "text-destructive"
              )}
            >
              {deleteType === "local"
                ? "This will only remove the file from the local bucket."
                : "This will remove the file from both local and AWS buckets."}
            </p>
          </div>

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
              className="gap-2"
            >
              {isDeleting
                ? "Deleting..."
                : `Delete ${deleteType === "aws" ? "(AWS Too)" : ""}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
          <DialogHeader>
            <DialogTitle>Create Share Link</DialogTitle>
            <DialogDescription>
              Create a shareable link for this file
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Create form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="expires" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Expires At (optional)
                </Label>
                <Input
                  id="expires"
                  type="datetime-local"
                  value={expires}
                  onChange={(e) => setExpires(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Password (optional)
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowShareDialog(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreateShareLink}
                className="gap-2 bg-primary hover:bg-primary/90"
                disabled={!fileData.bucket || !objectKey}
              >
                <Link2 className="h-4 w-4" />
                Create Share Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
