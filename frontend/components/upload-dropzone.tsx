"use client";

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { uploadFiles } from "@/api/files.api";

export function UploadDropzone({
  className,
  onFilesUploaded,
  prefix,
}: {
  onFilesUploaded?: (
    response: UploadFilesResponse | UploadFilesErrorResponse
  ) => void;
  className?: string;
  prefix?: string;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const openPicker = useCallback(() => inputRef.current?.click(), []);

  const handleUpload = useCallback(
    async (files: File[]) => {
      // Process files with prefix if it ends with "/"
      let processedFiles = files;
      if (prefix?.endsWith("/")) {
        processedFiles = files.map((file) => {
          const newName = `${prefix}${file.name}`;
          return new File([file], newName, { type: file.type });
        });
      }

      const totalFiles = processedFiles.length;
      const uploadToast = toast.loading(
        `Starting upload... ${totalFiles} file(s) selected`
      );

      try {
        const response = await uploadFiles(processedFiles, (progress) => {
          toast.loading(`${totalFiles} file(s)... ${Math.round(progress)}%`, {
            id: uploadToast,
          });
        });

        if (response.success) {
          toast.success(response.message || "Files uploaded successfully", {
            id: uploadToast,
          });
        } else {
          toast.error(response.error || "Some files failed to upload", {
            id: uploadToast,
          });
        }

        onFilesUploaded?.(response);
      } catch (error) {
        toast.error("An error occurred during upload", {
          id: uploadToast,
        });
        console.error("Upload error:", error);
      }
    },
    [onFilesUploaded, prefix]
  );

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
      // Reset input value to allow re-selecting the same file
      e.target.value = "";
    },
    [handleUpload]
  );

  return (
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
      aria-label="Upload files by dragging and dropping or clicking to choose files"
      className={cn(
        "rounded-md border border-dashed p-6 text-center transition-colors focus:outline-none hover:border-primary/50 select-none",
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
      <div className="mx-auto grid max-w-md place-items-center gap-2">
        <UploadCloud
          className="size-6 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-sm">
          <span className="font-medium">Drag & drop files</span> or click to
          browse
        </p>
        <p className="text-xs text-muted-foreground">
          {prefix ? `Uploading to: ${prefix.slice(0, -1)}` : "Upload to bucket"}
        </p>
      </div>
    </div>
  );
}

// Types for the upload response (unchanged)
interface UploadResult {
  // Define structure based on your API response
  [key: string]: any;
}

interface UploadErrorResult {
  // Define structure based on your API response
  [key: string]: any;
}

interface UploadFilesResponse {
  success: true;
  message?: string;
  bucket?: string;
  uploads?: UploadResult[];
}

interface UploadFilesErrorResponse {
  success: false;
  error: string;
  successful_uploads?: UploadResult[];
  failed_uploads?: UploadErrorResult[];
}
