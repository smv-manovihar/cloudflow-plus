import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface SharedPaginationControlsProps {
  total: number;
  page: number;
  pageSize: number;
  onPrevious: () => void;
  onNext: () => void;
}

export default function SharedPaginationControls({
  total,
  page,
  pageSize,
  onPrevious,
  onNext,
}: SharedPaginationControlsProps) {
  const totalPages = Math.ceil(total / pageSize);
  const canGoPrevious = page > 1;
  const canGoNext = page < totalPages;

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  return (
    <div className="border-t border-border p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-card animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="text-sm text-muted-foreground">
        Showing {startItem}–{endItem} of {total} items
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="gap-1"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <div className="px-3 py-1 text-sm bg-muted rounded-md">
          {page}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onNext}
          disabled={!canGoNext}
          className="gap-1"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
