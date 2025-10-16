"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";

export default function ClientLayout({
  children,
  hideOn = ["/login", "/signup"],
}: {
  children: React.ReactNode;
  hideOn?: string[]; // routes where sidebar should be hidden (exact match)
}) {
  const pathname = usePathname();

  // If you want prefix matching (e.g. /auth/*) use startsWith below instead
  const shouldHide =
    hideOn.some((p) => p === pathname) || pathname.startsWith("/download");

  if (shouldHide) {
    return (
      <div className="flex min-h-dvh w-full overflow-x-hidden">
        <main className="flex-1 min-w-0 p-4 md:p-6">
          <div className="mx-auto w-full max-w-[1600px]">{children}</div>
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <Sidebar />
      <SidebarInset>
        <div className="p-4 md:p-6 mx-auto w-full max-w-[1600px]">
          <div className="mb-3 md:hidden">
            <SidebarTrigger />
          </div>
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
