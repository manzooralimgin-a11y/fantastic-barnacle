import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold font-body ring-offset-background transition-all duration-200 ease-editorial focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[#C5A059] text-[#1A2F24] border border-[#C5A059] shadow-sm hover:bg-[#D4B56D] hover:shadow-[0_0_20px_rgba(197,160,89,0.3)] active:bg-[#B8944E] active:scale-[0.98]",
        destructive:
          "bg-[rgba(230,57,70,0.1)] backdrop-blur-[10px] border border-[rgba(230,57,70,0.2)] text-status-danger hover:bg-[rgba(230,57,70,0.18)] hover:border-[rgba(230,57,70,0.3)] active:scale-[0.98]",
        outline:
          "bg-[rgba(255,253,240,0.04)] backdrop-blur-[10px] border border-[rgba(255,253,240,0.08)] text-foreground hover:bg-[rgba(255,253,240,0.08)] hover:border-[rgba(212,175,55,0.15)] active:scale-[0.98]",
        secondary:
          "bg-[rgba(255,253,240,0.04)] backdrop-blur-[10px] border border-[rgba(255,253,240,0.08)] text-foreground shadow-[inset_0_1px_0_rgba(255,253,240,0.04)] hover:bg-[rgba(255,253,240,0.08)] hover:border-[rgba(212,175,55,0.15)] active:scale-[0.98]",
        ghost:
          "text-foreground hover:bg-[rgba(255,253,240,0.05)] active:scale-[0.98]",
        link: "text-gold underline-offset-4 hover:underline",
        glass:
          "glass-card text-foreground hover:border-[rgba(212,175,55,0.18)] active:scale-[0.98]",
        glow:
          "bg-[rgba(212,175,55,0.15)] backdrop-blur-[12px] border border-[rgba(212,175,55,0.3)] text-[#FFFDF0] shadow-[0_0_20px_rgba(212,175,55,0.1)] hover:shadow-[0_0_30px_rgba(212,175,55,0.15)] hover:bg-[rgba(212,175,55,0.22)] active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-12 px-8 text-base",
        xl: "h-14 px-10 text-base font-bold",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
