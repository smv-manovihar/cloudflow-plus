import { FileDetails } from "@/types/files.types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";

interface DeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileData: FileDetails;
  deleteType: "local" | "aws";
  isDeleting: boolean;
  onDeleteTypeChange: (type: "local" | "aws") => void;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader>
          <DialogTitle>Delete File</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {fileData.name}
            </span>
            ? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mb-4">
          <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-2">
            <Button
              type="button"
              variant={deleteType === "local" ? "default" : "outline"}
              size="sm"
              onClick={() => onDeleteTypeChange("local")}
              className="flex-1"
            >
              Delete Local Only
            </Button>
            <Button
              type="button"
              variant={deleteType === "aws" ? "default" : "outline"}
              size="sm"
              onClick={() => onDeleteTypeChange("aws")}
              className="flex-1"
              disabled={!fileData.isSynced}
            >
              Delete from AWS Too
              {fileData.isSynced ? "" : " (Not Synced)"}
            </Button>
          </div>
          <p
            className={cn(
              "text-xs text-muted-foreground",
              deleteType === "aws" && "text-destructive"
            )}
          >
            {deleteType === "local"
              ? "This will only remove the file from the local bucket."
              : "This will remove the file from both local and AWS buckets."}
          </p>
        </div>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
              : `Delete ${deleteType === "aws" ? "(AWS Too)" : ""}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
