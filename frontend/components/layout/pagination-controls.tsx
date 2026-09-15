import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PaginationInfo } from "@/types/files.types";

interface PaginationControlsProps {
  pagination: PaginationInfo;
  currentPageIndex: number;
  onPrevious: () => void;
  onNext: () => void;
}

export default function PaginationControls({
  pagination,
  currentPageIndex,
  onPrevious,
  onNext,
}: PaginationControlsProps) {
  const total = pagination.total ?? pagination.count;
  const pageSize = pagination.page_size || 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = currentPageIndex + 1;
  const canGoPrevious = currentPageIndex > 0;
  const canGoNext = pagination.has_more || currentPage < totalPages;

  const startItem = total === 0 ? 0 : currentPageIndex * pageSize + 1;
  const endItem = Math.min(currentPageIndex * pageSize + pagination.count, total);

  return (
    <div className="border-t border-border p-4 md:p-6 flex flex-col md:flex-row items-center justify-between gap-4 bg-card animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="text-sm text-muted-foreground">
        {total === 0 ? (
          "No items"
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{startItem}–{endItem}</span> of{" "}
            <span className="font-medium text-foreground">{total}</span> items
          </>
        )}
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
        <div className="px-3 py-1 text-sm bg-muted rounded-md font-medium">
          Page {currentPage} of {totalPages}
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
