"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getMe, login } from "@/lib/auth";
import { useAuthStore } from "@/stores/auth-store";
import { getDefaultDashboardRoute } from "@/lib/role-routing";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
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
      setToken(tokenResponse.access_token);
      const user = await getMe();
      setUser(user);
      router.push(getDefaultDashboardRoute(user.role));
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
        <h1 className="text-3xl font-bold text-primary text-glow tracking-widest uppercase">DAS ELB</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to your account</p>
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
          <Link href="/register" className="font-medium text-brand-500 hover:underline">
            Register
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
