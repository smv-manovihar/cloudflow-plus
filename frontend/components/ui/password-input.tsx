"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export type PasswordInputProps = React.ComponentProps<"input">

function PasswordInput({ className, disabled, ...props }: PasswordInputProps) {
  const [showPassword, setShowPassword] = React.useState(false)

  return (
    <div className="relative w-full">
      <Input
        type={showPassword ? "text" : "password"}
        className={cn("pr-10", className)}
        disabled={disabled}
        {...props}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-0 top-0 h-full w-9 px-0 bg-transparent hover:bg-transparent text-muted-foreground/60 hover:text-foreground transition-colors duration-150 focus-visible:ring-0 focus-visible:ring-offset-0 disabled:opacity-40"
            onClick={() => setShowPassword((prev) => !prev)}
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4 transition-transform duration-150 active:scale-95" aria-hidden="true" />
            ) : (
              <Eye className="h-4 w-4 transition-transform duration-150 active:scale-95" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          <p>{showPassword ? "Hide password" : "Show password"}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

export { PasswordInput }
