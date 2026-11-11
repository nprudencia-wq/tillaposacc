/** Prints the visible #receipt-print element in an isolated frame so dialogs, scroll and hidden page layers can't blank the page. */
export function printReceiptElement() {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>("#receipt-print"));
  const el = nodes.reverse().find((n) => n.offsetParent !== null || n.getClientRects().length > 0) ?? nodes[0];
  if (!el) { window.print(); return; }
  const paper = el.dataset["paper"] === "58mm" ? "58mm" : el.dataset["paper"] === "80mm" ? "80mm" : "";
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style')).map((s) => s.outerHTML).join("");
  const width = paper === "58mm" ? "48mm" : paper === "80mm" ? "72mm" : "auto";
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8">${styles}<style>
    @page { margin: 4mm; ${paper ? `size: ${paper} auto;` : ""} }
    html,body{background:#fff!important;color:#000!important;margin:0;}
    body *{visibility:visible!important;}
    #receipt-print{position:static!important;width:${width}!important;max-width:none!important;margin:0 auto!important;background:#fff!important;color:#000!important;}
    #receipt-print *{color:#000!important;}
    .print\\:hidden{display:none!important;}
  </style></head><body>${el.outerHTML}</body></html>`);
  doc.close();
  const go = async () => {
    const links = Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel=stylesheet]"));
    await Promise.all(links.map((l) => l.sheet ? null : new Promise((r) => { l.onload = l.onerror = r; setTimeout(r, 2000); })));
    const imgs = Array.from(doc.images);
    await Promise.all(imgs.map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })));
    await new Promise((r) => setTimeout(r, 150));
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1000);
  };
  if (doc.readyState === "complete") void go(); else frame.onload = () => void go();
}
