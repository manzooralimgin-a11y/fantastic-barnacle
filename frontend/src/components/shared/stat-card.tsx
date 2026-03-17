import { ArrowDown, ArrowUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  target?: string;
  icon?: LucideIcon;
  className?: string;
  featured?: boolean;
}

export function StatCard({ title, value, change, target, icon: Icon, className, featured }: StatCardProps) {
  const isPositive = change !== undefined && change >= 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <div className={cn(
      featured ? "glass-card-featured" : "glass-card",
      "p-5 group",
      className
    )}>
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-body font-semibold text-foreground-dim tracking-[0.12em] uppercase">
            {title}
          </p>
          <p className={cn(
            "font-editorial font-normal tracking-tight",
            featured ? "text-3xl text-gold" : "text-2xl text-foreground"
          )}>
            {value}
          </p>
        </div>
        {Icon && (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(212,175,55,0.06)] border border-[rgba(212,175,55,0.1)] transition-all duration-200 group-hover:border-[rgba(212,175,55,0.18)]">
            <Icon className="h-4 w-4 text-gold-dim" />
          </div>
        )}
      </div>

      {(change !== undefined || target) && (
        <div className="mt-3 flex items-center gap-2.5">
          {change !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-body font-semibold backdrop-blur-[6px]",
                isPositive && "bg-[rgba(82,183,136,0.08)] border border-[rgba(82,183,136,0.12)] text-status-success",
                isNegative && "bg-[rgba(230,57,70,0.08)] border border-[rgba(230,57,70,0.12)] text-status-danger"
              )}
            >
              {isPositive ? (
                <ArrowUp className="h-3 w-3" />
              ) : (
                <ArrowDown className="h-3 w-3" />
              )}
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {target && (
            <span className="text-[10px] font-body text-foreground-dim">
              Target: {target}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
