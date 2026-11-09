import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, useStaff } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { pairingLink, tillNames } from "@/lib/till-pairing";
import { daysBetween, todayStr } from "@/lib/subscription";
import { Store, MonitorSmartphone, KeyRound, CreditCard, LayoutDashboard, ScanBarcode } from "lucide-react";

export const Route = createFileRoute("/portal")({
  head: () => ({
    meta: [
      { title: "Shop owner portal — Tilla POS" },
      { name: "description", content: "Open your shop's till, set up each till device, manage cashier PINs and your subscription." },
      { property: "og:title", content: "Shop owner portal — Tilla POS" },
      { property: "og:description", content: "One place for shop owners to launch and manage their Tilla POS tills." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PortalPage,
});

function PortalPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
  }, []);
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Link to="/" className="font-display text-xl font-bold">Tilla<span className="text-sidebar-primary">POS</span> <span className="text-sm font-normal opacity-70">· Owner portal</span></Link>
        {signedIn ? <Button asChild variant="secondary"><Link to="/dashboard">Back Office</Link></Button>
          : <Button asChild variant="secondary"><Link to="/auth">Sign in</Link></Button>}
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        {signedIn === null ? <p className="opacity-70">Loading…</p> : signedIn ? <OwnerHub /> : <Gateway />}
      </main>
    </div>
  );
}

function Gateway() {
  const cards = [
    { icon: Store, t: "Start a new shop", d: "14 days free, then $10 per till per month.", to: "/signup" as const, cta: "Start free trial" },
    { icon: KeyRound, t: "Owner sign in", d: "Manage stock, staff, tills and billing.", to: "/auth" as const, cta: "Sign in" },
    { icon: ScanBarcode, t: "Cashier till", d: "PIN sign-in on the counter device.", to: "/till" as const, cta: "Open till" },
  ];
  return (
    <>
      <h1 className="mt-6 max-w-3xl text-4xl font-bold md:text-5xl">Your shop, your tills — all in one place.</h1>
      <p className="mt-4 max-w-xl opacity-75">Every shop is private. Your sales, stock and staff are never shared with another shop.</p>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        {cards.map((c) => (
          <div key={c.t} className="flex flex-col rounded-2xl border border-sidebar-border bg-sidebar-accent p-6">
            <c.icon className="mb-4 h-7 w-7 text-sidebar-primary" />
            <h2 className="text-lg font-semibold">{c.t}</h2>
            <p className="mt-1 flex-1 text-sm opacity-70">{c.d}</p>
            <Button asChild className="mt-5"><Link to={c.to}>{c.cta}</Link></Button>
          </div>
        ))}
      </div>
    </>
  );
}

function OwnerHub() {
  const { data: me } = useStaff();
  const { data: st } = useSettings();
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  if (!me || !st) return <p className="opacity-70">Loading your shop…</p>;
  const s = st as unknown as { business_name: string; paid_until: string; till_count: number; billing_exempt: boolean };
  const left = daysBetween(todayStr(), s.paid_until);
  const status = s.billing_exempt ? "Free — vendor shop" : left >= 0 ? `Active · ${left} day${left === 1 ? "" : "s"} left` : "Locked — payment due";
  const tills = tillNames(s.till_count);
  const links = [
    { icon: LayoutDashboard, t: "Back Office", to: "/dashboard" as const },
    { icon: ScanBarcode, t: "Open till here", to: "/pos" as const },
    { icon: KeyRound, t: "Staff & PINs", to: "/staff" as const },
    { icon: MonitorSmartphone, t: "Compare tills", to: "/multi-till" as const },
    { icon: CreditCard, t: "Billing", to: "/billing" as const },
    { icon: Store, t: "Store profile", to: "/store" as const },
  ];
  return (
    <div className="space-y-8">
      <section className="rounded-2xl bg-card p-6 text-card-foreground">
        <p className="text-sm text-muted-foreground">Welcome, {me.name}</p>
        <h1 className="text-3xl font-bold">{s.business_name || "Your shop"}</h1>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className={`rounded-full px-3 py-1 font-semibold ${left >= 0 || s.billing_exempt ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"}`}>{status}</span>
          <span className="rounded-full bg-muted px-3 py-1">{tills.length} till{tills.length === 1 ? "" : "s"}</span>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {links.map((l) => (
          <Link key={l.t} to={l.to} className="flex flex-col items-center gap-2 rounded-2xl border border-sidebar-border bg-sidebar-accent p-4 text-center text-sm font-semibold hover:border-sidebar-primary">
            <l.icon className="h-6 w-6 text-sidebar-primary" />{l.t}
          </Link>
        ))}
      </section>

      {me.isOwner || me.canManageStaff ? (
        <section>
          <h2 className="text-xl font-semibold">Set up till devices</h2>
          <p className="mt-1 text-sm opacity-75">On each phone, tablet or laptop, scan its code (or open the link) with internet once. The device remembers its till name and your shop, then add it to the home screen. Cashiers sign in with their PIN.</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tills.map((t) => {
              const url = origin ? pairingLink(origin, s.business_name || "", t) : "";
              return (
                <div key={t} className="rounded-2xl bg-card p-5 text-card-foreground">
                  <h3 className="font-semibold">{t}</h3>
                  <div className="my-3 flex justify-center rounded-xl bg-background p-3">{url && <QRCodeSVG value={url} size={150} />}</div>
                  <Button variant="outline" className="w-full" onClick={() => { void navigator.clipboard.writeText(url).then(() => toast.success("Link copied")); }}>Copy link</Button>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm opacity-75">Need another till? Add it on the <Link to="/billing" className="underline">Billing</Link> page ($10 per till per month).</p>
        </section>
      ) : null}
    </div>
  );
}
