"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      await register({ full_name: fullName, email, password });
      router.push("/login?registered=1");
    } catch (err: unknown) {
      const axiosErr = err as {
        response?: {
          status?: number;
          data?: {
            error?: string;
            detail?: string | Array<{ msg: string } | string>;
          };
        };
        code?: string;
        message?: string;
      };

      if (!axiosErr.response) {
        setError("Cannot reach server. Please check your internet connection.");
      } else {
        const data = axiosErr.response?.data ?? {};
        const detail = data.detail;

        // Build a human-readable message.
        // Priority: backend `error` field → `detail` string → `detail` array → generic
        let message: string;
        if (typeof data.error === "string" && data.error.trim()) {
          message = data.error;
        } else if (typeof detail === "string" && detail.trim()) {
          message = detail;
        } else if (Array.isArray(detail) && detail.length > 0) {
          // Pydantic v2: items are strings like "body.field_name: message"
          message = detail
            .map((d) => {
              if (typeof d === "string") {
                const colonIdx = d.indexOf(": ");
                return colonIdx !== -1 ? d.slice(colonIdx + 2) : d;
              }
              return (d as { msg?: string }).msg ?? String(d);
            })
            .join(" · ");
        } else {
          message = "Registration failed. Please try again.";
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
        <h1 className="text-3xl font-bold text-gold tracking-widest uppercase">DAS ELB</h1>
        <p className="mt-2 text-sm text-muted-foreground">Create your account</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="fullName" className="text-sm font-medium text-foreground">
              Full Name
            </label>
            <Input
              id="fullName"
              name="fullName"
              type="text"
              placeholder="John Doe"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium text-foreground">
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
            <label htmlFor="password" className="text-sm font-medium text-foreground">
              Password
            </label>
            <Input
              id="password"
              name="password"
              type="password"
              placeholder="Create a password (min. 12 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={12}
              required
            />
            <p className="text-xs text-muted-foreground">Must be at least 12 characters.</p>
          </div>
          <div className="space-y-2">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-foreground">
              Confirm Password
            </label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-md px-3 py-2">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Creating account..." : "Create Account"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-gold hover:underline">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
