import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Calendar, Link2, Lock } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { FileDetails } from "@/types/files.types";

interface ShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fileData: FileDetails;
  objectKey: string;
  expires: string;
  password: string;
  onExpiresChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onCreateShareLink: () => void;
}

export default function ShareDialog({
  open,
  onOpenChange,
  fileData,
  objectKey,
  expires,
  password,
  onExpiresChange,
  onPasswordChange,
  onCreateShareLink,
}: ShareDialogProps) {
  const isValidExpiry = expires
    ? new Date(expires) > new Date() && !isNaN(new Date(expires).getTime())
    : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm sm:max-w-md animate-in fade-in zoom-in-95 duration-300">
        <DialogHeader>
          <DialogTitle>Create Share Link</DialogTitle>
          <DialogDescription>
            Create a shareable link for this file. The file must be synced to
            AWS before sharing. Expiry time is in your local timezone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="expires" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Expires At (optional)
              </Label>
              <Input
                id="expires"
                type="datetime-local"
                value={expires}
                onChange={(e) => onExpiresChange(e.target.value)}
                className="w-full"
                min={new Date().toISOString().slice(0, 16)} // Restrict to future dates
                disabled={!fileData.isSynced}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Password (optional)
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                className="w-full"
                disabled={!fileData.isSynced}
              />
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={fileData.isSynced ? onCreateShareLink : () => {}}
              className="gap-2 bg-primary hover:bg-primary/90"
              disabled={
                !fileData.isSynced ||
                !fileData.bucket ||
                !objectKey ||
                !isValidExpiry
              }
            >
              <Link2 className="h-4 w-4" />
              Create Share Link
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
