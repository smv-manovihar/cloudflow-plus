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

interface UploadDropzoneProps {
  className?: string;
  prefix?: string;
  onFilesUploaded?: (
    response: UploadFilesResponse | UploadFilesErrorResponse
  ) => void;
}

export function UploadDropzone({
  className,
  prefix,
  onFilesUploaded,
}: UploadDropzoneProps) {
  const [drag, setDrag] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleConfirmUpload = useCallback(
    async (filesToUpload: File[]) => {
      if (isUploading) return;
      setIsUploading(true);

      const totalFiles = filesToUpload.length;
      const uploadToast = toast.loading(
        `Preparing to upload ${totalFiles} file(s)...`
      );

      try {
        const response = await uploadFiles(filesToUpload, prefix, (progress) => {
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
        } else {
          toast.error(
            response.error || `Failed to upload ${totalFiles} file(s)`,
            { id: uploadToast, duration: 5000 }
          );
        }

        onFilesUploaded?.(response);
      } catch (error) {
        toast.error(
          `Upload failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          { id: uploadToast, duration: 5000 }
        );
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, onFilesUploaded, prefix]
  );

  const handleUpload = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      setSelectedFiles(files);
      setIsOpen(true);
    },
    []
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
  }, []);

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

  const dropzoneSubtitle = prefix
    ? `Uploading to folder /${prefix}`
    : "Uploading to root directory";

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
        aria-label="Upload files (drag/drop or click)"
        className={cn(
          "rounded-md border border-dashed p-3 sm:p-6 text-center transition-colors focus:outline-none hover:border-primary/50 select-none cursor-pointer",
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
            {dropzoneSubtitle}
          </p>
        </div>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Confirm Upload</DialogTitle>
            <DialogDescription>
              {selectedFiles.length} file(s) selected for upload to{" "}
              {prefix ? `/${prefix}` : "root"}
            </DialogDescription>
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
