import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center rounded-[6px] px-[9px] py-[5px] text-xs font-medium leading-4",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-brand-wash)] text-[var(--color-brand)]",
        secondary: "bg-secondary text-muted-foreground",
        outline: "border text-muted-foreground",
        warning: "bg-[var(--color-warning-wash)] text-[var(--color-warning)]",
        danger: "bg-[var(--color-danger-wash)] text-[var(--color-danger)]",
        success: "bg-[var(--color-success-wash)] text-[var(--color-success)]",
      },
    },
    defaultVariants: { variant: "secondary" },
  },
);
export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}
export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
export { badgeVariants };
