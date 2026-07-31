"use client";

import { FormEvent, useState } from "react";
import { KeyRoundIcon, Loader2Icon, ShieldCheckIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.ok) {
        router.push("/admin");
        router.refresh();
      } else {
        setError(data.message || "Login failed");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      {/* Background Effects */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-primary/20 blur-[120px]" />
        <div className="absolute -bottom-32 -right-32 h-80 w-80 rounded-full bg-info/15 blur-[100px]" />
        <div className="absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Glass Card */}
        <div className="rounded-3xl border border-border/50 bg-card/80 p-8 shadow-2xl shadow-primary/5 backdrop-blur-xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
              <ShieldCheckIcon className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your credentials to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                required
                autoComplete="username"
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background/80 focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                required
                autoComplete="current-password"
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background/80 focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <KeyRoundIcon className="h-4 w-4" />
                  Sign In
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          GPT UPI Hub &mdash; Admin Panel
        </p>
      </div>
    </div>
  );
}
