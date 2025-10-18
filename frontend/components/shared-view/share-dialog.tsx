"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import type { FileItem } from "./file-list";
import QRCode from "qrcode";

export function ShareDialog({
  item,
  open,
  onOpenChange,
}: {
  item: FileItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { toast } = useToast();
  const [enabled, setEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [expires, setExpires] = useState("");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    const id = item?.id ?? "preview";
    return `${
      typeof window !== "undefined"
        ? window.location.origin
        : "https://example.com"
    }/download/${id}`;
  }, [item]);

  useEffect(() => {
    if (enabled) {
      QRCode.toDataURL(shareUrl, { margin: 1, width: 180 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [enabled, shareUrl]);

  useEffect(() => {
    if (!open) {
      setEnabled(false);
      setPassword("");
      setExpires("");
      setQrDataUrl(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="share-desc">
        <DialogHeader>
          <DialogTitle>Share {item?.name}</DialogTitle>
          <DialogDescription id="share-desc">
            Create a public link and optional QR code to share this{" "}
            {item?.type === "folder" ? "folder" : "file"}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <div className="text-sm font-medium">Enable public link</div>
              <div className="text-xs text-muted-foreground">
                Anyone with the link can view
              </div>
            </div>
            <Switch
              checked={enabled}
              onCheckedChange={setEnabled}
              aria-label="Enable public link"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="share-url">Shareable link</Label>
            <div className="flex items-center gap-2">
              <Input
                id="share-url"
                value={enabled ? shareUrl : ""}
                readOnly
                placeholder="Disabled"
              />
              <Button
                variant="secondary"
                onClick={() => {
                  if (!enabled) return;
                  navigator.clipboard.writeText(shareUrl);
                  toast({
                    title: "Copied link",
                    description:
                      "The public link was copied to your clipboard.",
                  });
                }}
                disabled={!enabled}
              >
                Copy
              </Button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="password">Password (optional)</Label>
              <Input
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={!enabled}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expires">Expires (optional)</Label>
              <Input
                id="expires"
                placeholder="YYYY-MM-DD"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
                disabled={!enabled}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>QR code</Label>
            <div className="flex items-center justify-center rounded-md border p-4 min-h-[220px]">
              {enabled && qrDataUrl ? (
                <img
                  src={qrDataUrl || "/placeholder.svg"}
                  alt="QR code for shared link"
                  className="h-[180px] w-[180px]"
                  crossOrigin="anonymous"
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Enable the link to generate a QR code.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
