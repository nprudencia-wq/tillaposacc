import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupStore } from "@/lib/signup.functions";
import { TRIAL_DAYS } from "@/lib/signup";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Start your free 14-day trial — Tilla POS" },
      { name: "description", content: "Open your own Tilla POS till in minutes. 14 days free, then $10 per till per month." },
      { property: "og:title", content: "Start your free 14-day trial — Tilla POS" },
      { property: "og:description", content: "Launch a till for your Zimbabwean shop: USD, ZiG and Rand, live stock and receipts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const signup = useServerFn(signupStore);
  const [f, setF] = useState({ shopName: "", ownerName: "", phone: "", email: "", password: "", website: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { email } = await signup({ data: f });
      window.__lovableEvents?.track?.("project.trial_signup_completed", { trial_days: TRIAL_DAYS });
      const { error } = await supabase.auth.signInWithPassword({ email, password: f.password });
      if (error) { toast.success("Shop created — please sign in"); navigate({ to: "/auth" }); return; }
      toast.success(`Welcome! Your ${TRIAL_DAYS}-day trial has started.`);
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign-up failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-xl font-bold">Tilla<span className="text-sidebar-primary">POS</span></Link>
        <Button asChild variant="secondary"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto grid max-w-5xl gap-10 px-6 pb-20 pt-6 md:grid-cols-2">
        <section>
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-sidebar-primary">{TRIAL_DAYS} days free</p>
          <h1 className="text-4xl font-bold leading-tight md:text-5xl">Launch your own till today.</h1>
          <p className="mt-4 opacity-75">Your shop gets its own private till and Back Office — your sales, stock and staff are never shared with any other shop.</p>
          <ul className="mt-6 space-y-2 text-sm opacity-90">
            <li>✓ Starter products ready to sell: Bread, Milk, Cooking Oil</li>
            <li>✓ USD, ZiG and Rand with change</li>
            <li>✓ Works offline, syncs when internet returns</li>
            <li>✓ After the trial: $10 per till per month</li>
          </ul>
        </section>
        <form onSubmit={submit} className="space-y-4 rounded-2xl border border-sidebar-border bg-card p-6 text-card-foreground">
          <h2 className="text-xl font-semibold">Create your shop</h2>
          <div className="space-y-1.5"><Label htmlFor="shop">Shop name</Label><Input id="shop" required maxLength={80} value={f.shopName} onChange={set("shopName")} /></div>
          <div className="space-y-1.5"><Label htmlFor="owner">Your name</Label><Input id="owner" required maxLength={80} value={f.ownerName} onChange={set("ownerName")} /></div>
          <div className="space-y-1.5"><Label htmlFor="phone">Phone / WhatsApp</Label><Input id="phone" type="tel" required placeholder="0771 234 567" value={f.phone} onChange={set("phone")} /></div>
          <div className="space-y-1.5"><Label htmlFor="email">Email (used to sign in)</Label><Input id="email" type="email" required autoComplete="email" value={f.email} onChange={set("email")} /></div>
          <div className="space-y-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={8} autoComplete="new-password" value={f.password} onChange={set("password")} /></div>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" value={f.website} onChange={set("website")} aria-hidden />
          <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "Creating your shop…" : `Start ${TRIAL_DAYS}-day free trial`}</Button>
          <p className="text-center text-xs text-muted-foreground">Already have a shop? <Link to="/auth" className="underline">Sign in</Link></p>
        </form>
      </main>
    </div>
  );
}
