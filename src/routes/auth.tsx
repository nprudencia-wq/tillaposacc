import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isValidUsername, loginEmail, normalizeUsername } from "@/lib/username";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Tilla POS" },
      { name: "description", content: "Staff sign in to the Tilla POS till and stock system." },
      { property: "og:title", content: "Sign in — Tilla POS" },
      { property: "og:description", content: "Staff sign in to the Tilla POS till and stock system." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/pos", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong username or password" : error.message);
        navigate({ to: "/pos", replace: true });
      } else {
        if (!isValidUsername(email)) throw new Error("Username must be 3–30 letters, numbers, dots, dashes or underscores");
        const username = normalizeUsername(email);
        const { data, error } = await supabase.auth.signUp({
          email: loginEmail(username), password,
          options: { emailRedirectTo: window.location.origin + "/auth", data: { full_name: name, username } },
        });
        if (error) throw new Error(/already|database error/i.test(error.message) ? "That username is taken" : error.message);
        if (data.session) navigate({ to: "/pos", replace: true });
        else toast.success("Check your email to confirm your account.");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
    else if (!r.redirected) navigate({ to: "/pos", replace: true });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-2xl bg-card p-8 shadow-soft">
        <Link to="/" className="font-display text-xl font-bold">Tilla<span className="text-primary">POS</span></Link>
        <h1 className="mt-6 text-2xl font-bold">{mode === "in" ? "Staff sign in" : "Create staff account"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "in" ? "Sign in with your username and password. Forgot it? Ask your manager to reset it." : "The first account becomes the Business Owner. Others start as Cashiers."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "up" && (
            <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" autoComplete={mode === "in" ? "current-password" : "new-password"} type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          <Button type="submit" className="w-full" size="lg" disabled={busy}>{mode === "in" ? "Sign in" : "Create account"}</Button>
        </form>
        <Button variant="outline" className="mt-3 w-full" onClick={google}>Continue with Google</Button>
        <button className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "in" ? "up" : "in")}>
          {mode === "in" ? "New staff member? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
