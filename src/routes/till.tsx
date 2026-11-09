import { createFileRoute } from "@tanstack/react-router";
import { AuthPage } from "./auth";

export const Route = createFileRoute("/till")({
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
  component: () => <AuthPage tillOnly />,
});
