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
  Eye,
  Loader2,
  Cloud,
  CloudCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { downloadFile, getFileInfo, deleteFile } from "@/api/files.api";
import {
  FileInfoErrorResponse,
  FileInfoResponse,
  DeleteFileErrorResponse,
  FileDetails,
} from "@/types/files.types";
import { syncFile } from "@/api/sync.api";
import { createSharedLink } from "@/api/share.api";
import { CreateSharedLinkPayload } from "@/types/share.types";
import { formatFileSize } from "@/utils/helpers";
import ShareDialog from "@/components/files-view/share-file-dialog";
import DeleteDialog from "@/components/files-view/delete-file-dialog";
import PreviewDialog from "@/components/files-view/preview-dialog";

// Header Component
interface HeaderProps {
  fileName: string;
  objectKey: string;
  fileData: FileDetails;
  isSyncing: boolean;
  onBack: () => void;
  onSync: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onShare: () => void;
  onDelete: () => void;
}
function Header({
  fileName,
  objectKey,
  fileData,
  isSyncing,
  onBack,
  onSync,
  onDownload,
  onPreview,
  onShare,
  onDelete,
}: HeaderProps) {
  return (
    <div className="border-b border-border bg-card p-2 md:p-3 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="flex items-center gap-4 mb-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={onBack}
          className="hover:scale-110 transition-transform"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-sm md:text-xl font-bold text-foreground truncate">
            {fileName}
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Object Key: {objectKey}
          </p>
        </div>
      </div>
      <ActionButtons
        fileData={fileData}
        isSyncing={isSyncing}
        onSync={onSync}
        onDownload={onDownload}
        onPreview={onPreview}
        onShare={onShare}
        onDelete={onDelete}
      />
    </div>
  );
}

// Action Buttons Component
interface ActionButtonsProps {
  fileData: FileDetails;
  isSyncing: boolean;
  onSync: () => void;
  onDownload: () => void;
  onPreview: () => void;
  onShare: () => void;
  onDelete: () => void;
}
function ActionButtons({
  fileData,
  isSyncing,
  onSync,
  onDownload,
  onPreview,
  onShare,
  onDelete,
}: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-2 ml-2">
      <Button
        onClick={!fileData.isSynced ? onSync : undefined}
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
        onClick={onDownload}
        variant="outline"
        className="gap-2 animate-in fade-in slide-in-from-left-2 duration-500 delay-100 bg-transparent"
        size="sm"
      >
        <Download className="h-4 w-4" />
        <span className="hidden md:inline">Download</span>
      </Button>
      <Button
        onClick={onPreview}
        variant="outline"
        className="gap-2 animate-in fade-in slide-in-from-left-2 duration-500 delay-150 bg-transparent"
        size="sm"
      >
        <Eye className="h-4 w-4" />
        <span className="hidden md:inline">Preview</span>
      </Button>
      <Button
        onClick={onShare}
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
        onClick={onDelete}
        variant="outline"
        className="gap-2 text-destructive hover:text-destructive animate-in fade-in slide-in-from-left-2 duration-500 delay-250"
        size="sm"
      >
        <Trash2 className="h-4 w-4" />
        <span className="hidden md:inline">Delete</span>
      </Button>
    </div>
  );
}

// File Info Card Component
interface FileInfoCardProps {
  fileData: FileDetails;
}
function FileInfoCard({ fileData }: FileInfoCardProps) {
  return (
    <Card className="p-4 md:p-6 space-y-4">
      <h3 className="font-semibold text-foreground">File Information</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">File Name</span>
          <span className="text-sm font-medium text-foreground truncate">
            {fileData.name}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">File Size</span>
          <span className="text-sm font-medium text-foreground">
            {fileData.size
              ? `${fileData.size.value} ${fileData.size.unit}`
              : "0 B"}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Object Key</span>
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
          <span className="text-sm text-muted-foreground">Last Modified</span>
          <span className="text-sm font-medium text-foreground">
            {fileData.modified}
          </span>
        </div>
      </div>
    </Card>
  );
}

