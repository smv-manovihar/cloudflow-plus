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
      <DialogContent className="flex flex-col w-[calc(100%-2rem)] sm:w-[90vw] sm:max-w-5xl h-[82vh] min-h-[480px] max-h-[90vh] gap-0 p-0 m-0 bg-background rounded-lg overflow-hidden animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader className="p-2 sm:p-4 border-b flex-shrink-0">
          <DialogTitle className="text-sm sm:text-base leading-tight">
            Preview
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-muted-foreground leading-relaxed truncate inline-block max-w-[300px]">
            {fileData.name}
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-auto p-3 sm:p-4">
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
