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
import { hasDeviceLogin, rememberDeviceSession, restoreDeviceSession } from "@/lib/offline-session";
import { fetchStaff, fetchSettings } from "@/hooks/use-staff";
import type { Session } from "@supabase/supabase-js";
import { isNetworkError } from "@/lib/offline";
import { internetAvailable, setInternetAvailable } from "@/lib/connectivity";
import { useQueryClient } from "@tanstack/react-query";
import { getShopLabel } from "@/lib/till-pairing";
import { getDeviceName } from "@/lib/device-name";

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
  component: () => <AuthPage />,
});

export function AuthPage({ tillOnly = false }: { tillOnly?: boolean } = {}) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "pin">("pin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [activation, setActivation] = useState<Session | null>(null);
  const pinFn = useServerFn(pinLogin);
  const qc = useQueryClient();
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
    void hasDeviceLogin().then((signedIn) => {
      if (signedIn) navigate({ to: "/pos", replace: true });
    });
  }, [navigate]);

  async function prepareSession(session: Session, verifiedPin?: string) {
    rememberDeviceSession(session);
    await qc.cancelQueries();
    qc.clear();
    const me = await qc.fetchQuery({ queryKey: ["me"], queryFn: fetchStaff });
    await qc.fetchQuery({ queryKey: ["settings"], queryFn: fetchSettings });
    if (verifiedPin) {
      await rememberPin(me?.username || email, verifiedPin, session.user.id, session,
        [me?.username || "", me?.name || "", session.user.email || ""]);
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!email.trim()) { toast.error("Choose or type your username"); setPin(""); return; }
    if (mode === "pin" && pin.length < 4) { toast.error("Enter your 4-digit PIN"); return; }
    setBusy(true);
    try {
      if (mode === "pin") remember(email);
      const offlineUnlock = async () => {
        const r = await checkOfflinePin(email, pin);
        if (!r.ok) throw new Error(r.reason);
        // Put this cashier's saved sign-in back and open the till without reloading the page.
        restoreDeviceSession(r.session);
        // Tell the till the internet is down so every check uses this device's saved copies.
        setInternetAvailable(false);
        await qc.cancelQueries();
        qc.clear();
        navigate({ to: "/pos", replace: true });
      };
      if (mode === "pin" && (!navigator.onLine || !internetAvailable())) {
        await offlineUnlock();
        return;
      } else if (mode === "pin") {
        let tokenHash: string;
        try {
          ({ tokenHash } = await Promise.race([
            pinFn({ data: { username: email, pin } }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Failed to fetch")), 8000)),
          ]));
        } catch (err) {
          // Wi-Fi with no internet still reports "online": fall back to this till's saved PIN.
          if (isNetworkError(err)) { await offlineUnlock(); return; }
          throw err;
        }
        const { data: v, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
        if (error || !v.session) throw new Error("Couldn't sign in, try your password");
        if (activation && v.session.user.id !== activation.user.id) throw new Error("Use the PIN for the account you just signed in with.");
        await prepareSession(v.session, pin);
        void supabase.rpc("log_event", { p_action: "pin_login" });
        navigate({ to: "/pos", replace: true });
      } else if (mode === "in") {
        const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail(email), password });
        if (error) throw new Error(/invalid/i.test(error.message) ? "Wrong username or password" : error.message);
        if (!data.session) throw new Error("Couldn't save your sign-in. Try again.");
        await prepareSession(data.session);
        void supabase.rpc("log_event", { p_action: "login" });
        setActivation(data.session);
        setEmail(data.session.user.email || email);
        setMode("pin");
        setPin("");
      }
    } catch (err) {
      toast.error((err as Error).message);
      if (mode === "pin") setPin("");
    } finally {
      setBusy(false);
    }
  }

  const [online, setOnline] = useState(true);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine && internetAvailable());
    u();
    window.addEventListener("online", u); window.addEventListener("offline", u);
    const t = setInterval(u, 3000);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); clearInterval(t); };
  }, []);
  useEffect(() => {
    if (mode === "pin" && pin.length === 4 && !busy) void submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);
  const initials = (u: string) => u.replace(/@.*/, "").split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join("").toUpperCase() || "?";
  const press = (d: string) => setPin((p) => (p.length < 4 ? p + d : p));

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
    else if (!r.redirected) {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await prepareSession(data.session);
        setActivation(data.session);
        setEmail(data.session.user.email || "");
        setMode("pin");
      }
    }
  }

  const [label, setLabel] = useState({ shop: "", till: "" });
  useEffect(() => {
    const t = setTimeout(() => setLabel({ shop: getShopLabel(), till: getDeviceName() }), 0);
    return () => clearTimeout(t);
  }, []);
  const showPicker = picking || !email;
  return (
    <div className="flex min-h-screen flex-col bg-sidebar text-sidebar-foreground">
      <header className="flex items-center justify-between px-5 py-4">
        <Link to="/" className="font-display text-xl font-bold">Tilla<span className="text-sidebar-primary">POS</span> <span className="text-sm font-normal opacity-70">· {[label.shop, label.till || "Main Till"].filter(Boolean).join(" · ")}</span></Link>
        <span className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${online ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>
          <span className={`h-2 w-2 rounded-full ${online ? "bg-primary" : "bg-destructive"}`} />{online ? "Online" : "Offline — till still works"}
        </span>
      </header>
      <main className="grid flex-1 place-items-center px-4 pb-8">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-card-foreground shadow-soft">
          {mode === "pin" ? (
            <form onSubmit={submit} className="space-y-4">
              {activation && <p className="text-center text-sm font-semibold">Enable offline PIN on this device</p>}
              {showPicker ? (
                <div className="space-y-3">
                  <p className="text-center text-sm font-semibold">Who is signing in?</p>
                  {recent.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {recent.map((u) => (
                        <button key={u} type="button" onClick={() => { setEmail(u); setPin(""); setPicking(false); }} className="flex flex-col items-center gap-1 rounded-xl p-2 hover:bg-muted">
                          <span className="grid h-12 w-12 place-items-center rounded-full bg-primary text-base font-bold text-primary-foreground">{initials(u)}</span>
                          <span className="w-full truncate text-xs">{u}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="space-y-1.5"><Label htmlFor="username">Or type username</Label>
                    <div className="flex gap-2"><Input id="username" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} />
                      <Button type="button" onClick={() => email.trim() && setPicking(false)}>OK</Button></div></div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1">
                  <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-xl font-bold text-primary-foreground">{initials(email)}</span>
                  <p className="font-semibold">{email}</p>
                  <button type="button" className="text-xs text-primary underline" onClick={() => { setPicking(true); setPin(""); }}>Tap to switch cashier</button>
                </div>
              )}
              {!showPicker && (
                <>
                  <div className="flex justify-center gap-4 py-1" aria-label={`${pin.length} digits entered`}>
                    {Array.from({ length: 4 }).map((_, i) => (
                      <span key={i} className={`h-4 w-4 rounded-full border-2 border-primary ${i < pin.length ? "bg-primary" : ""}`} />
                    ))}
                  </div>
                  <p className="text-center text-xs text-muted-foreground">{busy ? "Checking…" : "Enter your 4-digit PIN"}</p>
                  <div className="grid grid-cols-3 gap-2">
                    {["1","2","3","4","5","6","7","8","9"].map((d) => (
                      <Button key={d} type="button" variant="outline" disabled={busy} className="h-16 text-2xl font-bold" onClick={() => press(d)}>{d}</Button>
                    ))}
                    <Button type="button" variant="ghost" className="h-16" onClick={() => setPin("")}>C</Button>
                    <Button type="button" variant="outline" disabled={busy} className="h-16 text-2xl font-bold" onClick={() => press("0")}>0</Button>
                    <Button type="button" variant="ghost" className="h-16 text-xl" aria-label="Delete digit" onClick={() => setPin((p) => p.slice(0, -1))}>⌫</Button>
                  </div>
                </>
              )}
              {activation && <Button type="button" variant="ghost" className="w-full" onClick={() => navigate({ to: "/pos", replace: true })}>Not now — Open till</Button>}
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <h1 className="text-xl font-bold">Manager / Back Office</h1>
              <p className="text-sm text-muted-foreground">Sign in with your username and password. Forgot it? Ask your manager to reset it.</p>
              <div className="space-y-1.5"><Label htmlFor="username">Username</Label><Input id="username" autoComplete="username" autoCapitalize="none" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
              <div className="space-y-1.5"><Label htmlFor="password">Password</Label><Input id="password" autoComplete="current-password" type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required /></div>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>Sign in</Button>
              <Button type="button" variant="outline" className="w-full" onClick={google}>Continue with Google</Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("pin")}>Back to till PIN</Button>
            </form>
          )}
        </div>
        {mode === "pin" && !activation && !tillOnly && (
          <button type="button" onClick={() => setMode("in")} className="mt-6 text-sm underline opacity-80">Manager / Back Office login</button>
        )}
        <p className="mt-3 text-xs opacity-60">Staff accounts are created by your store owner.</p>
      </main>
    </div>
  );
}
