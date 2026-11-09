import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { AuthPage } from "./auth";
import { cleanLabel, setShopLabel } from "@/lib/till-pairing";
import { setDeviceName } from "@/lib/device-name";

export const Route = createFileRoute("/till")({
  validateSearch: (s: { shop?: unknown; till?: unknown }): { shop?: string; till?: string } => ({
    shop: cleanLabel(s["shop"], 60) || undefined,
    till: cleanLabel(s["till"], 40) || undefined,
  }),
  head: () => ({
    meta: [
      { title: "Till sign in — Tilla POS" },
      { name: "description", content: "Cashier PIN sign in for the Tilla POS till counter." },
      { property: "og:title", content: "Till sign in — Tilla POS" },
      { property: "og:description", content: "Cashier PIN sign in for the Tilla POS till counter." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TillPage,
});

function TillPage() {
  const { shop, till } = Route.useSearch();
  useEffect(() => {
    // A pairing link from the owner portal fixes this device's shop label and till name.
    if (shop) setShopLabel(shop);
    if (till) setDeviceName(till);
  }, [shop, till]);
  return <AuthPage tillOnly />;
}