// Status Info Card Component
interface StatusInfoCardProps {
  fileData: FileDetails;
}
function StatusInfoCard({ fileData }: StatusInfoCardProps) {
  return (
    <Card className="p-4 md:p-6 space-y-4">
      <h3 className="font-semibold text-foreground">Status & Sync</h3>
      <div className="space-y-3">
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-green-600" />
            <span className="text-sm text-muted-foreground">Shared Status</span>
          </div>
          <span className="text-sm font-medium text-foreground">
            {fileData.isShared ? "Shared" : "Not Shared"}
          </span>
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">Sync Status</span>
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
            <span className="text-sm text-muted-foreground">Last Synced</span>
          </div>
          <span className="text-sm font-medium text-foreground">
            {fileData.lastSynced || "Never"}
          </span>
        </div>
      </div>
    </Card>
  );
}

// Main Page Component
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
          const fileName =
            apiData.object_key.split("/").pop() || apiData.object_key;
          const fileSizeBytes = apiData.content_length || 0;
          const fileType = getFileType(fileName);

          const details: FileDetails = {
            name: fileName,
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
            sharedLinkId: apiData.shared_link_id || null,
          };

          setFileData(details);
        } else {
          const apiError = response as FileInfoErrorResponse;
          setError(apiError.error || "Failed to fetch file info");
        }
      } catch (err) {
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

  const handleSync = async () => {
    setIsSyncing(true);
    const toastId = toast.loading(`Syncing ${fileData!.name}...`);
    const res = await syncFile(fileData!.objectKey);
    if (res.success) {
      toast.success(`${fileData!.name} synced successfully`, {
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
    const toastId = toast.loading(`Downloading ${fileData!.name}...`);
    const res = await downloadFile(objectKey, fileData!.name);
    if (res.success) {
      toast.success(`Downloaded ${fileData!.name}`, {
        id: toastId,
        duration: 2000,
      });
    } else {
      toast.error(res.error, { id: toastId });
    }
  };

  const handleShare = () => {
    if (fileData!.isShared && fileData!.sharedLinkId) {
      router.push(`/share/${fileData!.sharedLinkId}/view`);
    } else {
      setShowShareDialog(true);
    }
  };

  const handleCreateShareLink = async () => {
    const payload: CreateSharedLinkPayload = {
      bucket: fileData!.bucket,
      object_key: objectKey,
      ...(expires && { expires_at: new Date(expires) }),
      ...(password && { password }),
    };

    const res = await createSharedLink(payload);
    if (res.success) {
      toast.success("Share link created successfully");
      router.push(`/share/${res.result.id}/view`);
      setExpires("");
      setPassword("");
      setShowShareDialog(false);
    } else {
      toast.error(res.error || "Failed to create share link");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    const sync = deleteType === "aws";
    const toastId = toast.loading(`Deleting ${fileData!.name}...`);
    const response = await deleteFile(objectKey, sync);
    if ("success" in response && response.success) {
      toast.success(
        `File deleted successfully${sync ? " (including from AWS)" : ""}`,
        { id: toastId }
      );
      setIsDeleting(false);
      setShowDeleteDialog(false);
      router.back();
    } else {
      const apiError = response as DeleteFileErrorResponse;
      toast.error(apiError.error || "Delete failed", { id: toastId });
      setIsDeleting(false);
    }
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <Header
        fileName={fileData.name}
        objectKey={fileData.objectKey}
        fileData={fileData}
        isSyncing={isSyncing}
        onBack={() => router.back()}
        onSync={handleSync}
        onDownload={handleDownload}
        onPreview={() => setShowPreview(true)}
        onShare={handleShare}
        onDelete={() => setShowDeleteDialog(true)}
      />
      <div className="flex-1 overflow-auto">
        <div className="p-4 md:p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
            <FileInfoCard fileData={fileData} />
            <StatusInfoCard fileData={fileData} />
          </div>
        </div>
      </div>
      <PreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        fileData={fileData}
        objectKey={objectKey}
      />
      <DeleteDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        fileData={fileData}
        deleteType={deleteType}
        isDeleting={isDeleting}
        onDeleteTypeChange={setDeleteType}
        onDelete={handleDelete}
      />
      <ShareDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        fileData={fileData}
        objectKey={objectKey}
        expires={expires}
        password={password}
        onExpiresChange={setExpires}
        onPasswordChange={setPassword}
        onCreateShareLink={handleCreateShareLink}
      />
    </div>
  );
}
