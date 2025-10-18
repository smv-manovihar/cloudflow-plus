"use client";

import { useState } from "react";
import { File, FileText, ImageIcon, Video, FileJson } from "lucide-react";
import { Card } from "@/components/ui/card";

interface FilePreviewProps {
  objectKey: string;
  fileName: string;
  fileType: string;
  fileSize: { value: string; unit: string };
}

export function FilePreview({
  objectKey,
  fileName,
  fileType,
  fileSize,
}: FilePreviewProps) {
  const [isLoading, setIsLoading] = useState(true);

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

  const getPreviewIcon = () => {
    if (isImage) return <ImageIcon className="h-12 w-12 text-blue-500" />;
    if (isVideo) return <Video className="h-12 w-12 text-purple-500" />;
    if (isPdf) return <FileJson className="h-12 w-12 text-red-500" />;
    if (isText) return <FileText className="h-12 w-12 text-green-500" />;
    return <File className="h-12 w-12 text-gray-500" />;
  };

  return (
    <Card className="p-6 md:p-8 animate-in fade-in slide-in-from-top-2 duration-500">
      <div className="space-y-6">
        {/* Preview Container */}
        <div className="bg-muted rounded-lg p-8 md:p-12 flex items-center justify-center min-h-64 md:min-h-96">
          {isImage ? (
            <div className="w-full h-full flex items-center justify-center">
              <img
                src={`/placeholder.svg?height=400&width=600&query=image preview for ${fileName}`}
                alt={fileName}
                className="max-w-full max-h-96 rounded-lg object-contain animate-in fade-in duration-500"
                onLoad={() => setIsLoading(false)}
              />
            </div>
          ) : isVideo ? (
            <div className="w-full flex items-center justify-center">
              <video
                controls
                className="max-w-full max-h-96 rounded-lg bg-black animate-in fade-in duration-500"
                onLoadedMetadata={() => setIsLoading(false)}
              >
                <source
                  src={`/placeholder.svg?height=400&width=600&query=video preview`}
                  type="video/mp4"
                />
                Your browser does not support the video tag.
              </video>
            </div>
          ) : isPdf ? (
            <div className="w-full h-full flex items-center justify-center">
              <iframe
                src={`/placeholder.svg?height=400&width=600&query=pdf preview`}
                className="w-full h-96 rounded-lg border border-border animate-in fade-in duration-500"
                onLoad={() => setIsLoading(false)}
              />
            </div>
          ) : isText ? (
            <div className="w-full bg-card rounded-lg p-4 md:p-6 border border-border max-h-96 overflow-auto animate-in fade-in duration-500">
              <pre className="text-xs md:text-sm font-mono text-foreground whitespace-pre-wrap break-words">
                {`Sample text content from ${fileName}\n\nThis is a preview of the text file content.\nYou can view the full content by downloading the file.`}
              </pre>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              {getPreviewIcon()}
              <p className="text-sm text-muted-foreground">
                Preview not available for this file type
              </p>
            </div>
          )}
        </div>

        {/* File Info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">File Type</p>
            <p className="text-sm font-medium text-foreground">
              {extension.toUpperCase()}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">File Size</p>
            <p className="text-sm font-medium text-foreground">{fileSize} MB</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Format</p>
            <p className="text-sm font-medium text-foreground">{fileType}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-sm font-medium text-green-600">Ready</p>
          </div>
        </div>
      </div>
    </Card>
  );
}
