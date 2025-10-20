"use client";

import React, { createContext, useContext, useState, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Breadcrumb = {
  label: string;
  href: string;
};

type BreadcrumbsContextType = {
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (crumbs: Breadcrumb[]) => void;
  resetBreadcrumbs: () => void;
};

const BreadcrumbsContext = createContext<BreadcrumbsContextType | undefined>(
  undefined
);

const HOME_CRUMB: Breadcrumb = { label: "Home", href: "/" };

const generateBreadcrumbs = (
  pathname: string,
  searchParams: URLSearchParams
): Breadcrumb[] => {
  const breadcrumbs: Breadcrumb[] = [HOME_CRUMB];
  console.log(
    "Generating breadcrumbs for pathname:",
    pathname,
    "searchParams:",
    searchParams.toString()
  );

  // Handle shared routes
  if (pathname.startsWith("/shared")) {
    breadcrumbs.push({ label: "Shared Files", href: "/shared" });
    if (pathname !== "/shared") {
      breadcrumbs.push({
        label: "Shared Link Details",
        href: pathname,
      });
    }
    console.log("Shared route breadcrumbs:", breadcrumbs);
    return breadcrumbs;
  }

  // Handle settings route
  if (pathname === "/settings") {
    breadcrumbs.push({ label: "Settings", href: "/settings" });
    console.log("Settings route breadcrumbs:", breadcrumbs);
    return breadcrumbs;
  }

  // Handle file browser and file details
  const prefix = searchParams.get("prefix");
  const fileKeyRaw = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const fileKey = decodeURIComponent(fileKeyRaw); // Decode before splitting

  console.log("Raw fileKey:", fileKeyRaw, "Decoded fileKey:", fileKey);

  if (prefix) {
    // Folder navigation via prefix
    const parts = decodeURIComponent(prefix)
      .split("/")
      .filter((part) => part && part.trim() !== "");
    let currentPath = "";
    parts.forEach((part) => {
      currentPath += part + "/";
      breadcrumbs.push({
        label: part,
        href: `/?prefix=${encodeURIComponent(currentPath)}`,
      });
    });
    console.log("Prefix breadcrumbs:", breadcrumbs);
  } else if (fileKey && pathname !== "/") {
    // File details view
    console.log("Processing fileKey:", fileKey);
    const parts = fileKey
      .split("/")
      .filter((part) => part && part.trim() !== "");
    console.log("FileKey parts:", parts);
    const fileName = parts.length > 0 ? parts.pop()! : fileKey;
    let currentPath = "";
    parts.forEach((part) => {
      currentPath += part + "/";
      breadcrumbs.push({
        label: part,
        href: `/?prefix=${encodeURIComponent(currentPath)}`,
      });
    });
    if (fileName) {
      breadcrumbs.push({
        label: fileName,
        href: `/${encodeURIComponent(fileKeyRaw)}`, // Use raw fileKey for href
      });
    }
    console.log("File details breadcrumbs:", breadcrumbs);
  } else {
    console.log("Root route, no fileKey or prefix");
  }

  return breadcrumbs;
};

export function BreadcrumbsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([HOME_CRUMB]);

  // Memoize breadcrumb generation
  const newBreadcrumbs = useMemo(
    () => generateBreadcrumbs(pathname, searchParams),
    [pathname, searchParams]
  );

  // Update breadcrumbs only if they have changed
  React.useEffect(() => {
    if (
      breadcrumbs.length !== newBreadcrumbs.length ||
      breadcrumbs.some(
        (crumb, i) =>
          crumb.label !== newBreadcrumbs[i]?.label ||
          crumb.href !== newBreadcrumbs[i]?.href
      )
    ) {
      console.log("Updating breadcrumbs:", newBreadcrumbs);
      setBreadcrumbs(newBreadcrumbs);
    }
  }, [newBreadcrumbs, breadcrumbs]);

  const resetBreadcrumbs = () => {
    console.log("Resetting breadcrumbs to HOME_CRUMB");
    setBreadcrumbs([HOME_CRUMB]);
  };

  return (
    <BreadcrumbsContext.Provider
      value={{
        breadcrumbs,
        setBreadcrumbs,
        resetBreadcrumbs,
      }}
    >
      {children}
    </BreadcrumbsContext.Provider>
  );
}

export function useBreadcrumbs() {
  const context = useContext(BreadcrumbsContext);
  if (!context) {
    throw new Error("useBreadcrumbs must be used within BreadcrumbsProvider");
  }
  return context;
}
