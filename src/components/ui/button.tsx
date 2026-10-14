import { type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
// shadcn-style owned primitive: native semantics, shared variants, no runtime theme dependency.
export function Button({ className, variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return <button className={cn("button", `button-${variant}`, className)} {...props} />;
}
