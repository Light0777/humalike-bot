import { cn } from "@/lib/utils"
import { InputHTMLAttributes, forwardRef } from "react"

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm text-[#888]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            "h-10 px-3 rounded-md border border-[#ebebeb] bg-white text-sm text-[#171717] placeholder:text-[#888] outline-none transition-colors focus:border-[#a1a1a1]",
            className
          )}
          {...props}
        />
      </div>
    )
  }
)

Input.displayName = "Input"
