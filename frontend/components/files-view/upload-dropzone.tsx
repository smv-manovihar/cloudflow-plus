"use client";

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/api/files.api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  UploadFilesErrorResponse,
  UploadFilesResponse,
} from "@/types/files.types";

export function UploadDropzone({
  className,
  onFilesUploaded,
  prefix,
  folderToCreate,
  onFolderCreated,
  onCreateCancelled,
}: {
  onFilesUploaded?: (
    response: UploadFilesResponse | UploadFilesErrorResponse
  ) => void;
  className?: string;
  prefix?: string;
  folderToCreate?: string;
  onFolderCreated?: (name: string) => void;
  onCreateCancelled?: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false); // Track upload state
  const inputRef = useRef<HTMLInputElement | null>(null);

  const effectivePrefix = folderToCreate
    ? `${prefix || ""}${folderToCreate}/`
    : prefix;

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleConfirmUpload = useCallback(
    async (filesToUpload: File[]) => {
      if (isUploading) return;
      setIsUploading(true);

      let processedFiles = filesToUpload;
      if (effectivePrefix?.endsWith("/")) {
        processedFiles = filesToUpload.map((file) => {
          const newName = `${effectivePrefix}${file.name}`;
          return new File([file], newName, { type: file.type });
        });
      }

      const totalFiles = processedFiles.length;
      const uploadToast = toast.loading(
        `Preparing to upload ${totalFiles} file(s)...`
      );

      try {
        const response = await uploadFiles(processedFiles, (progress) => {
          const roundedProgress = Math.round(progress);
          if (roundedProgress < 100) {
            toast.loading(
              `Uploading ${totalFiles} file(s)... ${roundedProgress}%`,
              { id: uploadToast }
            );
          } else {
            toast.loading(`Upload complete, processing on server...`, {
              id: uploadToast,
            });
          }
        });

        if (response.success) {
          toast.success(`Successfully uploaded ${totalFiles} file(s)`, {
            id: uploadToast,
          });
          if (folderToCreate && onFolderCreated) {
            onFolderCreated(folderToCreate);
          }
        } else {
          toast.error(
            response.error || `Failed to upload ${totalFiles} file(s)`,
            { id: uploadToast, duration: 5000 }
          );
          if (folderToCreate && onCreateCancelled) {
            onCreateCancelled();
          }
        }

        onFilesUploaded?.(response);
      } catch (error) {
        toast.error(
          `Upload failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { id: uploadToast, duration: 5000 }
        );
        // console.error("Upload error:", error);
        if (folderToCreate && onCreateCancelled) {
          onCreateCancelled();
        }
      } finally {
        setIsUploading(false);
      }
    },
    [
      isUploading,
      onFilesUploaded,
      effectivePrefix,
      folderToCreate,
      onFolderCreated,
      onCreateCancelled,
    ]
  );

  const handleUpload = useCallback(
    async (files: File[]) => {
      if (folderToCreate && files.length === 0) {
        toast.error("At least one file is required to create the folder.", {
          duration: 3000,
        });
        return;
      }
      setSelectedFiles(files);
      setIsOpen(true);
    },
    [folderToCreate]
  );

  const removeFile = useCallback((fileToRemove: File) => {
    setSelectedFiles((prev) => prev.filter((file) => file !== fileToRemove));
  }, []);

  const confirmUpload = useCallback(() => {
    if (selectedFiles.length > 0) {
      handleConfirmUpload(selectedFiles);
    }
    setIsOpen(false);
    setSelectedFiles([]);
  }, [selectedFiles, handleConfirmUpload]);

  const cancelUpload = useCallback(() => {
    setIsOpen(false);
    setSelectedFiles([]);
    if (folderToCreate && onCreateCancelled) {
      onCreateCancelled();
    }
  }, [folderToCreate, onCreateCancelled]);

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag(false);
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length) handleUpload(files);
    },
    [handleUpload]
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (files.length) handleUpload(files);
      e.target.value = "";
    },
    [handleUpload]
  );

  const getDropzoneSubtitle = useCallback(() => {
    if (folderToCreate) {
      return `Create "${folderToCreate}"`;
    }
    return prefix ? `Upload to: ${prefix.slice(0, -1)}` : "Upload to bucket";
  }, [folderToCreate, prefix]);

  const getDialogDescription = useCallback(() => {
    let desc = `${selectedFiles.length} file(s) selected`;
    if (folderToCreate) {
      desc += `. Creates folder "${folderToCreate}"`;
    }
    return desc;
  }, [selectedFiles.length, folderToCreate]);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={openPicker}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDrag(false);
        }}
        onDrop={onDrop}
        aria-label={
          folderToCreate
            ? `Create "${folderToCreate}" by uploading files (drag/drop or click)`
            : "Upload files (drag/drop or click)"
        }
        className={cn(
          "rounded-md border border-dashed p-3 sm:p-6 text-center transition-colors focus:outline-none hover:border-primary/50 select-none",
          drag ? "bg-muted" : "bg-transparent",
          className
        )}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={onChange}
          aria-hidden="true"
          tabIndex={-1}
        />
        <div className="mx-auto grid max-w-xs sm:max-w-md place-items-center gap-1 sm:gap-2">
          <UploadCloud
            className="size-4 sm:size-6 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm">
            <span className="font-medium">Drop files here</span> or click to
            browse
          </p>
          <p className="text-xs text-muted-foreground">
            {getDropzoneSubtitle()}
          </p>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Upload</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-60 overflow-y-auto">
            <ul className="space-y-2">
              {selectedFiles.map((file, index) => (
                <li
                  key={index}
                  className="flex items-center justify-between rounded-md border p-2"
                >
                  <span className="text-sm truncate flex-1 max-w-[200px]">
                    {file.name}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(file)}
                    className="ml-2 h-6 w-6 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </li>
              ))}
            </ul>
            {selectedFiles.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No files selected.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={cancelUpload}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmUpload}
              disabled={selectedFiles.length === 0 || isUploading}
            >
              Upload {selectedFiles.length > 0 && `(${selectedFiles.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
