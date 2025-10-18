"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { UploadDropzone } from "@/components/files-view/upload-dropzone";
import { Input } from "@/components/ui/input";
import { FileList, type FileItem } from "@/components/file-list";
import { ShareDialog } from "@/components/shared-view/share-dialog";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { UploadProgress } from "@/components/upload-progress";

export default function BucketDetailPage() {
  const params = useParams<{ id: string }>();
  const bucketId = params?.id || "bucket";

  const [files, setFiles] = useState<FileItem[]>([
    {
      id: "f1",
      name: "README.md",
      type: "file",
      size: "2 KB",
      updatedAt: "2025-08-01",
    },
    {
      id: "f2",
      name: "assets",
      type: "folder",
      size: "-",
      updatedAt: "2025-08-02",
    },
    {
      id: "f3",
      name: "logo.png",
      type: "file",
      size: "128 KB",
      updatedAt: "2025-08-05",
    },
  ]);
  const [query, setQuery] = useState("");
  const [shareFor, setShareFor] = useState<FileItem | null>(null);

  // Upload progress states
  const [isUploading, setIsUploading] = useState(false);
  const [clientPct, setClientPct] = useState(0);
  const [sseUrl, setSseUrl] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      query
        ? files.filter((f) =>
            f.name.toLowerCase().includes(query.toLowerCase())
          )
        : files,
    [files, query]
  );

  function appendUploaded(newFiles: File[]) {
    const mapped: FileItem[] = newFiles.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      name: f.name,
      type: "file",
      size: `${Math.max(1, Math.round(f.size / 1024))} KB`,
      updatedAt: new Date().toISOString().slice(0, 10),
    }));
    setFiles((prev) => [...mapped, ...prev]);
  }

  // Upload with client progress (XHR) + storage progress (SSE)
  async function uploadFiles(selected: File[]) {
    if (!selected.length) return;
    setIsUploading(true);
    setClientPct(0);
    setSseUrl(null);

    const totalBytes = selected.reduce((acc, f) => acc + f.size, 0);
    let sentBytes = 0;

    for (const file of selected) {
      // Init upload to receive SSE progress URL (simulated)
      const initRes = await fetch("/api/uploads/init", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name, bucket: bucketId }),
      });
      const initData = (await initRes.json()) as {
        uploadId: string;
        sseUrl: string;
      };
      setSseUrl(initData.sseUrl);

      // Send file to backend with XHR to capture client-side progress
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/uploads");
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const current = sentBytes + ev.loaded;
            const pct = (current / totalBytes) * 100;
            setClientPct(pct);
          }
        };
        xhr.onload = () => {
          sentBytes += file.size;
          setClientPct((sentBytes / totalBytes) * 100);
          resolve();
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        const form = new FormData();
        form.append("file", file);
        form.append("uploadId", initData.uploadId);
        form.append("bucket", bucketId as string);
        xhr.send(form);
      });
    }

    // Wrap up UI
    appendUploaded(selected);
    setTimeout(() => {
      setIsUploading(false);
      setSseUrl(null);
      setClientPct(0);
    }, 600);
  }

  return (
    <div className="p-4 md:p-6">
      <header className="mb-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Buckets", href: "/" },
            { label: bucketId },
          ]}
        />
        <h1 className="mt-4 text-balance text-2xl font-semibold tracking-tight">
          {bucketId}
        </h1>
        <div className="mt-4">
          <label htmlFor="search" className="sr-only">
            Search files
          </label>
          <Input
            id="search"
            placeholder="Search files and folders"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="max-w-md"
          />
        </div>
      </header>

      <section className="mb-6 grid gap-4" aria-label="Upload files">
        <UploadDropzone onFiles={uploadFiles} />
        {isUploading ? (
          <UploadProgress clientProgress={clientPct} sseUrl={sseUrl} />
        ) : null}
      </section>

      <section aria-label="File browser">
        <FileList
          items={filtered}
          onShare={(item) => setShareFor(item)}
          onDownload={() => {
            // implement download in real app
          }}
          onDelete={(item) => {
            setFiles((prev) => prev.filter((f) => f.id !== item.id));
          }}
        />
      </section>
      <ShareDialog
        item={shareFor}
        open={!!shareFor}
        onOpenChange={(open) => !open && setShareFor(null)}
      />
    </div>
  );
}
