import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeConfig = {
  sm: { wrap: "py-8", icon: "w-10 h-10", iconBox: "w-12 h-12 rounded-xl", title: "text-base", desc: "text-xs" },
  md: { wrap: "py-12", icon: "w-12 h-12", iconBox: "w-16 h-16 rounded-2xl", title: "text-lg", desc: "text-sm" },
  lg: { wrap: "py-20", icon: "w-14 h-14", iconBox: "w-20 h-20 rounded-3xl", title: "text-xl", desc: "text-sm" },
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  size = "md",
}: EmptyStateProps) {
  const s = sizeConfig[size];

  return (
    <div className={cn("flex flex-col items-center justify-center text-center", s.wrap, className)}>
      {Icon && (
        <div className={cn("flex items-center justify-center bg-foreground/5 text-foreground-muted mb-4", s.iconBox)}>
          <Icon className={cn("opacity-40", s.icon)} />
        </div>
      )}

      <h3 className={cn("font-semibold text-foreground mb-1", s.title)}>{title}</h3>

      {description && (
        <p className={cn("text-foreground-muted max-w-xs leading-relaxed mb-5", s.desc)}>
          {description}
        </p>
      )}

      {action && (
        <button
          onClick={action.onClick}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors text-sm font-semibold"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
