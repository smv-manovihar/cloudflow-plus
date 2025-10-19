"use client";

import { useState, useEffect, useRef } from "react";
import { File, FileText, ImageIcon, Video, FileJson } from "lucide-react";
import { api } from "@/config/api.config";
import { AxiosError } from "axios";

interface FilePreviewProps {
  objectKey: string;
  fileName: string;
  fileType: string;
  className?: string;
}

const previewCache = new Map<
  string,
  { src: string | null; content: string | null; timestamp: number }
>();
const CACHE_DURATION = 30 * 60 * 1000;

// MIME type mapping based on extension for reliable blob creation
const mimeTypeMap: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  avi: "video/x-msvideo",
  mkv: "video/x-matroska",
  txt: "text/plain",
  md: "text/markdown",
  json: "application/json",
  xml: "application/xml",
  csv: "text/csv",
  log: "text/plain",
};

const cleanupCache = () => {
  const now = Date.now();
  for (const [key] of previewCache.entries()) {
    const item = previewCache.get(key);
    if (item && now - item.timestamp > CACHE_DURATION) {
      if (item.src && item.src.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(item.src);
        } catch {}
      }
      previewCache.delete(key);
    }
  }
};

export function FilePreview({
  objectKey,
  fileName,
  fileType,
  className = "",
}: FilePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  const getFileExtension = (name: string) => {
    return name.split(".").pop()?.toLowerCase() || "";
  };

  const extension = getFileExtension(fileName);

  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(
    extension
  );
  const isVideo = ["mp4", "webm", "mov", "avi", "mkv"].includes(extension);
  const isPdf = extension === "pdf";
  const isText = ["txt", "md", "json", "xml", "csv", "log"].includes(extension);

  // Get precise MIME type from extension
  const getMimeType = (ext: string, fallbackType: string) => {
    return mimeTypeMap[ext] || fallbackType || "application/octet-stream";
  };

  const getPreviewIcon = () => {
    if (isImage)
      return <ImageIcon className="h-8 w-8 sm:h-10 sm:w-10 text-blue-500" />;
    if (isVideo)
      return <Video className="h-8 w-8 sm:h-10 sm:w-10 text-purple-500" />;
    if (isPdf)
      return <FileJson className="h-8 w-8 sm:h-10 sm:w-10 text-red-500" />;
    if (isText)
      return <FileText className="h-8 w-8 sm:h-10 sm:w-10 text-green-500" />;
    return <File className="h-8 w-8 sm:h-10 sm:w-10 text-gray-500" />;
  };

  // Function to open blob in new tab (for preview)
  const openInNewTab = (blobUrl: string) => {
    const newWindow = window.open(blobUrl, "_blank");
    if (newWindow) {
      // Revoke URL after a short delay to clean up memory (new tab has its own reference)
      setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
      }, 1000);
    } else {
      // Fallback if popup blocked: use a temporary anchor click
      const a = document.createElement("a");
      a.href = blobUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  };

  // Function for download with correct filename
  const downloadFile = (blobUrl: string) => {
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = fileName; // Ensures correct filename
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
  };

  useEffect(() => {
    const interval = setInterval(cleanupCache, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const cacheKey = `${objectKey}-${extension}`;
    const loadFromCacheOrFetch = async () => {
      setIsLoading(true);
      setError(null);
      setPreviewSrc(null);
      setPreviewContent(null);

      if (urlRef.current && urlRef.current.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(urlRef.current);
        } catch {}
        urlRef.current = null;
      }

      const cached = previewCache.get(cacheKey);
      const now = Date.now();

      if (cached && now - cached.timestamp < CACHE_DURATION) {
        if (isText && cached.content) {
          setPreviewContent(cached.content);
        } else if (cached.src) {
          setPreviewSrc(cached.src);
        }
        setIsLoading(false);
        return;
      }

      try {
        if (isVideo) {
          // Use direct URL for video streaming
          const videoUrl = `${api.defaults.baseURL}/files/${objectKey}`;
          await api.head(`/files/${objectKey}`);
          setPreviewSrc(videoUrl);
          previewCache.set(cacheKey, {
            src: videoUrl,
            content: null,
            timestamp: now,
          });
        } else if (isText) {
          const response = await api.get(`/files/${objectKey}`, {
            responseType: "text",
          });
          const content = response.data.substring(0, 5000);
          setPreviewContent(content);
          previewCache.set(cacheKey, { src: null, content, timestamp: now });
        } else {
          const response = await api.get(`/files/${objectKey}`, {
            responseType: "blob",
          });
          // Use extension-based MIME for reliability
          const mimeType = getMimeType(
            extension,
            response.headers["content-type"] || fileType
          );
          const blob = new Blob([response.data], { type: mimeType });
          const url = URL.createObjectURL(blob);
          urlRef.current = url;
          setPreviewSrc(url);
          previewCache.set(cacheKey, {
            src: url,
            content: null,
            timestamp: now,
          });
        }
      } catch (err) {
        if (err instanceof AxiosError) {
          setError(
            err.response?.status === 401
              ? "Unauthorized access to file"
              : err.response?.status === 404
              ? "File not found"
              : "Failed to load file preview"
          );
        } else {
          setError("Failed to load file preview");
        }
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };

    if (objectKey) {
      loadFromCacheOrFetch();
    }
  }, [
    objectKey,
    extension,
    isImage,
    isVideo,
    isPdf,
    isText,
    fileType,
    fileName,
  ]); // Added fileName dep for download

  useEffect(() => {
    const cacheKey = `${objectKey}-${extension}`;
    return () => {
      if (
        urlRef.current &&
        urlRef.current.startsWith("blob:") &&
        !previewCache.has(cacheKey)
      ) {
        try {
          URL.revokeObjectURL(urlRef.current);
        } catch {}
        urlRef.current = null;
      }
    };
  }, [objectKey, extension]);

  if (isLoading) {
    return (
      <div className={`flex flex-col flex-1 overflow-hidden ${className}`}>
        <div className="bg-muted rounded-lg p-3 sm:p-4 flex items-center justify-center flex-1 max-h-[60vh] sm:max-h-[50vh]">
          <div className="animate-pulse bg-gray-300 rounded-lg h-32 sm:h-48 w-full max-w-xs sm:max-w-md" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex flex-col flex-1 overflow-hidden ${className}`}>
        <div className="flex flex-col items-center justify-center flex-1 max-h-[60vh] sm:max-h-[50vh] text-muted-foreground">
          <File className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3" />
          <p className="text-center text-xs sm:text-sm px-4">{error}</p>
        </div>
        <div className="flex justify-center mt-2 sm:mt-4 border-t pt-2 sm:pt-4">
          <p className="text-xs sm:text-sm font-medium text-foreground text-center">
            {fileName}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col flex-1 overflow-hidden ${className}`}>
      <div className="bg-muted rounded-lg p-3 sm:p-4 flex items-center justify-center flex-1 max-h-[60vh] sm:max-h-[50vh] overflow-auto">
        {isImage ? (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={previewSrc || undefined}
              alt={fileName}
              className="max-w-full max-h-[50vh] sm:max-h-[45vh] rounded-lg object-contain animate-in fade-in duration-500"
            />
          </div>
        ) : isVideo ? (
          <div className="w-full flex items-center justify-center">
            <video
              controls
              preload="metadata"
              className="max-w-full max-h-[50vh] sm:max-h-[45vh] rounded-lg bg-black animate-in fade-in duration-500"
              src={previewSrc || undefined}
            >
              Your browser does not support the video tag.
            </video>
          </div>
        ) : isPdf ? (
          <div className="flex flex-col items-center justify-center flex-1 max-h-[60vh] sm:max-h-[50vh] text-muted-foreground animate-in fade-in duration-500">
            <FileJson className="h-8 w-8 sm:h-10 sm:w-10 mb-2 sm:mb-3 text-red-500" />
            <p className="text-center text-xs sm:text-sm px-4 mb-2 sm:mb-3">
              PDF preview is not available in the dialog.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 justify-center">
              {previewSrc && (
                <button
                  onClick={() => openInNewTab(previewSrc)}
                  className="inline-flex items-center justify-center px-3 py-1 text-xs sm:text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 transition-colors"
                >
                  Open in New Tab
                </button>
              )}
              {previewSrc && (
                <button
                  onClick={() => downloadFile(previewSrc)}
                  className="inline-flex items-center justify-center px-3 py-1 text-xs sm:text-sm font-medium text-primary-foreground bg-secondary rounded-md hover:bg-secondary/90 transition-colors"
                >
                  Download
                </button>
              )}
            </div>
          </div>
        ) : isText && previewContent ? (
          <div className="w-full bg-card rounded-lg p-2 sm:p-3 border border-border overflow-hidden animate-in fade-in duration-500">
            <div className="max-h-[50vh] sm:max-h-[45vh] overflow-auto pr-2">
              <pre className="text-xs sm:text-sm font-mono text-foreground whitespace-pre-wrap break-words">
                {previewContent}
                {previewContent &&
                  previewContent.length >= 5000 &&
                  `\n\n... (truncated for preview)`}
              </pre>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 sm:gap-3">
            {getPreviewIcon()}
            <p className="text-xs sm:text-sm text-center text-muted-foreground px-4">
              Preview not available for this file type
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
