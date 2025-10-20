"use client";

import { useState, useEffect, use } from "react";
import {
  Download,
  Lock,
  AlertCircle,
  Ban,
  Clock,
  Link2,
  FileX,
  File,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import Link from "next/link";

import { getSharedFileInfo, getDownloadLink } from "@/api/share.api";
import { formatFileSize } from "@/utils/helpers";
import {
  GetFileInfoResultType,
  GetDownloadLinkResultType,
  FileInfo,
} from "@/types/share.types";

export default function PublicDownloadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: linkId } = use(params);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{
    status: number;
    message: string;
  } | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [expiresIn, setExpiresIn] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const fetchFileInfo = async () => {
    try {
      const res: GetFileInfoResultType = await getSharedFileInfo(linkId);
      if (res.success) {
        setFileInfo(res.result);
        setIsPasswordProtected(res.result.has_password);
        if (res.result.has_password) {
          setShowPasswordForm(true);
        }
      } else {
        const status = res.error?.status ?? 500;
        const errorMsg = res.error?.message ?? "Failed to fetch file info";
        setError({ status, message: errorMsg });
      }
    } catch (error: unknown) {
      const status =
        (error as { response?: { status?: number } }).response?.status ?? 500;
      let errorMsg = "An unexpected error occurred";
      if (status === 400) errorMsg = "Invalid link ID";
      else if (status === 404) errorMsg = "Shared link not found";
      setError({ status, message: errorMsg });
    }
  };

  const attemptDownloadLink = async (pass?: string) => {
    setError(null);

    const res: GetDownloadLinkResultType = await getDownloadLink(linkId, pass);

    if (res.success) {
      setDownloadUrl(res.result.url);
      setExpiresIn(res.result.expires_in);
      setShowPasswordForm(false);
      setPassword("");
      setError(null);
    } else {
      const status = res.error?.status ?? 500;
      const errorMsg = res.error?.message ?? "Failed to create download link";

      if (status === 401) {
        const isPasswordRequired =
          errorMsg.toLowerCase().includes("required") ||
          errorMsg.toLowerCase().includes("password is required");

        if (isPasswordRequired) {
          setIsPasswordProtected(true);
          setShowPasswordForm(true);
          setError(null);
        } else {
          setError({
            status: 401,
            message: "Incorrect password. Please try again.",
          });
        }
        return;
      }

      if (status === 400) {
        setError({ status, message: "Invalid link ID" });
      } else if (status === 404) {
        setError({ status, message: "Shared link not found" });
      } else if (status === 403) {
        setError({
          status,
          message: "This link has been disabled by the owner.",
        });
      } else if (status === 410) {
        setError({ status, message: "This link has expired." });
      } else {
        setError({ status, message: errorMsg });
      }
    }
  };

  const handlePasswordSubmit = async () => {
    if (!password.trim()) return;

    setIsSubmittingPassword(true);

    try {
      await attemptDownloadLink(password);
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  const handleCreateLink = async () => {
    await attemptDownloadLink();
  };

  const handleDownload = () => {
    if (!downloadUrl || !fileInfo) return;
    setIsDownloading(true);
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileInfo.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => setIsDownloading(false), 2000);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (expiresIn === null || expiresIn <= 0) return;

    const interval = setInterval(() => {
      setExpiresIn((prev) => {
        if (prev && prev > 1) {
          return prev - 1;
        } else {
          setDownloadUrl(null);
          setExpiresIn(null);
          if (isPasswordProtected) {
            setShowPasswordForm(true);
            setPassword("");
          }
          return 0;
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresIn, isPasswordProtected]);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setError(null);
      await fetchFileInfo();
      setLoading(false);
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkId]);

  const getErrorIcon = (status: number) => {
    switch (status) {
      case 400:
        return <Link2 className="h-8 w-8 text-destructive" />;
      case 401:
        return <Lock className="h-8 w-8 text-destructive" />;
      case 403:
        return <Ban className="h-8 w-8 text-destructive" />;
      case 404:
        return <FileX className="h-8 w-8 text-destructive" />;
      case 410:
        return <Clock className="h-8 w-8 text-destructive" />;
      default:
        return <AlertCircle className="h-8 w-8 text-destructive" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-center">
            <BrandWordmark />
          </div>

          <div className="bg-card border border-border rounded-lg shadow-lg p-8 space-y-6 text-center">
            <div className="flex items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
            <p className="text-sm text-muted-foreground">
              Loading file details...
            </p>
          </div>
        </div>
      </div>
    );
  }

  if ((error && error.status !== 401) || (!fileInfo && !loading)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-center">
            <BrandWordmark />
          </div>

          <div className="bg-card border border-border rounded-lg shadow-lg p-8 space-y-6 text-center">
            <div className="space-y-2">
              <div className="flex justify-center">
                {error && getErrorIcon(error.status)}
              </div>
              <h1 className="text-2xl font-bold text-foreground">
                Download Error
              </h1>
              <p className="text-sm text-destructive">
                {error?.message || "File not found"}
              </p>
            </div>
          </div>

          <div className="text-center space-y-4">
            <div className="text-sm text-muted-foreground">
              Powered by{" "}
              <span className="font-semibold text-foreground">CloudFlow+</span>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/signup">
                <Button size="sm" className="w-full sm:w-auto">
                  Create your free account
                </Button>
              </Link>
              <Link href="/features">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full sm:w-auto text-primary hover:bg-transparent"
                >
                  See why CloudFlow+
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!fileInfo) return null;

  const fileSize = formatFileSize(fileInfo.size_bytes);

  return (
    <>
      <style>{`
        @keyframes glowPulse {
          0%, 100% {
            box-shadow: 0 0 20px rgba(59, 130, 246, 0.5),
                        0 0 40px rgba(59, 130, 246, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(59, 130, 246, 0.8),
                        0 0 60px rgba(59, 130, 246, 0.5);
          }
        }

        @keyframes scaleIn {
          0% {
            transform: scale(0.8);
            opacity: 0;
          }
          50% {
            transform: scale(1.05);
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }

        @keyframes attention {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
        }

        @keyframes iconBounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        .download-button-animated {
          animation: scaleIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
                     attention 1s ease-in-out 0.5s 3,
                     glowPulse 2s ease-in-out 3.5s infinite;
        }

        .download-icon-bounce {
          display: inline-block;
          animation: iconBounce 1s ease-in-out infinite;
        }
          .animated-link {
      position: relative;
      text-decoration: none;
      display: inline-block;
      transition: all 0.3s ease-out;
    }
    
    .animated-link::after {
      content: '';
      position: absolute;
      width: 100%;
      height: 2px;
      bottom: -2px;
      left: 0;
      background: linear-gradient(90deg, 
        hsl(var(--primary)) 0%, 
        hsl(var(--primary) / 0.6) 100%);
      transform: scaleX(0);
      transform-origin: bottom right;
      transition: transform 0.3s ease-out;
    }
    
    .animated-link:hover {
      text-shadow: 0 0 10px hsl(var(--primary) / 0.8),
                   0 0 20px hsl(var(--primary) / 0.5),
                   0 0 30px hsl(var(--primary) / 0.3);
    }
    
    .animated-link:hover::after {
      transform: scaleX(1);
      transform-origin: bottom left;
    }
    
    .cloudflow-link {
      transition: all 0.3s ease-out;
    }

    .cloudflow-link:hover {
      text-shadow: 
        0 0 10px hsl(var(--primary) / 0.8),
        0 0 20px hsl(var(--primary) / 0.6),
        0 0 30px hsl(var(--primary) / 0.4),
        0 0 40px hsl(var(--primary) / 0.2);
    }

      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-background to-muted flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-8 animate-in fade-in duration-500">
          <div className="flex justify-center">
            <BrandWordmark />
          </div>

          <div className="bg-card border border-border rounded-lg shadow-lg p-8 space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">
                Download File
              </h1>
              <p className="text-sm text-muted-foreground">{fileInfo.name}</p>
            </div>
            <div className="bg-muted rounded-lg p-8 flex items-center justify-center">
              <File className="h-12 w-12 text-foreground" />
            </div>
            <div className="space-y-2 text-sm">
              <p className="text-foreground">
                <span className="font-medium">File Size:</span> {fileSize.value}{" "}
                {fileSize.unit}
              </p>
            </div>

            {showPasswordForm ? (
              <div className="space-y-4">
                {error?.status === 401 && (
                  <div className="flex items-center justify-center gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                    <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      {error.message}
                    </p>
                  </div>
                )}
                <div>
                  <Input
                    type="password"
                    placeholder="Enter password to unlock"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (error?.status === 401) {
                        setError(null);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (
                        e.key === "Enter" &&
                        password.trim() &&
                        !isSubmittingPassword
                      ) {
                        handlePasswordSubmit();
                      }
                    }}
                    disabled={isSubmittingPassword}
                    className="text-sm"
                    autoFocus
                  />
                </div>
                <Button
                  onClick={handlePasswordSubmit}
                  disabled={!password.trim() || isSubmittingPassword}
                  size="lg"
                  className="w-full"
                >
                  {isSubmittingPassword ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Verifying...
                    </div>
                  ) : (
                    <>
                      <Lock className="h-4 w-4 mr-2" />
                      Unlock Download
                    </>
                  )}
                </Button>
              </div>
            ) : !downloadUrl ? (
              <Button
                key="generate-btn"
                onClick={handleCreateLink}
                size="lg"
                className="w-full"
              >
                Generate Download Link
              </Button>
            ) : (
              <div className="space-y-4">
                <Button
                  key="download-btn"
                  onClick={handleDownload}
                  disabled={isDownloading}
                  size="lg"
                  className="w-full download-button-animated"
                >
                  {isDownloading ? (
                    <div className="flex items-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Downloading...
                    </div>
                  ) : (
                    <>
                      <Download className="h-5 w-5 mr-2 download-icon-bounce" />
                      Download File
                    </>
                  )}
                </Button>
                {expiresIn && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Link expires in {formatTime(expiresIn)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="text-center space-y-4">
            <div className="text-sm text-muted-foreground">
              Want to share files securely like this?
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <Link
                href="/"
                className="text-sm font-medium text-primary hover:text-primary/90 relative inline-block transition-all duration-300 group hover:shadow-lg hover:shadow-primary/30"
              >
                <span className="relative">
                  Continue with CloudFlow+
                  <span className="absolute bottom-0 left-0 w-0 h-0.5 bg-primary transition-all duration-300 ease-out group-hover:w-full"></span>
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
