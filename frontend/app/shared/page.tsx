"use client"

import { ToastProvider } from "@/components/toast-provider"
import { SharedLinks } from "@/components/shared-view/shared-links"

export default function SharedPage() {
  return (
    <ToastProvider>
      <SharedLinks />
    </ToastProvider>
  )
}
