"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumbs } from "@/components/breadcrumbs";
import {
  ManageShareDialog,
  type ManageShareItem,
} from "@/components/manage-share-dialog";
import { Sidebar } from "@/components/sidebar";

type SharedItem = {
  id: string;
  name: string;
  type: "file" | "folder";
  enabled: boolean;
  url: string;
  updatedAt: string;
  size?: string;
  createdAt?: string;
  expiresAt?: string | null;
  views?: number;
};

export default function SharedPage() {
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [manageOpen, setManageOpen] = useState(false);
  const [selected, setSelected] = useState<ManageShareItem | null>(null);
  const [items, setItems] = useState<SharedItem[]>([
    {
      id: "s1",
      name: "logo.png",
      type: "file",
      enabled: true,
      url: "/download/f3",
      updatedAt: "2025-08-05",
      size: "248 KB",
      createdAt: "2025-07-31",
      expiresAt: "2025-09-01",
      views: 42,
    },
    {
      id: "s2",
      name: "assets",
      type: "folder",
      enabled: false,
      url: "/download/folder-2",
      updatedAt: "2025-08-02",
      size: "—",
      createdAt: "2025-07-28",
      expiresAt: null,
      views: 3,
    },
  ]);

  const filtered = useMemo(
    () =>
      query
        ? items.filter((i) =>
            i.name.toLowerCase().includes(query.toLowerCase())
          )
        : items,
    [items, query]
  );

  function setEnabled(id: string, enabled: boolean) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, enabled } : i)));
  }

  function copy(url: string) {
    navigator.clipboard.writeText(window.location.origin + url);
    toast({
      title: "Copied link",
      description: "The public link was copied to your clipboard.",
    });
  }

  function revoke(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast({
      title: "Share revoked",
      description: "The shared link has been disabled.",
    });
  }

  return (
    <div className="min-h-dvh grid md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="p-4 md:p-6">
        <header className="mb-6">
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Shared" }]}
          />
          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h1 className="text-balance text-2xl font-semibold tracking-tight">
              Shared
            </h1>
            <div className="flex items-center gap-2">
              <label htmlFor="shared-search" className="sr-only">
                Search shared items
              </label>
              <Input
                id="shared-search"
                placeholder="Search shared items"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full sm:w-[260px]"
              />
            </div>
          </div>
        </header>

        <section
          aria-label="Manage shared items"
          className="overflow-hidden rounded-md border"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">
                  Last modified
                </TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Views</TableHead>
                <TableHead className="hidden md:table-cell">Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="font-medium">{i.name}</TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {i.updatedAt}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={i.enabled}
                        onCheckedChange={(v) => setEnabled(i.id, v)}
                        aria-label={`Toggle sharing for ${i.name}`}
                      />
                      <span className="text-sm text-muted-foreground">
                        {i.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {i.views ?? 0}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {i.expiresAt ?? "Never"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          navigator.clipboard.writeText(
                            window.location.origin + i.url
                          );
                          toast({
                            title: "Copied link",
                            description:
                              "The public link was copied to your clipboard.",
                          });
                        }}
                        disabled={!i.enabled}
                      >
                        Copy link
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setSelected({
                            id: i.id,
                            name: i.name,
                            size: i.size ?? "—",
                            createdAt: i.createdAt ?? i.updatedAt,
                            expiresAt: i.expiresAt ?? null,
                            views: i.views ?? 0,
                            url: window.location.origin + i.url,
                          });
                          setManageOpen(true);
                        }}
                      >
                        Manage
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => revoke(i.id)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-sm text-muted-foreground"
                  >
                    No shared items found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </section>

        <ManageShareDialog
          open={manageOpen}
          onOpenChange={setManageOpen}
          item={selected}
        />
      </main>
    </div>
  );
}
