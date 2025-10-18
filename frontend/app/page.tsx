"use client";

import { ToastProvider } from "@/components/toast-provider";
import FileBrowser from "@/components/files-view/file-browser";

export default function HomePage() {
  return (
    <ToastProvider>
      <FileBrowser />
    </ToastProvider>
  );
}
