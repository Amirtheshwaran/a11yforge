import type { Page } from "playwright";
import {
  FocusObservationSchema,
  type FocusObservation,
} from "@a11yforge/shared";

/**
 * Phase 2 focus observations: compact, deterministic facts about which
 * element holds keyboard focus after each scenario action. No DOM snapshots,
 * no model calls — just the focused element described in-page.
 */

const MAX_TEXT_CHARS = 200;

/** Raw focused-element facts collected inside the page. */
export interface RawFocusSnapshot {
  selector: string;
  tagName: string;
  role: string | null;
  accessibleName: string;
  text: string;
  tabIndex: number;
  disabled: boolean;
  ariaHidden: boolean;
  insideModal: boolean;
  /** Bounded outer-HTML, kept for assertion evidence (not stored per se). */
  html: string;
}

/**
 * Runs inside the browser (must stay closure-free — Playwright serializes
 * this function into the page). Describes `document.activeElement`
 * deterministically.
 */
export function describeActiveElement(modalSelector: string): RawFocusSnapshot {
  const MAX_CHARS = 200;
  const IMPLICIT: Record<string, string> = {
    button: "button",
    select: "combobox",
    textarea: "textbox",
    img: "img",
    h1: "heading",
    h2: "heading",
    h3: "heading",
    h4: "heading",
    h5: "heading",
    h6: "heading",
  };
  const bound = (value: string, max: number): string =>
    value.length <= max ? value : `${value.slice(0, max)}…`;
  const collapse = (value: string): string =>
    value.replace(/\s+/g, " ").trim();

  const active = document.activeElement;
  if (!active || active === document.body || active === document.documentElement) {
    return {
      selector: "body",
      tagName: "body",
      role: null,
      accessibleName: "",
      text: "",
      tabIndex: -1,
      disabled: false,
      ariaHidden: false,
      insideModal: false,
      html: "<body>",
    };
  }
  const el = active as HTMLElement;

  let selector: string;
  const id = el.getAttribute("id");
  if (id) {
    selector =
      typeof CSS !== "undefined" && typeof CSS.escape === "function"
        ? `#${CSS.escape(id)}`
        : `#${id}`;
  } else {
    const parts: string[] = [];
    let node: Element | null = el;
    for (let depth = 0; depth < 3 && node && node !== document.body; depth += 1) {
      const tag = node.tagName.toLowerCase();
      const classes = Array.from(node.classList).slice(0, 2).join(".");
      let part = classes ? `${tag}.${classes}` : tag;
      const parent: Element | null = node.parentElement;
      if (parent) {
        const tagName = node.tagName;
        const sameTag = Array.from(parent.children).filter(
          (child: Element) => child.tagName === tagName,
        );
        if (sameTag.length > 1) {
          part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = parent;
    }
    selector = parts.join(" > ");
  }

  const explicitRole = el.getAttribute("role");
  let role: string | null = explicitRole;
  if (!role) {
    const tag = el.tagName.toLowerCase();
    if (tag === "a" && el.hasAttribute("href")) {
      role = "link";
    } else if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (type === "checkbox") role = "checkbox";
      else if (type === "radio") role = "radio";
      else if (type === "submit" || type === "button" || type === "reset") {
        role = "button";
      } else role = "textbox";
    } else {
      role = IMPLICIT[tag] ?? null;
    }
  }

  let accessibleName = "";
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    accessibleName = labelledBy
      .split(/\s+/)
      .map((ref) => document.getElementById(ref)?.textContent ?? "")
      .join(" ");
  }
  if (!collapse(accessibleName)) {
    accessibleName = el.getAttribute("aria-label") ?? "";
  }
  if (!collapse(accessibleName) && el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    accessibleName = label?.textContent ?? "";
  }
  if (!collapse(accessibleName)) {
    accessibleName = el.closest("label")?.textContent ?? "";
  }
  if (!collapse(accessibleName)) {
    accessibleName = el.getAttribute("alt") ?? "";
  }
  if (!collapse(accessibleName) && el.tagName.toLowerCase() === "input") {
    accessibleName = (el as HTMLInputElement).value ?? "";
  }
  if (!collapse(accessibleName)) {
    accessibleName = el.textContent ?? "";
  }
  accessibleName = collapse(accessibleName);

  const text = collapse(el.textContent ?? "");
  const modal = modalSelector ? document.querySelector(modalSelector) : null;

  return {
    selector,
    tagName: el.tagName.toLowerCase(),
    role,
    accessibleName: bound(accessibleName, MAX_CHARS),
    text: bound(text, MAX_CHARS),
    tabIndex: el.tabIndex,
    disabled:
      "disabled" in el ? (el as HTMLButtonElement).disabled === true : false,
    ariaHidden: el.closest('[aria-hidden="true"]') !== null,
    insideModal: modal !== null && modal.contains(el),
    html: bound(el.outerHTML, 500),
  };
}

/** Runs inside the browser: is the modal region present and visible? */
export function isModalOpenInPage(modalSelector: string): boolean {
  const modal = document.querySelector(modalSelector);
  if (!modal) {
    return false;
  }
  return modal.getClientRects().length > 0;
}

export interface ObservationMeta {
  seq: number;
  action: string;
  key: string | null;
  timestamp: string;
  pageUrl: string;
}

/**
 * Normalize a raw in-page snapshot into validated shared evidence.
 * Pure and unit-testable: the browser only supplies `raw`.
 */
export function toFocusObservation(
  raw: RawFocusSnapshot,
  meta: ObservationMeta,
): FocusObservation {
  return FocusObservationSchema.parse({
    seq: meta.seq,
    action: meta.action,
    key: meta.key,
    timestamp: meta.timestamp,
    pageUrl: meta.pageUrl,
    selector: raw.selector,
    tagName: raw.tagName,
    role: raw.role,
    accessibleName: raw.accessibleName.slice(0, MAX_TEXT_CHARS),
    text: raw.text.slice(0, MAX_TEXT_CHARS),
    tabIndex: raw.tabIndex,
    disabled: raw.disabled,
    ariaHidden: raw.ariaHidden,
    insideModal: raw.insideModal,
  });
}

/** Capture and normalize the current focus state from a live page. */
export async function captureFocusObservation(
  page: Page,
  modalSelector: string,
  meta: ObservationMeta,
): Promise<{ observation: FocusObservation; html: string }> {
  const raw = await page.evaluate(describeActiveElement, modalSelector);
  return { observation: toFocusObservation(raw, meta), html: raw.html };
}

/** Deterministic modal-open probe against a live page. */
export async function isModalOpen(
  page: Page,
  modalSelector: string,
): Promise<boolean> {
  return page.evaluate(isModalOpenInPage, modalSelector);
}
