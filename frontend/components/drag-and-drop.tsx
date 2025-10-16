import React from "react";
import { cn } from "@/lib/utils";

interface DragAndDropAreaProps {
  prefix: string;
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export default function DragAndDropArea({
  prefix,
  isDragging,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
}: DragAndDropAreaProps) {
  return (
    <div
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={cn(
        "m-4 md:m-5 border-2 border-dashed rounded-lg p-4 md:p-5 text-center transition-all animate-in fade-in slide-in-from-top-2 duration-500 delay-100 cursor-pointer",
        isDragging
          ? "border-primary bg-primary/5 scale-105"
          : "border-border bg-muted/30 hover:border-primary/50"
      )}
    >
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">
          Drag and drop files here
        </p>
        <p className="text-xs text-muted-foreground">
          {prefix
            ? `Files will be uploaded to: ${prefix}`
            : "or click to browse"}
        </p>
      </div>
    </div>
  );
}
