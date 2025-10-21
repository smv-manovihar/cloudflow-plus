import type React from "react";
import type { Metadata } from "next";
import { Toaster } from "sonner";
import { AppLayout } from "@/components/layout/app-layout";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

import {
  Plus_Jakarta_Sans as V0_Font_Plus_Jakarta_Sans,
  IBM_Plex_Mono as V0_Font_IBM_Plex_Mono,
  Lora as V0_Font_Lora,
} from "next/font/google";
import { AuthProvider } from "@/contexts/auth.context";
import { BreadcrumbsProvider } from "@/contexts/breadcrumbs.context";
import { Suspense } from "react";
import { Loading } from "@/components/loading";

// Initialize fonts
const _plusJakartaSans = V0_Font_Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});
const _ibmPlexMono = V0_Font_IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["100", "200", "300", "400", "500", "600", "700"],
});
const _lora = V0_Font_Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "CloudFlow+",
  description: "Modern cloud storage and secure file sharing application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/icon.png" />
      </head>
      <body className="font-sans antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Toaster position="top-right" />
          <Suspense fallback={<Loading />}>
            <AuthProvider>
              <BreadcrumbsProvider>
                <AppLayout>{children}</AppLayout>
              </BreadcrumbsProvider>
            </AuthProvider>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
