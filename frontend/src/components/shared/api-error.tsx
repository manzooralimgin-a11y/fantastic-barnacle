import { AlertTriangle, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface ApiErrorProps {
  message?: string;
  onRetry?: () => void;
  className?: string;
  dismissible?: boolean;
}

export function ApiError({
  message = "Failed to load data. Please try again.",
  onRetry,
  className,
  dismissible = true,
}: ApiErrorProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-4 rounded-xl bg-status-danger/5 border border-status-danger/20 text-sm",
        className
      )}
    >
      <AlertTriangle className="w-4 h-4 text-status-danger flex-shrink-0 mt-0.5" />
      <p className="text-foreground-muted flex-1">{message}</p>
      <div className="flex items-center gap-2 flex-shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
        {dismissible && (
          <button
            onClick={() => setDismissed(true)}
            className="text-foreground-dim hover:text-foreground-muted transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
