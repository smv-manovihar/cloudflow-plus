"use client"

import type React from "react"

import { Sidebar } from "@/components/sidebar"
import { Breadcrumbs } from "@/components/breadcrumbs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useState } from "react"
import { useToast } from "@/hooks/use-toast"

export default function SettingsPage() {
  const { toast } = useToast()
  const [name, setName] = useState("Jamie Appleseed")
  const [email, setEmail] = useState("jamie@example.com")

  async function onSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    // PUT /api/me (placeholder)
    toast({ title: "Profile updated", description: "Your account details were saved." })
  }

  return (
    <div className="min-h-dvh grid md:grid-cols-[260px_1fr]">
      <Sidebar />
      <main className="p-4 md:p-6">
        <header className="mb-6 grid gap-3">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Settings" }]} />
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSaveProfile} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="flex justify-end">
                  <Button type="submit">Save changes</Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Account</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <Button
                variant="secondary"
                onClick={() => {
                  // POST /api/logout (placeholder)
                  toast({ title: "Signed out" })
                }}
              >
                Log out
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  // DELETE /api/me (placeholder)
                  toast({ title: "Account deletion requested", description: "We will process this shortly." })
                }}
              >
                Delete account
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
