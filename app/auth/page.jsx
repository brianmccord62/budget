"use client";

import { useMemo, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabaseClient";
import { Wallet } from "lucide-react";

export default function AuthPage() {
  const supabase = useMemo(() => getBrowserSupabase(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("sign-in");
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    const action =
      mode === "sign-up"
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });

    const { error } = await action;

    if (error) {
      setMessage(error.message);
      return;
    }

    if (mode === "sign-up") {
      setMessage("Account created. Check your email if confirmation is required, then sign in.");
      setMode("sign-in");
    } else {
      window.location.href = "/";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-2xl bg-slate-950 p-3 text-white">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Financial Advisor</h1>
            <p className="text-sm text-slate-500">{mode === "sign-up" ? "Create your account." : "Sign in to your account."}</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="space-y-1.5 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Email</span>
            <input
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-slate-950/10"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
            />
          </label>

          <label className="space-y-1.5 block">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Password</span>
            <input
              className="w-full rounded-2xl border border-slate-200 px-3 py-2.5 outline-none focus:ring-4 focus:ring-slate-950/10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              minLength={6}
              required
            />
          </label>

          {message && <p className="rounded-2xl bg-slate-100 p-3 text-sm text-slate-700">{message}</p>}

          <button className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-bold text-white hover:bg-slate-800">
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
          className="mt-4 w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-slate-200"
        >
          {mode === "sign-up" ? "Already have an account? Sign in" : "Need an account? Sign up"}
        </button>
      </div>
    </main>
  );
}
