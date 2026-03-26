"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getMe, login } from "@/lib/auth";
import { normalizeDomain } from "@/lib/domain-config";
import { useAuthStore } from "@/stores/auth-store";
import { getDefaultDashboardRoute } from "@/lib/role-routing";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const setActiveSection = useAuthStore((s) => s.setActiveSection);
  const activeSection = useAuthStore((s) => s.activeSection);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const tokenResponse = await login({ email, password });
      useAuthStore.getState().setToken(tokenResponse.access_token);
      const user = await getMe();
      useAuthStore.getState().setUser(user);
      router.push(getDefaultDashboardRoute(user.role, normalizeDomain(activeSection)));
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string | Array<{ msg: string }> }; status?: number }; code?: string };
      if (!axiosErr.response) {
        // Network error — API unreachable
        setError("Cannot reach server. Please check your internet connection or try again later.");
      } else {
        const detail = axiosErr.response?.data?.detail;
        let message = "Invalid email or password";
        if (typeof detail === "string") {
          message = detail;
        } else if (Array.isArray(detail) && detail.length > 0) {
          message = detail.map((d) => d.msg).join(", ");
        }
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <div className="flex justify-center mb-4">
          <img src="/das-elb-logo.png" alt="DAS ELB Logo" className="h-[72px] w-auto object-contain" />
        </div>
        <h1 className="text-3xl font-bold text-primary text-glow tracking-widest uppercase mb-2">DAS ELB</h1>
        <div className="flex p-1 bg-muted/50 rounded-lg max-w-[280px] mx-auto mb-6 border border-white/5">
          <button
            type="button"
            onClick={() => setActiveSection("gestronomy")}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-300",
              activeSection === "gestronomy"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Gestronomy
          </button>
          <button
            type="button"
            onClick={() => setActiveSection("management")}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-300",
              activeSection === "management"
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Management
          </button>
        </div>
        <p className="text-sm text-muted-foreground">Sign in to {activeSection === "gestronomy" ? "Restaurant System" : "Hotel Management"}</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground/80">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-foreground/80">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-medium text-gold hover:underline">
            Register
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
