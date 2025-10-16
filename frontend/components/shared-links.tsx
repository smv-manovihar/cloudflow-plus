"use client"

import { useState } from "react"
import { Copy, Eye, EyeOff, Trash2, SettingsIcon, Download, QrCode } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/toast-provider"
import { cn } from "@/lib/utils"

interface SharedLink {
  id: string
  fileName: string
  fileSize: number
  link: string
  status: "active" | "expired"
  expiresAt: string
  createdAt: string
  downloads: number
}

export function SharedLinks() {
  const { addToast } = useToast()
  const [searchQuery, setSearchQuery] = useState("")
  const [showExpired, setShowExpired] = useState(false)
  const [selectedLink, setSelectedLink] = useState<SharedLink | null>(null)
  const [showManageDialog, setShowManageDialog] = useState(false)
  const [links, setLinks] = useState<SharedLink[]>([
    {
      id: "1",
      fileName: "presentation.pdf",
      fileSize: 2.5,
      link: "https://cloudflow.app/shared/abc123",
      status: "active",
      expiresAt: "2024-02-15",
      createdAt: "2024-01-15",
      downloads: 5,
    },
    {
      id: "2",
      fileName: "budget.xlsx",
      fileSize: 1.2,
      link: "https://cloudflow.app/shared/def456",
      status: "active",
      expiresAt: "2024-02-20",
      createdAt: "2024-01-10",
      downloads: 12,
    },
    {
      id: "3",
      fileName: "old-report.docx",
      fileSize: 0.8,
      link: "https://cloudflow.app/shared/ghi789",
      status: "expired",
      expiresAt: "2024-01-05",
      createdAt: "2023-12-15",
      downloads: 3,
    },
  ])

  const filteredLinks = links.filter((link) => {
    const matchesSearch = link.fileName.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesExpired = showExpired || link.status === "active"
    return matchesSearch && matchesExpired
  })

  const handleCopyLink = (link: string) => {
    navigator.clipboard.writeText(link)
    addToast({ type: "success", message: "Link copied to clipboard", duration: 2000 })
  }

  const handleToggleStatus = (id: string) => {
    setLinks((prev) =>
      prev.map((link) =>
        link.id === id ? { ...link, status: link.status === "active" ? "expired" : "active" } : link,
      ),
    )
    addToast({ type: "success", message: "Share status updated", duration: 2000 })
  }

  const handleRevoke = (id: string) => {
    setLinks((prev) => prev.filter((link) => link.id !== id))
    addToast({ type: "success", message: "Share link revoked", duration: 2000 })
  }

  const handleDownloadQR = () => {
    addToast({ type: "success", message: "QR code downloaded", duration: 2000 })
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="border-b border-border bg-card p-4 md:p-6 space-y-4 animate-in fade-in slide-in-from-top-2 duration-500">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center">
          <Input
            placeholder="Search shared files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 transition-all focus:ring-2 focus:ring-primary/50"
          />

          <Button
            variant={showExpired ? "default" : "outline"}
            onClick={() => setShowExpired(!showExpired)}
            className="whitespace-nowrap transition-all hover:scale-105"
          >
            {showExpired ? "Hide Expired" : "Show Expired"}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {filteredLinks.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-center animate-in fade-in duration-500">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">No shared links</p>
              <p className="text-xs text-muted-foreground">Share files to create links</p>
            </div>
          </div>
        ) : (
          <div className="p-4 md:p-6 space-y-3">
            {filteredLinks.map((link, index) => (
              <Card
                key={link.id}
                className={cn(
                  "p-4 hover:shadow-md transition-all animate-in fade-in slide-in-from-left-2 duration-300",
                  link.status === "expired" && "opacity-60",
                )}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-sm font-medium text-foreground truncate">{link.fileName}</p>
                      <span
                        className={cn(
                          "text-xs px-2 py-1 rounded-full font-medium animate-in fade-in duration-300",
                          link.status === "active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {link.status === "active" ? "Active" : "Expired"}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {link.fileSize} MB • {link.downloads} downloads • Expires {link.expiresAt}
                    </p>
                  </div>

                  <div className="flex gap-2 flex-wrap md:flex-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyLink(link.link)}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedLink(link)
                        setShowManageDialog(true)
                      }}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      <SettingsIcon className="h-4 w-4 mr-2" />
                      Manage
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(link.id)}
                      className="flex-1 md:flex-none transition-all hover:scale-105"
                    >
                      {link.status === "active" ? (
                        <>
                          <Eye className="h-4 w-4 mr-2" />
                          Active
                        </>
                      ) : (
                        <>
                          <EyeOff className="h-4 w-4 mr-2" />
                          Inactive
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRevoke(link.id)}
                      className="flex-1 md:flex-none text-destructive hover:text-destructive transition-all hover:scale-105"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Revoke
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showManageDialog} onOpenChange={setShowManageDialog}>
        <DialogContent className="max-w-md animate-in fade-in zoom-in-95 duration-300">
          <DialogHeader>
            <DialogTitle>Manage Share</DialogTitle>
            <DialogDescription>Update share settings and view details</DialogDescription>
          </DialogHeader>

          {selectedLink && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">File Name</p>
                <p className="text-sm text-foreground">{selectedLink.fileName}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Share Link</p>
                <div className="flex gap-2">
                  <Input value={selectedLink.link} readOnly className="text-xs" />
                  <Button variant="outline" size="icon" onClick={() => handleCopyLink(selectedLink.link)}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">QR Code</p>
                <div className="bg-muted p-4 rounded-lg flex items-center justify-center h-32">
                  <div className="text-center">
                    <QrCode className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">QR Code Preview</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadQR}
                  className="w-full mt-2 bg-transparent transition-all hover:scale-105"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download QR
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Created</p>
                  <p className="text-sm text-foreground">{selectedLink.createdAt}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Expires</p>
                  <p className="text-sm text-foreground">{selectedLink.expiresAt}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Downloads</p>
                <p className="text-sm text-foreground">{selectedLink.downloads}</p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Change Expiration</label>
                <Input type="date" defaultValue={selectedLink.expiresAt} />
              </div>

              <div className="flex gap-2 pt-4 border-t border-border">
                <Button variant="outline" onClick={() => setShowManageDialog(false)} className="flex-1">
                  Close
                </Button>
                <Button
                  onClick={() => {
                    addToast({ type: "success", message: "Changes saved", duration: 2000 })
                    setShowManageDialog(false)
                  }}
                  className="flex-1"
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
