import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// "Install app" button: uses the browser's install prompt; on iPhone shows Add to Home Screen steps.
export function InstallButton({ className = "" }: { className?: string }) {
  const [evt, setEvt] = useState<PromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (isIos) setShow(true);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as PromptEvent); setShow(true); };
    const onInstalled = () => { setShow(false); setEvt(null); toast.success("Tilla POS installed"); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (!show) return null;

  async function install() {
    if (evt) {
      await evt.prompt();
      const { outcome } = await evt.userChoice;
      if (outcome === "accepted") setShow(false);
      setEvt(null);
    } else if (ios) {
      toast.info("To install: tap the Share button in Safari, then “Add to Home Screen”.", { duration: 8000 });
    }
  }

  return (
    <button onClick={install} aria-label="Install Tilla POS app" className={`flex items-center gap-2 rounded-lg bg-sidebar-primary px-3 py-2 text-sm font-semibold text-sidebar-primary-foreground hover:opacity-90 ${className}`}>
      <Download className="h-4 w-4" /><span>Install app</span>
    </button>
  );
}
