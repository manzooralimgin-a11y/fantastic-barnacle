"use client";

import { GlobalLoadingBar } from "./GlobalLoadingBar";
import { PageTransition } from "./PageTransition";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <GlobalLoadingBar />
      <PageTransition>{children}</PageTransition>
    </>
  );
}
