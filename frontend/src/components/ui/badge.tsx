import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wider backdrop-blur-[8px] transition-colors duration-200 ease-editorial focus:outline-none focus:ring-2 focus:ring-gold/30 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--color-brand-gold)] opacity-10 text-[var(--color-brand-green)]",
        secondary:
          "bg-foreground/5 border-foreground/10 text-foreground-muted",
        destructive:
          "bg-red-500/10 border-red-500/20 text-red-500",
        outline:
          "bg-transparent border-foreground/10 text-foreground",
        success:
          "bg-emerald-500/10 border-emerald-500/20 text-emerald-600",
        warning:
          "bg-[var(--color-brand-gold)]/10 border-[var(--color-brand-gold)]/20 text-[var(--color-brand-gold)]",
        info:
          "bg-blue-500/10 border-blue-500/20 text-blue-600",
        glass:
          "bg-white/5 backdrop-blur-md border-white/10 text-foreground shadow-none",
      },

    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
