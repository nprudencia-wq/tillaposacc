import { useRouter, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/** Back arrow shown on every page except the home screens (dashboard / till). */
export function BackBar({ home = "/dashboard" }: { home?: string }) {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === home || pathname === "/" || pathname === "/pos" && home === "/pos") return null;
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) router.history.back();
    else router.navigate({ to: home });
  };
  return (
    <div className="px-4 pt-3 lg:px-8 print:hidden">
      <button
        onClick={goBack}
        aria-label="Go back"
        className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
      >
        <ArrowLeft className="h-4 w-4" />Back
      </button>
    </div>
  );
}
