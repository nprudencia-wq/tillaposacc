// Browser-only till hardware: receipt printer + cash drawer over USB, serial, Bluetooth or network.
// Call only from event handlers / effects.
import { DRAWER_KICK } from "@/lib/escpos";
import { logSystemError } from "@/lib/register-events";

export type Link = "none" | "usb" | "serial" | "bluetooth" | "network";
export type DrawerMode = "none" | "printer" | "usb" | "serial";
export interface HardwareConfig {
  printer: Link;
  networkUrl: string; // HTTP print bridge / ePOS endpoint accepting raw ESC/POS bytes
  drawer: DrawerMode;
  autoPrint: boolean;
  autoDrawer: boolean; // open drawer when a sale includes cash
  baud: number;
}
export const HW_DEFAULTS: HardwareConfig = { printer: "none", networkUrl: "", drawer: "none", autoPrint: false, autoDrawer: true, baud: 9600 };
const KEY = "tilla-hardware"; // device-level, not per-cashier

export function loadHardware(): HardwareConfig {
  try { return { ...HW_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return HW_DEFAULTS; }
}
export function saveHardware(c: HardwareConfig) { localStorage.setItem(KEY, JSON.stringify(c)); }

export function support() {
  const n = typeof navigator === "undefined" ? ({} as Record<string, unknown>) : (navigator as unknown as Record<string, unknown>);
  return { usb: "usb" in n, serial: "serial" in n, bluetooth: "bluetooth" in n, network: true };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Writer = (data: Uint8Array) => Promise<void>;
const writers: Partial<Record<"printer" | "drawer", Writer>> = {};
let printerStatus = "unknown";
let scannerStatus = "unknown";
export function markScannerInput() { scannerStatus = "input_seen"; }
export function hardwareStatus() {
  return { printer: loadHardware().printer === "none" ? "not_configured" : printerStatus, scanner: scannerStatus };
}
const BT_SERVICES = ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455"];

async function usbWriter(device: any): Promise<Writer> {
  if (!device.opened) await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  for (const iface of device.configuration.interfaces) {
    const alt = iface.alternates[0];
    const out = alt.endpoints.find((e: any) => e.direction === "out" && e.type === "bulk");
    if (out) {
      try { await device.claimInterface(iface.interfaceNumber); } catch { /* already claimed */ }
      return async (d) => { await device.transferOut(out.endpointNumber, d); };
    }
  }
  throw new Error("This USB device has no printer output");
}

async function serialWriter(port: any, baud: number): Promise<Writer> {
  if (!port.writable) await port.open({ baudRate: baud });
  return async (d) => { const w = port.writable.getWriter(); try { await w.write(d); } finally { w.releaseLock(); } };
}

async function btWriter(device: any): Promise<Writer> {
  const server = await device.gatt.connect();
  for (const s of await server.getPrimaryServices()) {
    for (const ch of await s.getCharacteristics()) {
      if (ch.properties.write || ch.properties.writeWithoutResponse) {
        return async (d) => { for (let i = 0; i < d.length; i += 180) await ch.writeValueWithoutResponse?.(d.slice(i, i + 180)) ?? ch.writeValue(d.slice(i, i + 180)); };
      }
    }
  }
  throw new Error("No writable Bluetooth channel found");
}

/** Ask the browser to choose a device (must run from a button tap). */
export async function pair(target: "printer" | "drawer", link: Link | DrawerMode, cfg: HardwareConfig) {
  const nav = navigator as any;
  if (link === "usb") writers[target] = await usbWriter(await nav.usb.requestDevice({ filters: [] }));
  else if (link === "serial") writers[target] = await serialWriter(await nav.serial.requestPort(), cfg.baud);
  else if (link === "bluetooth") writers[target] = await btWriter(await nav.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES }));
}

/** Reconnect to previously approved USB/serial devices without a prompt. */
async function reconnect(target: "printer" | "drawer", link: string, cfg: HardwareConfig) {
  const connected = writers[target];
  if (connected) return connected;
  const nav = navigator as any;
  const idx = target === "drawer" && link === (cfg.printer as string) ? 1 : 0;
  if (link === "usb" && nav.usb) { const d = (await nav.usb.getDevices())[idx] ?? (await nav.usb.getDevices())[0]; if (d) writers[target] = await usbWriter(d); }
  if (link === "serial" && nav.serial) { const ports = await nav.serial.getPorts(); const p = ports[idx] ?? ports[0]; if (p) writers[target] = await serialWriter(p, cfg.baud); }
  if (link === "bluetooth" && nav.bluetooth?.getDevices) { const d = (await nav.bluetooth.getDevices())[0]; if (d) writers[target] = await btWriter(d); }
  return writers[target];
}

async function writePrinter(bytes: Uint8Array, cfg = loadHardware()) {
  if (cfg.printer === "none") throw new Error("No printer set up");
  if (cfg.printer === "network") {
    if (!cfg.networkUrl) throw new Error("Printer address missing");
    const res = await fetch(cfg.networkUrl, { method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: bytes as BodyInit });
    if (!res.ok) throw new Error(`Printer replied ${res.status}`);
    return;
  }
  const w = await reconnect("printer", cfg.printer, cfg);
  if (!w) throw new Error("Printer not connected — tap Connect printer");
  try { await w(bytes); } catch (e) { delete writers.printer; throw e; }
}

export async function sendToPrinter(bytes: Uint8Array, cfg = loadHardware()) {
  try { await writePrinter(bytes, cfg); printerStatus = "last_write_ok"; }
  catch (error) { printerStatus = "error"; logSystemError("hardware", error); throw error; }
}

async function writeDrawer(cfg = loadHardware()) {
  if (cfg.drawer === "none") return;
  if (cfg.drawer === "printer") return sendToPrinter(DRAWER_KICK, cfg);
  const w = await reconnect("drawer", cfg.drawer, cfg);
  if (!w) throw new Error("Cash drawer not connected — tap Connect drawer");
  try { await w(DRAWER_KICK); } catch (e) { delete writers.drawer; throw e; }
}
export async function openDrawer(cfg = loadHardware()) {
  try { await writeDrawer(cfg); }
  catch (error) { logSystemError("hardware", error); throw error; }
}
