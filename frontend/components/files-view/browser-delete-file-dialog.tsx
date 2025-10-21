import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FileItem } from "@/types/files.types";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileData: FileItem | null;
  deleteType: "local" | "aws" | "both";
  isDeleting: boolean;
  onDeleteTypeChange: (type: "local" | "aws" | "both") => void;
  onDelete: () => void;
}

export default function DeleteDialog({
  open,
  onOpenChange,
  fileData,
  deleteType,
  isDeleting,
  onDeleteTypeChange,
  onDelete,
}: DeleteDialogProps) {
  const isSynced = fileData?.syncStatus === "true";
  const canDeleteAws = isSynced;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader>
          <DialogTitle>
            Delete{" "}
            <span className="truncate inline-block max-w-[180px]">
              {fileData?.name}
            </span>
            ?
          </DialogTitle>
          <DialogDescription>This action cannot be undone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mb-4">
          <div className="flex flex-col space-y-2">
            <Button
              type="button"
              variant={deleteType === "local" ? "default" : "outline"}
              size="sm"
              onClick={() => onDeleteTypeChange("local")}
              className="w-full"
            >
              Local Only
            </Button>
            <Button
              type="button"
              variant={deleteType === "aws" ? "default" : "outline"}
              size="sm"
              onClick={() => onDeleteTypeChange("aws")}
              className="w-full"
              disabled={!canDeleteAws}
            >
              AWS Only{!isSynced && " (Not Synced)"}
            </Button>
            <Button
              type="button"
              variant={deleteType === "both" ? "default" : "outline"}
              size="sm"
              onClick={() => onDeleteTypeChange("both")}
              className="w-full"
              disabled={!canDeleteAws}
            >
              Both{!isSynced && " (Not Synced)"}
            </Button>
          </div>
          <p
            className={cn(
              "text-xs text-muted-foreground",
              (deleteType === "aws" || deleteType === "both") &&
                "text-destructive"
            )}
          >
            {deleteType === "local"
              ? "Removes from local."
              : deleteType === "aws"
              ? "Removes from AWS."
              : "Removes from both AWS and local."}
          </p>
        </div>
        <div className="flex gap-3 justify-end">
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
            {isDeleting
              ? "Deleting..."
              : deleteType === "local"
              ? "Delete"
              : deleteType === "aws"
              ? "Delete (AWS)"
              : "Delete (Both)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
