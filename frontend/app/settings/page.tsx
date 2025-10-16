"use client"

import { ToastProvider } from "@/components/toast-provider"
import { Settings } from "@/components/settings"

export default function SettingsPage() {
  return (
    <ToastProvider>
      <Settings />
    </ToastProvider>
  )
}
