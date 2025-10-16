import { Loader2 } from "lucide-react";
import { BrandIcon } from "./brand-wordmark";

export function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <div className="flex items-center gap-3">
        <BrandIcon />
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  );
}
