import { useEffect, useState } from "react";
import { Copy, Download, Monitor, QrCode, Share, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { isPreviewContext } from "@/lib/pwa";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// Captured the moment the browser offers the install prompt, even before this button mounts.
let capturedPrompt: PromptEvent | null = null;
const watchers = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    capturedPrompt = e as PromptEvent;
    watchers.forEach((w) => w());
  });
  window.addEventListener("appinstalled", () => {
    capturedPrompt = null;
    watchers.forEach((w) => w());
  });
}

type Platform = "android" | "ios" | "desktop";

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/Macintosh/.test(ua) && "ontouchend" in document) return "ios";
  if (/android/i.test(ua)) return "android";
  return "desktop";
}

function stepsFor(platform: Platform, url: string) {
  if (platform === "android") {
    return {
      heading: "On this Android phone",
      icon: Smartphone,
      lines: [
        `Open ${url} in Chrome.`,
        "Tap the ⋮ menu at the top right.",
        "Tap “Install app” (or “Add to Home screen”).",
      ],
    };
  }
  if (platform === "ios") {
    return {
      heading: "On this iPhone or iPad",
      icon: Share,
      lines: [
        `Open ${url} in Safari.`,
        "Tap the Share button (the square with an arrow).",
        "Tap “Add to Home Screen”, then Add.",
      ],
    };
  }
  return {
    heading: "On this computer",
    icon: Monitor,
    lines: [
      `Open ${url} in Chrome or Edge.`,
      "Click the install icon in the address bar, or the ⋮ menu then “Install Tilla POS”.",
      "Confirm — the till opens in its own window.",
    ],
  };
}

// "Install app": adds the till to a phone or computer home screen so it opens like an app.
export function InstallButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [canPrompt, setCanPrompt] = useState(false);
  const [url, setUrl] = useState("");

  useEffect(() => {
    if (isPreviewContext()) return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    setPlatform(detectPlatform());
    setUrl(window.location.origin);
    setCanPrompt(Boolean(capturedPrompt));
    setReady(true);
    const watch = () => setCanPrompt(Boolean(capturedPrompt));
    watchers.add(watch);
    return () => {
      watchers.delete(watch);
    };
  }, []);

  if (!ready) return null;

  async function install() {
    if (!capturedPrompt) return;
    await capturedPrompt.prompt();
    const { outcome } = await capturedPrompt.userChoice;
    capturedPrompt = null;
    setCanPrompt(false);
    if (outcome === "accepted") {
      setOpen(false);
      toast.success("Tilla POS is installing — look for it on your home screen.");
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied — send it to your staff.");
    } catch {
      toast.info(url);
    }
  }

  const steps = stepsFor(platform, url);
  const StepsIcon = steps.icon;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          aria-label="Install Tilla POS app"
          className={`flex items-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90 ${className}`}
        >
          <Download className="h-4 w-4" />
          <span>Install app</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Install Tilla POS</DialogTitle>
          <DialogDescription>
            Put the till on your home screen. It opens like an app, keeps you signed in, and keeps
            selling when the internet drops.
          </DialogDescription>
        </DialogHeader>

        {canPrompt && (
          <Button onClick={install} className="w-full">
            <Download className="h-4 w-4" />
            Add to Home Screen
          </Button>
        )}

        <div className="rounded-xl border border-border bg-muted/40 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <StepsIcon className="h-4 w-4 text-primary" />
            {steps.heading}
          </div>
          <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
            {steps.lines.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-semibold text-foreground">{i + 1}.</span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>

        {url && (
          <div className="flex items-center gap-4 rounded-xl border border-border p-4">
            <div className="shrink-0 rounded-lg bg-background p-2 text-foreground">
              <QRCodeSVG value={url} size={112} level="M" bgColor="transparent" fgColor="currentColor" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <QrCode className="h-4 w-4 text-primary" />
                Scan with a phone
              </div>
              <p className="mt-1 break-all text-xs text-muted-foreground">{url}</p>
              <Button variant="outline" size="sm" onClick={copyLink} className="mt-2">
                <Copy className="h-3.5 w-3.5" />
                Copy link
              </Button>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Already installed? Open it from your home screen — new features appear by themselves.
        </p>
      </DialogContent>
    </Dialog>
  );
}
