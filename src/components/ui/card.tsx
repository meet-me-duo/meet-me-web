import type { ComponentProps } from "react";

// Adapted from shadcn/ui Card (MIT); styles live in the existing global CSS.
export function Card({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card" className={`ui-card ${className}`} {...props} />;
}

export function CardHeader({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card-header" className={`ui-card-header ${className}`} {...props} />;
}

export function CardContent({ className = "", ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={`ui-card-content ${className}`} {...props} />;
}
