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
import { loginEmail } from "@/lib/username";
import { checkOfflinePin, rememberPin } from "@/lib/offline-pin";
import { authStorageKey } from "@/lib/offline-session";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Tilla POS" },
      { name: "description", content: "Staff sign in to the Tilla POS till and stock system." },
      { property: "og:title", content: "Sign in — Tilla POS" },
      { property: "og:description", content: "Staff sign in to the Tilla POS till and stock system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "pin">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const pinFn = useServerFn(pinLogin);
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    try { const r = JSON.parse(localStorage.getItem("tilla-recent-users") || "[]"); setRecent(r); if (r[0]) setEmail(r[0]); } catch { /* none */ }
  }, []);
  const remember = (u: string) => {
    const n = u.trim().toLowerCase();
    const list = [n, ...recent.filter((x) => x !== n)].slice(0, 8);
    localStorage.setItem("tilla-recent-users", JSON.stringify(list));
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/pos", replace: true });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "pin" && pin.length < 4) { toast.error("Enter your 4–6 digit PIN"); return; }
    setBusy(true);
    try {
      if (mode === "pin") remember(email);
      if (mode === "pin" && !navigator.onLine) {
        const r = await checkOfflinePin(email, pin);
        if (!r.ok) throw new Error(r.reason);
        // Put this cashier's saved sign-in back, then reload so the whole till picks it up.
        localStorage.setItem(authStorageKey(), r.session);
        window.location.assign("/pos");
        return;
      } else if (mode === "pin") {
        const { tokenHash } = await pinFn({ data: { username: email, pin } });
        const { data: v, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
        if (error || !v.session) throw new Error("Couldn't sign in, try your password");
        void rememberPin(email, pin, v.session.user.id, v.session).catch(() => { /* offline unlock just won't be available */ });
        await supabase.rpc("log_event", { p_action: "pin_login" });
        navigate({ to: "/pos", replace: true });
      } else if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong username or password" : error.message);
        await supabase.rpc("log_event", { p_action: "login" });
        navigate({ to: "/pos", replace: true });
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
        <h1 className="mt-6 text-2xl font-bold">Staff sign in</h1>
        {(
          <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 text-sm font-semibold">
            <Button type="button" variant={mode === "pin" ? "secondary" : "ghost"} onClick={() => setMode("pin")}>Till PIN</Button>
            <Button type="button" variant={mode === "in" ? "secondary" : "ghost"} onClick={() => setMode("in")}>Password</Button>
          </div>
        )}
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "pin" ? "Enter your username and till PIN. Your manager sets your PIN on the Staff page." : "Sign in with your username and password. Forgot it? Ask your manager to reset it."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
          {mode === "pin" ? (
            <div className="space-y-3">
              {recent.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {recent.map((u) => (
                    <Button key={u} type="button" size="sm" variant={email === u ? "default" : "outline"} onClick={() => { setEmail(u); setPin(""); }}>{u}</Button>
                  ))}
                </div>
              )}
              <div className="flex justify-center gap-3 py-2" aria-label={`${pin.length} digits entered`}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className={`h-4 w-4 rounded-full border-2 border-primary ${i < pin.length ? "bg-primary" : ""}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {["1","2","3","4","5","6","7","8","9"].map((d) => (
                  <Button key={d} type="button" variant="outline" className="h-14 text-2xl font-bold" onClick={() => setPin((p) => (p.length < 6 ? p + d : p))}>{d}</Button>
                ))}
                <Button type="button" variant="ghost" className="h-14" onClick={() => setPin("")}>Clear</Button>
                <Button type="button" variant="outline" className="h-14 text-2xl font-bold" onClick={() => setPin((p) => (p.length < 6 ? p + "0" : p))}>0</Button>
                <Button type="button" variant="ghost" className="h-14" aria-label="Delete digit" onClick={() => setPin((p) => p.slice(0, -1))}>⌫</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" autoComplete="current-password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
          )}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>Sign in</Button>
        </form>
        <Button variant="outline" className="mt-3 w-full" onClick={google}>Continue with Google</Button>
        <p className="mt-6 text-center text-sm text-muted-foreground">Staff accounts are created by your store owner.</p>
      </div>
    </div>
  );
}
