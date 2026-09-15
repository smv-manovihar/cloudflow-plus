import { Loader2, HardDrive, Cloud, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FileDetails } from "@/types/files.types";
import { cn } from "@/lib/utils";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileData: FileDetails | null;
  deleteType?: "local" | "aws" | "both";
  onDeleteTypeChange?: (type: "local" | "aws" | "both") => void;
  hasSyncTarget?: boolean;
  isDeleting: boolean;
  onDelete: () => void;
}

export default function DeleteDialog({
  open,
  onOpenChange,
  fileData,
  deleteType = "both",
  onDeleteTypeChange,
  hasSyncTarget = false,
  isDeleting,
  onDelete,
}: DeleteDialogProps) {
  const isSynced = fileData?.syncStatus === "true";
  const showSyncOptions = Boolean(hasSyncTarget && isSynced);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            <span>
              Delete{" "}
              <span className="truncate inline-block max-w-[200px] align-bottom font-semibold text-foreground">
                {fileData?.name}
              </span>
              ?
            </span>
          </DialogTitle>
          {!showSyncOptions && (
            <DialogDescription>
              This file will be permanently deleted from cloud storage. This action cannot be undone.
            </DialogDescription>
          )}
        </DialogHeader>

        {showSyncOptions && (
          <div className="space-y-3 py-1">
            <p className="text-xs text-muted-foreground">
              This file is backed up to secondary cloud storage. Select where you want to remove it from:
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={deleteType === "local" ? "default" : "outline"}
                size="sm"
                onClick={() => onDeleteTypeChange?.("local")}
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2.5 px-2 text-xs transition-all",
                  deleteType === "local" && "ring-2 ring-primary ring-offset-1"
                )}
              >
                <HardDrive className="h-4 w-4" />
                <span>Local Only</span>
              </Button>
              <Button
                type="button"
                variant={deleteType === "aws" ? "default" : "outline"}
                size="sm"
                onClick={() => onDeleteTypeChange?.("aws")}
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2.5 px-2 text-xs transition-all",
                  deleteType === "aws" && "ring-2 ring-primary ring-offset-1"
                )}
              >
                <Cloud className="h-4 w-4" />
                <span>Sync Storage Only</span>
              </Button>
              <Button
                type="button"
                variant={deleteType === "both" ? "default" : "outline"}
                size="sm"
                onClick={() => onDeleteTypeChange?.("both")}
                className={cn(
                  "flex flex-col items-center gap-1 h-auto py-2.5 px-2 text-xs transition-all",
                  deleteType === "both" && "ring-2 ring-destructive ring-offset-1"
                )}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
                <span>Both</span>
              </Button>
            </div>
            <div className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground border border-border/50">
              {deleteType === "local" && (
                <p>Removes the file from primary storage only. The secondary sync backup copy will remain intact.</p>
              )}
              {deleteType === "aws" && (
                <p>Removes the backup from secondary sync storage only. Your primary file in CloudFlow will remain intact.</p>
              )}
              {deleteType === "both" && (
                <p className="text-destructive font-medium">Permanently deletes the file from both primary storage and secondary sync backup.</p>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onDelete}
            disabled={isDeleting}
            className="gap-2"
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : showSyncOptions ? (
              deleteType === "local"
                ? "Delete Local"
                : deleteType === "aws"
                ? "Remove from Sync Storage"
                : "Delete Everywhere"
            ) : (
              "Delete File"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
