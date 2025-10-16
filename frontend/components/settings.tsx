"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/components/toast-provider"
import { cn } from "@/lib/utils"

export function Settings() {
  const { addToast } = useToast()
  const [profileData, setProfileData] = useState({
    fullName: "John Doe",
    email: "john@example.com",
    phone: "+1 (555) 123-4567",
  })

  const [passwordData, setPasswordData] = useState({
    current: "",
    new: "",
    confirm: "",
  })

  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleProfileChange = (field: string, value: string) => {
    setProfileData((prev) => ({ ...prev, [field]: value }))
  }

  const handlePasswordChange = (field: string, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSaveProfile = async () => {
    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    addToast({ type: "success", message: "Profile updated successfully", duration: 2000 })
    setIsSaving(false)
  }

  const handleChangePassword = async () => {
    if (!passwordData.current || !passwordData.new || !passwordData.confirm) {
      addToast({ type: "error", message: "Please fill in all password fields", duration: 2000 })
      return
    }

    if (passwordData.new !== passwordData.confirm) {
      addToast({ type: "error", message: "New passwords do not match", duration: 2000 })
      return
    }

    if (passwordData.new.length < 8) {
      addToast({ type: "error", message: "Password must be at least 8 characters", duration: 2000 })
      return
    }

    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))
    addToast({ type: "success", message: "Password changed successfully", duration: 2000 })
    setPasswordData({ current: "", new: "", confirm: "" })
    setIsSaving(false)
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== "DELETE") {
      addToast({ type: "error", message: "Please type DELETE to confirm", duration: 2000 })
      return
    }

    setIsSaving(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    addToast({ type: "success", message: "Account deleted", duration: 2000 })
    // Redirect to login
    window.location.href = "/login"
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-auto">
      <div className="p-4 md:p-6 space-y-6 max-w-2xl">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your account and preferences</p>
        </div>

        {/* Profile Section */}
        <Card className="animate-in fade-in slide-in-from-top-2 duration-500">
          <CardHeader>
            <CardTitle>Profile Information</CardTitle>
            <CardDescription>Update your personal details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Full Name</label>
              <Input
                value={profileData.fullName}
                onChange={(e) => handleProfileChange("fullName", e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Email</label>
              <Input
                type="email"
                value={profileData.email}
                onChange={(e) => handleProfileChange("email", e.target.value)}
                placeholder="your@email.com"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Phone</label>
              <Input
                value={profileData.phone}
                onChange={(e) => handleProfileChange("phone", e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <Button onClick={handleSaveProfile} disabled={isSaving} className="w-full md:w-auto">
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </CardContent>
        </Card>

        {/* Password Section */}
        <Card className="animate-in fade-in slide-in-from-top-2 duration-500 delay-100">
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Current Password</label>
              <Input
                type="password"
                value={passwordData.current}
                onChange={(e) => handlePasswordChange("current", e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">New Password</label>
              <Input
                type="password"
                value={passwordData.new}
                onChange={(e) => handlePasswordChange("new", e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Confirm New Password</label>
              <Input
                type="password"
                value={passwordData.confirm}
                onChange={(e) => handlePasswordChange("confirm", e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button onClick={handleChangePassword} disabled={isSaving} className="w-full md:w-auto">
              {isSaving ? "Updating..." : "Update Password"}
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50 animate-in fade-in slide-in-from-top-2 duration-500 delay-200">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => setShowDeleteAlert(true)}
              className="text-destructive hover:text-destructive border-destructive/50 hover:bg-destructive/10"
            >
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All your files and data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
              <p className="text-sm text-destructive">
                All your files and data will be permanently deleted. This cannot be reversed.
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
                className={cn(deleteConfirm === "DELETE" && "border-destructive")}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <AlertDialogCancel className="flex-1">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteConfirm !== "DELETE" || isSaving}
              className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? "Deleting..." : "Delete Account"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
