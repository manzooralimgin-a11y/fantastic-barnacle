"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { ErrorBoundary } from "@/components/error-boundary";

export function Providers({ children }: { children: React.ReactNode }) {
  // Clear any stale dev-time API URL override that takes priority over NEXT_PUBLIC_API_URL
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("gestronomy_api_url");
    }
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </QueryClientProvider>
    </NextThemesProvider>
  );
}
