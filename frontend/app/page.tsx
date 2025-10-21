"use client";
import FileBrowser from "@/components/files-view/file-browser";
import { Loading } from "@/components/loading";
import { useAuth } from "@/contexts/auth.context";

export default function HomePage() {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <Loading />;
  }
  return <FileBrowser />;
}
