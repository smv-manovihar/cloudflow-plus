"use client"

import type React from "react"

import { createContext, useContext, useState, useCallback } from "react"
import { Toast } from "@/components/toast"

export interface ToastMessage {
  id: string
  type: "success" | "error" | "loading" | "progress"
  message: string
  progress?: number
  duration?: number
}

interface ToastContextType {
  toasts: ToastMessage[]
  addToast: (message: Omit<ToastMessage, "id">) => string
  removeToast: (id: string) => void
  updateToast: (id: string, updates: Partial<ToastMessage>) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const addToast = useCallback((message: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).substr(2, 9)
    const toast: ToastMessage = { ...message, id }

    setToasts((prev) => [...prev, toast])

    if (message.duration && message.duration > 0) {
      setTimeout(() => {
        removeToast(id)
      }, message.duration)
    }

    return id
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const updateToast = useCallback((id: string, updates: Partial<ToastMessage>) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, ...updates } : t)))
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, updateToast }}>
      {children}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error("useToast must be used within ToastProvider")
  }
  return context
}
