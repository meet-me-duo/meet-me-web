import type { ComponentProps } from "react";

// Native-button port of shadcn/ui's variants; no Slot or Tailwind reset needed.
export function Button({ className = "", variant = "primary", type = "button", ...props }: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger-outline";
}) {
  return <button data-slot="button" type={type} className={`button ${variant} ${className}`} {...props} />;
}
