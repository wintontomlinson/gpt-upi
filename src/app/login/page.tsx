"use client";

import { FormEvent, useState } from "react";
import { KeyRoundIcon, Loader2Icon, SparklesIcon, UserPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";

export default function PublicUserLoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "register" && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);

    try {
      const url = mode === "login" ? "/api/user/login" : "/api/user/register";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(data.message || "Request failed");
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
        <div className="absolute -left-48 top-0 h-[500px] w-[500px] rounded-full bg-primary/15 blur-[140px]" />
        <div className="absolute -right-32 bottom-0 h-96 w-96 rounded-full bg-success/10 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full bg-info/10 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Glass Card */}
        <div className="rounded-3xl border border-border/50 bg-card/80 p-8 shadow-2xl shadow-primary/5 backdrop-blur-xl">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-success/10 ring-1 ring-primary/20">
              <SparklesIcon className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">
              {mode === "login" ? "Welcome Back" : "Get Started"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {mode === "login"
                ? "Sign in to access your account"
                : "Create an account to start extracting"}
            </p>
          </div>

          {/* Mode Toggle */}
          <div className="mb-6 flex rounded-xl border border-border bg-background/50 p-1">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                mode === "login" 
                  ? "bg-primary/15 text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                mode === "register" 
                  ? "bg-primary/15 text-primary shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Register
            </button>
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
                placeholder={mode === "register" ? "Choose a username" : "Enter username"}
                required
                autoComplete="username"
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background/80 focus:ring-2 focus:ring-primary/20"
              />
              {mode === "register" && (
                <p className="mt-1.5 text-[11px] text-muted-foreground/70">Lowercase letters, numbers, underscores (3-30 chars)</p>
              )}
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
                placeholder={mode === "register" ? "Min 6 characters" : "Enter password"}
                required
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className="w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background/80 focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {mode === "register" && (
              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your password"
                  required
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-border bg-background/50 px-4 py-3 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-primary/50 focus:bg-background/80 focus:ring-2 focus:ring-primary/20"
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username || !password || (mode === "register" && !confirmPassword)}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-primary to-primary/80 px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:shadow-xl hover:shadow-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                  {mode === "login" ? "Signing in..." : "Creating account..."}
                </>
              ) : mode === "login" ? (
                <>
                  <KeyRoundIcon className="h-4 w-4" />
                  Sign In
                </>
              ) : (
                <>
                  <UserPlusIcon className="h-4 w-4" />
                  Create Account
                </>
              )}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground/60">
          GPT UPI Hub &mdash; QR Code Extractor
        </p>
      </div>
    </div>
  );
}
