import { cn } from "@/lib/utils"
import { HTMLAttributes, forwardRef } from "react"

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "soft" | "elevated"
}

const variantStyles = {
  default: "bg-white border border-[#ebebeb]",
  soft: "bg-[#fafafa]",
  elevated:
    "bg-white border border-[#ebebeb] shadow-[0px_1px_1px_#00000005,0px_2px_2px_#0000000a]",
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("rounded-lg p-6", variantStyles[variant], className)}
        {...props}
      />
    )
  }
)

Card.displayName = "Card"
