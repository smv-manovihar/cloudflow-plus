"use client";

import type React from "react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactNode;
  onCreateBucket?: (bucketName: string) => Promise<boolean>;
};

// S3 bucket name validation rules
function validateBucketName(name: string): string | null {
  if (!name) return "Bucket name is required";
  if (name.length < 3 || name.length > 63) {
    return "Bucket name must be between 3 and 63 characters";
  }
  if (!/^[a-z0-9]/.test(name)) {
    return "Bucket name must start with a lowercase letter or number";
  }
  if (!/[a-z0-9]$/.test(name)) {
    return "Bucket name must end with a lowercase letter or number";
  }
  if (!/^[a-z0-9.-]+$/.test(name)) {
    return "Bucket name can only contain lowercase letters, numbers, hyphens, and periods";
  }
  if (/\.\./.test(name)) {
    return "Bucket name cannot contain two adjacent periods";
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(name)) {
    return "Bucket name cannot be formatted as an IP address";
  }
  if (
    name.startsWith("xn--") ||
    name.startsWith("sthree-") ||
    name.startsWith("amzn-s3-demo-")
  ) {
    return "Bucket name uses a reserved prefix";
  }
  if (
    name.endsWith("-s3alias") ||
    name.endsWith("--ol-s3") ||
    name.endsWith(".mrap") ||
    name.endsWith("--x-s3") ||
    name.endsWith("--table-s3")
  ) {
    return "Bucket name uses a reserved suffix";
  }
  return null;
}

export function CreateBucketDialog({
  open,
  onOpenChange,
  trigger,
  onCreateBucket,
}: Props) {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    // Clear error when user starts typing
    if (error) setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim().toLowerCase();

    // Validate bucket name
    const validationError = validateBucketName(trimmedName);
    if (validationError) {
      setError(validationError);
      toast.error(validationError);
      return;
    }

    if (!onCreateBucket) {
      toast.error("Create bucket handler not provided");
      return;
    }

    setIsLoading(true);
    try {
      const success = await onCreateBucket(trimmedName);
      if (success) {
        setName("");
        setError(null);
        onOpenChange?.(false);
      }
    } catch (err) {
      console.error("Error creating bucket:", err);
      setError("Failed to create bucket");
    } finally {
      setIsLoading(false);
    }
  }

  function handleCancel() {
    setName("");
    setError(null);
    onOpenChange?.(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create bucket</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="bucket-name">Bucket name</Label>
            <Input
              id="bucket-name"
              placeholder="e.g. my-app-assets"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              autoFocus
              disabled={isLoading}
              className={error ? "border-destructive" : ""}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Must be 3-63 characters, lowercase letters, numbers, hyphens, and
              periods only.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
