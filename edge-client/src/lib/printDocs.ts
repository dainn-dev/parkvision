import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { EntryTicket, type EntryTicketProps } from "../components/monitor/EntryTicket";
import { ExitReceipt, type ExitReceiptProps } from "../components/monitor/ExitReceipt";

let root: Root | null = null;
let rootEl: HTMLElement | null = null;

function printRoot(): Root {
  let el = document.getElementById("print-root");
  if (!el) {
    el = document.createElement("div");
    el.id = "print-root";
    document.body.appendChild(el);
  }
  if (!root || rootEl !== el) {
    root = createRoot(el);
    rootEl = el;
  }
  return root;
}

function printElement(node: ReturnType<typeof createElement>): void {
  const r = printRoot();
  // Render synchronously so the content exists when the print dialog opens.
  flushSync(() => r.render(node));
  window.print();
}

/** Renders the phiếu vào into the print-only container and prints it (default printer). */
export const printEntryTicket = (p: EntryTicketProps): void =>
  printElement(createElement(EntryTicket, p));

/** Renders the biên lai ra into the print-only container and prints it. */
export const printExitReceipt = (p: ExitReceiptProps): void =>
  printElement(createElement(ExitReceipt, p));
