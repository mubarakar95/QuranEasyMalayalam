"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuth: (user: { id: string; email: string }) => void;
}

export default function AuthModal({ open, onClose, onAuth }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!open) return null;

  const supabase = createClient();

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "magic") {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else setMessage("Check your email for the login link!");
    } else if (mode === "signin") {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) setError(error.message);
      else if (data.user) {
        onAuth({ id: data.user.id, email: data.user.email || "" });
        onClose();
      }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });
      if (error) setError(error.message);
      else if (data.user) {
        if (data.user.identities?.length === 0) {
          setError("An account with this email already exists.");
        } else {
          setMessage("Account created! Check your email to confirm.");
        }
      }
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold mb-4 text-[var(--foreground)]">
          {mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Magic Link"}
        </h2>

        <form onSubmit={handleEmailAuth} className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
          />
          {mode !== "magic" && (
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--accent)]"
            />
          )}

          {error && <p className="text-red-500 text-xs">{error}</p>}
          {message && <p className="text-green-500 text-xs">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium disabled:opacity-50"
          >
            {loading
              ? "Loading..."
              : mode === "signin"
                ? "Sign In"
                : mode === "signup"
                  ? "Sign Up"
                  : "Send Magic Link"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs space-y-1">
          {mode !== "signin" && (
            <button
              onClick={() => { setMode("signin"); setError(""); setMessage(""); }}
              className="text-[var(--accent)] hover:underline"
            >
              Already have an account? Sign In
            </button>
          )}
          {mode !== "signup" && (
            <button
              onClick={() => { setMode("signup"); setError(""); setMessage(""); }}
              className="text-[var(--accent)] hover:underline"
            >
              Create account
            </button>
          )}
          {mode !== "magic" && (
            <button
              onClick={() => { setMode("magic"); setError(""); setMessage(""); }}
              className="text-[var(--accent)] hover:underline"
            >
              Use Magic Link instead
            </button>
          )}
        </div>

        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[var(--muted)] hover:text-[var(--foreground)] text-lg"
        >
          ×
        </button>
      </div>
    </div>
  );
}
