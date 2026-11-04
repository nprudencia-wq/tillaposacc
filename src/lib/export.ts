export type Col = { key: string; label: string; money?: boolean };
export type Row = Record<string, string | number>;

const fmt = (v: unknown, money?: boolean) =>
  money && typeof v === "number" ? v.toFixed(2) : String(v ?? "");

export async function exportExcel(filename: string, sheet: string, cols: Col[], rows: Row[]) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c.label, r[c.key] ?? ""])));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheet.slice(0, 31));
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

export async function exportPDF(filename: string, title: string, subtitle: string, cols: Col[], rows: Row[]) {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 16);
  doc.setFontSize(10);
  doc.text(subtitle, 14, 23);
  autoTable(doc, {
    startY: 28,
    head: [cols.map((c) => c.label)],
    body: rows.map((r) => cols.map((c) => fmt(r[c.key], c.money))),
    headStyles: { fillColor: [31, 94, 70] },
    styles: { fontSize: 9 },
  });
  doc.save(`${filename}.pdf`);
}
