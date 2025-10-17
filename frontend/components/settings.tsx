"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export default function Settings() {
  const [profileData, setProfileData] = useState({
    fullName: "John Doe",
    email: "john@example.com",
    phone: "+1 (555) 123-4567",
  });

  const [passwordData, setPasswordData] = useState({
    current: "",
    new: "",
    confirm: "",
  });

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleProfileChange = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success("Profile updated successfully");
    setIsSaving(false);
  };

  const handleChangePassword = async () => {
    if (!passwordData.current || !passwordData.new || !passwordData.confirm) {
      toast.error("Please fill in all password fields");
      return;
    }

    if (passwordData.new !== passwordData.confirm) {
      toast.error("New passwords do not match");
      return;
    }

    if (passwordData.new.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    toast.success("Password changed successfully");
    setPasswordData({ current: "", new: "", confirm: "" });
    setIsSaving(false);
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      toast.error("Please type DELETE to confirm");
      return;
    }

    setIsSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    toast.success("Account deleted");
    window.location.href = "/login";
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your account and preferences
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="animate-in fade-in slide-in-from-top-2 duration-500">
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Full Name
                </label>
                <Input
                  value={profileData.fullName}
                  onChange={(e) =>
                    handleProfileChange("fullName", e.target.value)
                  }
                  placeholder="Your full name"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Email
                </label>
                <Input
                  type="email"
                  value={profileData.email}
                  onChange={(e) => handleProfileChange("email", e.target.value)}
                  placeholder="your@email.com"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Phone
                </label>
                <Input
                  value={profileData.phone}
                  onChange={(e) => handleProfileChange("phone", e.target.value)}
                  placeholder="+1 (555) 123-4567"
                  className="w-full"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveProfile}
                  disabled={isSaving}
                  className="w-full md:w-auto"
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="animate-in fade-in slide-in-from-top-2 duration-500 delay-100">
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>
                Update your password to keep your account secure
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Current Password
                </label>
                <Input
                  type="password"
                  value={passwordData.current}
                  onChange={(e) =>
                    handlePasswordChange("current", e.target.value)
                  }
                  placeholder="••••••••"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  New Password
                </label>
                <Input
                  type="password"
                  value={passwordData.new}
                  onChange={(e) => handlePasswordChange("new", e.target.value)}
                  placeholder="••••••••"
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={passwordData.confirm}
                  onChange={(e) =>
                    handlePasswordChange("confirm", e.target.value)
                  }
                  placeholder="••••••••"
                  className="w-full"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleChangePassword}
                  disabled={isSaving}
                  className="w-full md:w-auto"
                >
                  {isSaving ? "Updating..." : "Update Password"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/50 animate-in fade-in slide-in-from-top-2 duration-500 delay-200 md:col-span-2">
            <CardHeader>
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
              <CardDescription>Irreversible actions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <p className="text-sm text-muted-foreground max-w-xl">
                  These actions are destructive and cannot be undone.
                </p>
                <div className="flex-shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => setShowDeleteAlert(true)}
                    className="text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10 w-full sm:w-auto"
                  >
                    Delete Account
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All your files and data will be
              permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive">
                All your files and data will be permanently deleted. This cannot
                be reversed.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Type <span className="font-bold">DELETE</span> to confirm
              </label>
              <Input
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value.toUpperCase())}
                placeholder="DELETE"
                className={cn(
                  deleteConfirm === "DELETE" && "border-destructive"
                )}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-4">
            <AlertDialogCancel className="flex-1">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== "DELETE" || isSaving}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
            >
              {isSaving ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
