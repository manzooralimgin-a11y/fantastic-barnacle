import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { Playfair_Display, DM_Sans, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";

const editorial = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-editorial",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Gestronomy — AI Restaurant Management",
  description: "AI-Powered Restaurant Management System",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={cn(editorial.variable, body.variable, mono.variable)}
    >
      <body className="font-body antialiased">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <Providers>{children}</Providers>

        {/* Grain overlay — fixed, always present */}
        <div className="grain-overlay" aria-hidden="true" />
      </body>
    </html>
  );
}
