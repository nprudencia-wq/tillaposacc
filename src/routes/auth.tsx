import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerFn } from "@tanstack/react-start";
import { pinLogin } from "@/lib/pin.functions";
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
  const [mode, setMode] = useState<"in" | "up" | "pin">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const pinFn = useServerFn(pinLogin);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/pos", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "pin") {
        const { tokenHash } = await pinFn({ data: { username: email, pin } });
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
        if (error) throw new Error("Couldn't sign in, try your password");
        await supabase.rpc("log_event", { p_action: "pin_login" });
        navigate({ to: "/pos", replace: true });
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong username or password" : error.message);
        await supabase.rpc("log_event", { p_action: "login" });
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
        <h1 className="mt-6 text-2xl font-bold">{mode === "up" ? "Create staff account" : "Staff sign in"}</h1>
        {mode !== "up" && (
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
            <button type="button" onClick={() => setMode("pin")} className={`rounded-md py-1.5 ${mode === "pin" ? "bg-card shadow-soft" : "text-muted-foreground"}`}>Till PIN</button>
            <button type="button" onClick={() => setMode("in")} className={`rounded-md py-1.5 ${mode === "in" ? "bg-card shadow-soft" : "text-muted-foreground"}`}>Password</button>
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "pin" ? "Enter your username and till PIN. Your manager sets your PIN on the Staff page." : mode === "in" ? "Sign in with your username and password. Forgot it? Ask your manager to reset it." : "The first account becomes the Business Owner. Others start as Cashiers."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {mode === "up" && (
            <div className="space-y-1.5"><Label>Full name</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          )}
          <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {mode === "pin" ? (
            <div className="space-y-1.5"><Label htmlFor="pin">PIN</Label><Input id="pin" type="password" inputMode="numeric" pattern="[0-9]{4,6}" maxLength={6} autoComplete="off" className="text-center text-2xl tracking-[0.5em]" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} required /></div>
          ) : (
            <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" autoComplete={mode === "in" ? "current-password" : "new-password"} type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>{mode === "up" ? "Create account" : "Sign in"}</Button>
        </form>
        <Button variant="outline" className="mt-3 w-full" onClick={google}>Continue with Google</Button>
        <button className="mt-6 w-full text-center text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "up" ? "pin" : "up")}>
          {mode !== "up" ? "New staff member? Create an account" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
