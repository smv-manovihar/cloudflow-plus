import { FileDetails } from "@/types/files.types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { FilePreview } from "./file-preview";

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileData: FileDetails;
  objectKey: string;
}
export default function PreviewDialog({
  open,
  onOpenChange,
  fileData,
  objectKey,
}: PreviewDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col w-full sm:w-[min(92vw,64rem)] max-w-4xl h-auto max-h-[85vh] sm:max-h-[80vh] p-0 m-0 bg-background rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader className="p-2 sm:p-4 border-b flex-shrink-0">
          <DialogTitle className="text-sm sm:text-base leading-tight">
            Preview
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            {fileData.name}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-auto">
          <FilePreview
            objectKey={objectKey}
            fileName={fileData.name}
            fileType={fileData.type}
            className="h-full"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
