"use client";

import { FormEvent, useState } from "react";
import { KeyRoundIcon, Loader2Icon, UserCircleIcon, UserPlusIcon } from "lucide-react";
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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10">
            <UserCircleIcon className="h-8 w-8 text-orange-500" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {mode === "login" ? "Login" : "Create Account"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "login"
              ? "Login to access UPI extraction and wallet"
              : "Create a new account to get started"}
          </p>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6 flex rounded-lg border border-border bg-muted/50 p-1">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "login" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => { setMode("register"); setError(""); }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
              mode === "register" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Register
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={mode === "register" ? "Choose a username (a-z, 0-9, _)" : "Enter username"}
              required
              autoComplete="username"
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
            {mode === "register" && (
              <p className="mt-1 text-xs text-muted-foreground">3-30 characters, lowercase letters, numbers, underscores</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "register" ? "Choose a password (min 6 chars)" : "Enter password"}
              required
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
            />
          </div>

          {mode === "register" && (
            <div>
              <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
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
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
              />
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password || (mode === "register" && !confirmPassword)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2Icon className="h-4 w-4 animate-spin" />
                {mode === "login" ? "Logging in..." : "Creating account..."}
              </>
            ) : mode === "login" ? (
              <>
                <KeyRoundIcon className="h-4 w-4" />
                Login
              </>
            ) : (
              <>
                <UserPlusIcon className="h-4 w-4" />
                Create Account
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          GPT UPI Hub &mdash; QR Code Extractor
        </p>
      </div>
    </div>
  );
}
