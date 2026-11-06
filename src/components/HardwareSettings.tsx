import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HW_DEFAULTS, loadHardware, openDrawer, pair, saveHardware, sendToPrinter, support, type HardwareConfig } from "@/lib/hardware";
import { EscPos, CUT, columnsFor } from "@/lib/escpos";
import { useSettings } from "@/hooks/use-staff";
import { receiptConfig } from "@/lib/receipt-config";

const sel = "h-10 w-full rounded-md border bg-background px-3 text-sm";

export function HardwareSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [c, setC] = useState<HardwareConfig>(HW_DEFAULTS);
  const [sup, setSup] = useState({ usb: false, serial: false, bluetooth: false, network: true });
  const { data: settings } = useSettings();
  useEffect(() => { if (open) { setC(loadHardware()); setSup(support()); } }, [open]);
  const set = (p: Partial<HardwareConfig>) => { const n = { ...c, ...p }; setC(n); saveHardware(n); };
  const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Device error");

  async function connect(target: "printer" | "drawer") {
    try { await pair(target, target === "printer" ? c.printer : c.drawer, c); toast.success(`${target === "printer" ? "Printer" : "Drawer"} connected`); } catch (e) { err(e); }
  }
  async function testPrint() {
    const cols = columnsFor(receiptConfig((settings as { receipt_config?: unknown } | undefined)?.receipt_config).paper_width);
    const b = new EscPos().init().align("center").bold(true).line("TILLA TEST PRINT").bold(false).line("-".repeat(cols)).line(new Date().toLocaleString()).feed(4).raw(CUT).bytes();
    try { await sendToPrinter(b, c); toast.success("Test page sent"); } catch (e) { err(e); }
  }
  const opt = (v: string, label: string, ok = true) => <option value={v} disabled={!ok}>{label}{ok ? "" : " (not supported on this device)"}</option>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Printer &amp; cash drawer</DialogTitle></DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label>Receipt printer</Label>
            <select className={sel} value={c.printer} onChange={(e) => set({ printer: e.target.value as HardwareConfig["printer"] })}>
              {opt("none", "Browser print window")}{opt("usb", "USB cable", sup.usb)}{opt("serial", "USB/serial (COM port)", sup.serial)}{opt("bluetooth", "Bluetooth", sup.bluetooth)}{opt("network", "Network / Wi‑Fi")}
            </select>
            {c.printer === "network" && <Input placeholder="Printer address, e.g. http://192.168.1.50/print" value={c.networkUrl} onChange={(e) => set({ networkUrl: e.target.value })} />}
            {c.printer === "network" && <p className="text-xs text-muted-foreground">Needs a printer with a web print address (e.g. Epson ePOS) or a small print bridge on the network.</p>}
            <div className="flex gap-2">
              {["usb", "serial", "bluetooth"].includes(c.printer) && <Button variant="outline" className="flex-1" onClick={() => connect("printer")}>Connect printer</Button>}
              {c.printer !== "none" && <Button variant="secondary" className="flex-1" onClick={testPrint}>Test print</Button>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Cash drawer</Label>
            <select className={sel} value={c.drawer} onChange={(e) => set({ drawer: e.target.value as HardwareConfig["drawer"] })}>
              {opt("none", "No drawer")}{opt("printer", "Plugged into printer")}{opt("usb", "Separate — USB", sup.usb)}{opt("serial", "Separate — USB/serial (COM port)", sup.serial)}
            </select>
            {(c.drawer === "serial" || c.printer === "serial") && (
              <div className="flex items-center gap-2"><Label className="shrink-0">Speed (baud)</Label>
                <select className={sel} value={c.baud} onChange={(e) => set({ baud: Number(e.target.value) })}>{[9600, 19200, 38400, 115200].map((b) => <option key={b}>{b}</option>)}</select></div>
            )}
            <div className="flex gap-2">
              {(c.drawer === "usb" || c.drawer === "serial") && <Button variant="outline" className="flex-1" onClick={() => connect("drawer")}>Connect drawer</Button>}
              {c.drawer !== "none" && <Button variant="secondary" className="flex-1" onClick={() => openDrawer(c).then(() => toast.success("Drawer opened"), err)}>Test drawer</Button>}
            </div>
          </div>
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.autoPrint} onChange={(e) => set({ autoPrint: e.target.checked })} />Print receipt automatically after each sale</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={c.autoDrawer} onChange={(e) => set({ autoDrawer: e.target.checked })} />Open drawer automatically when cash is paid</label>
          <p className="text-xs text-muted-foreground">Settings are saved on this till only. Use Chrome or Edge; the till remembers approved USB devices after the first connect.</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
