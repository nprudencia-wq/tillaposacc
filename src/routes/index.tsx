import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ScanBarcode, Boxes, Coins } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tilla POS — Sell faster, track every bottle" },
      { name: "description", content: "Point of sale and stock control for bottle stores, butcheries and supermarkets in Zimbabwe. USD and ZiG." },
      { property: "og:title", content: "Tilla POS — Sell faster, track every bottle" },
      { property: "og:description", content: "Point of sale and stock control for Zimbabwean retailers, with USD and ZiG payments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-sidebar text-sidebar-foreground">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl font-bold">Tilla<span className="text-sidebar-primary">POS</span></span>
        <Button asChild variant="secondary"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-sidebar-primary">Made for Zimbabwean retail</p>
        <h1 className="max-w-3xl text-5xl font-bold leading-[1.05] md:text-7xl">Ring up sales in USD or ZiG. Know every item on your shelf.</h1>
        <p className="mt-6 max-w-xl text-lg opacity-75">Bottle stores, butcheries, supermarkets and general dealers — one till, live stock, clear receipts.</p>
        <div className="mt-10 flex gap-3">
          <Button asChild size="lg" className="bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary/90"><Link to="/auth">Open the till</Link></Button>
        </div>
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            { icon: ScanBarcode, t: "Scan & sell", d: "Barcode, SKU or name search with a touch-friendly cart." },
            { icon: Coins, t: "USD + ZiG", d: "Split payments across cash, mobile money, card and transfer." },
            { icon: Boxes, t: "Live stock", d: "Every sale updates stock, with a permanent movement history." },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-sidebar-border bg-sidebar-accent p-6">
              <f.icon className="mb-4 h-7 w-7 text-sidebar-primary" />
              <h3 className="text-lg font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm opacity-70">{f.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
