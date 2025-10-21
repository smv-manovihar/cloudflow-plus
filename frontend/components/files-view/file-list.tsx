import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { FileItem } from "@/types/files.types";
import {
  Folder,
  File,
  Download,
  Share2,
  Trash2,
  MoreVertical,
  Cloud,
  CloudCheck,
  ChevronLeft,
  CloudCog,
} from "lucide-react";

interface FileListProps {
  files: FileItem[];
  isLoading: boolean;
  viewMode: "grid" | "list";
  syncingFiles: Set<string>;
  navigateUp: () => void;
  showNavigateUp?: boolean;
  onFileClick: (fileName: string, fileKey: string) => void;
  onFolderClick: (folderName: string) => void;
  onDownload: (fileName: string, fileKey: string) => void;
  onShare: (fileName: string, fileKey: string) => void;
  onSyncFile: (fileName: string, fileKey: string) => void;
  onDelete: (fileName: string, fileKey: string) => void;
}

export default function FileList({
  files,
  isLoading,
  viewMode,
  syncingFiles,
  navigateUp,
  showNavigateUp = false,
  onFileClick,
  onFolderClick,
  onDownload,
  onShare,
  onSyncFile,
  onDelete,
}: FileListProps) {
  if (isLoading) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-center animate-in fade-in duration-500">
        <div className="space-y-2">
          <p className="text-sm font-medium text-foreground">
            No files available
          </p>
          <p className="text-xs text-muted-foreground">
            Upload files to get started
          </p>
        </div>
      </div>
    );
  }

  const navigateUpListElement = (
    <div
      className={cn(
        "flex items-center justify-between p-1 rounded-lg border border-border hover:bg-muted/50 transition-all group animate-in fade-in slide-in-from-left-2 duration-300 cursor-pointer"
      )}
      onClick={navigateUp}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          navigateUp();
        }
      }}
    >
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <ChevronLeft className="h-4 w-4 text-primary flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-primary">Parent Directory</p>
        </div>
      </div>
      <div className="md:hidden">{/* No dropdown for parent directory */}</div>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      {viewMode === "list" ? (
        <div className="space-y-2">
          {showNavigateUp && navigateUpListElement}
          {files.map((file, index) => (
            <div
              key={file.key}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-all group animate-in fade-in slide-in-from-left-2 duration-300",
                file.isFolder ? "cursor-pointer" : "cursor-default"
              )}
              style={{
                animationDelay: `${
                  showNavigateUp ? (index + 1) * 50 : index * 50
                }ms`,
              }}
              onClick={() =>
                file.isFolder
                  ? onFolderClick(file.name)
                  : onFileClick(file.name, file.key)
              }
              role={file.isFolder ? "button" : undefined}
              tabIndex={file.isFolder ? 0 : -1}
              onKeyDown={(e) => {
                if (file.isFolder && (e.key === "Enter" || e.key === " ")) {
                  onFolderClick(file.name);
                }
              }}
            >
              <div className="flex-1 min-w-0 flex items-center gap-3">
                {file.isFolder ? (
                  <Folder className="h-4 w-4 text-primary flex-shrink-0" />
                ) : (
                  <File className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground flex items-center gap-2">
                    <span className="truncate">{file.name}</span>
                  </p>
                  {file.isFolder ? (
                    <p className="text-xs text-muted-foreground">Folder</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      {`${file.size.value} ${file.size.unit}`} • {file.modified}
                    </p>
                  )}
                </div>
              </div>

              <div className="hidden md:flex gap-1 ml-2">
                {!file.isFolder && (
                  <>
                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDownload(file.name, file.key);
                          }}
                          className="h-8 w-8 hover:scale-110 transition-transform"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Download</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onShare(file.name, file.key);
                          }}
                          className="h-8 w-8 hover:scale-110 transition-transform"
                        >
                          <Share2 className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Share</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip delayDuration={300}>
                      <TooltipTrigger asChild>
                        <span tabIndex={0}>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSyncFile(file.name, file.key);
                            }}
                            disabled={
                              syncingFiles.has(file.name) ||
                              file.syncStatus !== "false"
                            }
                            className="h-8 w-8 hover:scale-110 transition-transform"
                          >
                            {file.syncStatus === "true" ? (
                              <CloudCheck
                                className={cn(
                                  "h-4 w-4",
                                  file.syncStatus === "true" &&
                                    "text-green-600 dark:text-green-400"
                                )}
                              />
                            ) : file.syncStatus === "pending" ? (
                              <CloudCog
                                className={cn(
                                  "h-4 w-4",
                                  "text-orange-600 dark:text-orange-400"
                                )}
                              />
                            ) : (
                              <Cloud
                                className={cn(
                                  "h-4 w-4",
                                  syncingFiles.has(file.name) &&
                                    "animate-spin text-primary"
                                )}
                              />
                            )}
                          </Button>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          {file.syncStatus === "true"
                            ? "Already synced"
                            : file.syncStatus === "pending"
                            ? "Pending"
                            : "Sync this file"}
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}

                <Tooltip delayDuration={300}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(file.name, file.key);
                      }}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:scale-110 transition-transform"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Delete</p>
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!file.isFolder && (
                      <>
                        <DropdownMenuItem
                          onClick={() => onDownload(file.name, file.key)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onShare(file.name, file.key)}
                        >
                          <Share2 className="h-4 w-4 mr-2" />
                          Share
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => onSyncFile(file.name, file.key)}
                          disabled={
                            syncingFiles.has(file.name) ||
                            file.syncStatus !== "false"
                          }
                        >
                          {!file.isFolder && file.syncStatus === "true" ? (
                            <CloudCheck className="h-4 w-4 mr-2 text-green-600 dark:text-green-400" />
                          ) : file.syncStatus === "pending" ? (
                            <CloudCog className="h-4 w-4 mr-2 text-orange-600 dark:text-orange-400" />
                          ) : (
                            <Cloud
                              className={cn(
                                "h-4 w-4 mr-2",
                                syncingFiles.has(file.name) &&
                                  "animate-spin text-primary"
                              )}
                            />
                          )}
                          {syncingFiles.has(file.name)
                            ? "Syncing..."
                            : file.syncStatus === "true"
                            ? "Synced"
                            : "Sync"}
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={() => onDelete(file.name, file.key)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col">
          {showNavigateUp && (
            <div className="mb-2">{navigateUpListElement}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {files.map((file, index) => (
              <Card
                key={file.key}
                className={cn(
                  "p-4 hover:shadow-md transition-all group animate-in fade-in zoom-in-95 duration-300 hover:scale-105",
                  file.isFolder ? "cursor-pointer" : "cursor-default"
                )}
                style={{
                  animationDelay: `${
                    showNavigateUp ? (index + 1) * 50 : index * 50
                  }ms`,
                }}
                onClick={() => file.isFolder && onFolderClick(file.name)}
                role={file.isFolder ? "button" : undefined}
                tabIndex={file.isFolder ? 0 : -1}
                onKeyDown={(e) => {
                  if (file.isFolder && (e.key === "Enter" || e.key === " ")) {
                    onFolderClick(file.name);
                  }
                }}
              >
                <div className="flex flex-col justify-between h-full">
                  <div>
                    <div className="h-24 bg-muted rounded-lg flex items-center justify-center group-hover:bg-primary/10 transition-colors mb-3">
                      {file.isFolder ? (
                        <Folder className="h-12 w-12 text-primary" />
                      ) : (
                        <File className="h-12 w-12 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file.isFolder
                          ? "Folder"
                          : `${file.size.value} ${file.size.unit}`}
                      </p>
                    </div>
                  </div>
                  {!file.isFolder && (
                    <div className="flex gap-1 transition-opacity mt-3 -mx-2">
                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownload(file.name, file.key);
                            }}
                            className="h-8 w-8 hover:scale-110 transition-transform"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Download</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onShare(file.name, file.key);
                            }}
                            className="h-8 w-8 hover:scale-110 transition-transform"
                          >
                            <Share2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Share</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <span tabIndex={0}>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => {
                                e.stopPropagation();
                                onSyncFile(file.name, file.key);
                              }}
                              disabled={
                                syncingFiles.has(file.name) ||
                                file.syncStatus === "true"
                              }
                              className="h-8 w-8 hover:scale-110 transition-transform"
                            >
                              {!file.isFolder && file.syncStatus === "true" ? (
                                <CloudCheck className="h-4 w-4 text-green-600 dark:text-green-400" />
                              ) : (
                                <Cloud
                                  className={cn(
                                    "h-4 w-4",
                                    syncingFiles.has(file.name) &&
                                      "animate-spin text-primary",
                                    file.syncStatus === "true" &&
                                      "text-green-600 dark:text-green-400"
                                  )}
                                />
                              )}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            {file.syncStatus === "true"
                              ? "Already synced"
                              : "Sync this file"}
                          </p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip delayDuration={300}>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(file.name, file.key);
                            }}
                            className="h-8 w-8 text-destructive hover:text-destructive hover:scale-110 transition-transform"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delete</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
