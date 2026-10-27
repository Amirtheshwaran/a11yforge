import type { Page } from "playwright";
import { PageSurfaceSchema, type ElementRef, type PageSurface } from "@a11yforge/shared";

/**
 * Phase 8 — generic accessibility surface discovery.
 *
 * Everything here is derived from live browser semantics (roles, names,
 * ARIA states, focusability) — never from application names, routes, or
 * text. The in-page snapshot function only reads the DOM; it performs no
 * clicks, no form submissions, and no state changes.
 */

/**
 * Bounds below live INSIDE the in-page snapshot functions (page.evaluate
 * serializes each function alone — closing over module scope fails at
 * runtime). The single exception is DOWNLOAD_EXTENSIONS, used node-side.
 */

/** Plain snapshot produced inside the page (must stay serializable). */
interface SurfaceSnapshot {
  title: string;
  headings: { level: number; name: string }[];
  landmarkRoles: string[];
  linkCount: number;
  buttonCount: number;
  controls: ElementRef[];
  dialogs: ElementRef[];
  tablistCount: number;
  tabCount: number;
  menuCount: number;
  disclosureCount: number;
  keyboardOrderSize: number;
}

/**
 * Runs inside the page via `page.evaluate`. Self-contained: it must not
 * close over any outer variable (Playwright serializes the function).
 */
export function snapshotPageSurface(): SurfaceSnapshot {
  // Local copies: page.evaluate serializes this function alone, so it must
  // not close over module scope. Keep in sync with the module constants.
  const MAX_TEXT_CHARS = 200;
  const MAX_FINGERPRINT_CHARS = 300;
  const MAX_HEADINGS = 100;
  const MAX_CONTROLS = 300;
  const MAX_DIALOGS = 25;
  const truncate = (value: string, max: number): string =>
    value.length <= max ? value : `${value.slice(0, max)}…`;

  const visibleText = (el: Element): string =>
    truncate((el.textContent ?? "").replace(/\s+/g, " ").trim(), MAX_TEXT_CHARS);

  const implicitRole = (el: Element): string => {
    const explicit = el.getAttribute("role");
    if (explicit !== null && explicit.trim() !== "") return explicit.trim().split(/\s+/)[0] ?? "";
    const tag = el.tagName.toLowerCase();
    if (tag === "button") return "button";
    if (tag === "a" && el.hasAttribute("href")) return "link";
    if (/^h[1-6]$/.test(tag)) return "heading";
    if (tag === "input") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "range") return "slider";
      if (type === "button" || type === "submit" || type === "reset") return "button";
      return "textbox";
    }
    if (tag === "select") return el.hasAttribute("multiple") ? "listbox" : "combobox";
    if (tag === "textarea") return "textbox";
    if (tag === "img") return "img";
    if (tag === "dialog") return "dialog";
    if (tag === "summary") return "button";
    if (tag === "nav") return "navigation";
    if (tag === "main") return "main";
    if (tag === "header") return "banner";
    if (tag === "footer") return "contentinfo";
    if (tag === "aside") return "complementary";
    if (tag === "form") return "form";
    if (tag === "table") return "table";
    if (tag === "ul" || tag === "ol") return "list";
    if (tag === "li") return "listitem";
    return tag;
  };

  const accessibleName = (el: Element): string => {
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy !== null && labelledBy.trim() !== "") {
      const parts: string[] = [];
      for (const id of labelledBy.trim().split(/\s+/)) {
        const ref = document.getElementById(id);
        if (ref) parts.push((ref.textContent ?? "").replace(/\s+/g, " ").trim());
      }
      const joined = parts.join(" ").trim();
      if (joined !== "") return truncate(joined, MAX_TEXT_CHARS);
    }
    const label = el.getAttribute("aria-label");
    if (label !== null && label.trim() !== "") return truncate(label.trim(), MAX_TEXT_CHARS);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      const id = el.id;
      if (id !== "") {
        const owner = el.ownerDocument.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (owner) return truncate((owner.textContent ?? "").replace(/\s+/g, " ").trim(), MAX_TEXT_CHARS);
      }
      const wrapping = el.closest("label");
      if (wrapping) return truncate((wrapping.textContent ?? "").replace(/\s+/g, " ").trim(), MAX_TEXT_CHARS);
      const placeholder = el.getAttribute("placeholder");
      if (placeholder !== null && placeholder.trim() !== "") return truncate(placeholder.trim(), MAX_TEXT_CHARS);
      if (el instanceof HTMLInputElement && el.value !== "") return truncate(el.value, MAX_TEXT_CHARS);
      return "";
    }
    if (el instanceof HTMLImageElement) {
      return truncate(el.getAttribute("alt") ?? "", MAX_TEXT_CHARS);
    }
    return visibleText(el);
  };

  const domPath = (el: Element): string => {
    const parts: string[] = [];
    let current: Element | null = el;
    while (current !== null && current !== document.body && parts.length < 12) {
      const node: Element = current;
      const tag = node.tagName.toLowerCase();
      const parent: Element | null = node.parentElement;
      let suffix = "";
      if (parent !== null) {
        const siblings = Array.from(parent.children).filter(
          (child: Element) => child.tagName === node.tagName,
        );
        if (siblings.length > 1) suffix = `:nth-of-type(${siblings.indexOf(node) + 1})`;
      }
      parts.unshift(`${tag}${suffix}`);
      current = parent;
    }
    parts.unshift("body");
    return parts.join(" > ");
  };

  const stableDataAttribute = (el: Element): string => {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name.startsWith("data-") && attr.value !== "") {
        return truncate(`${attr.name}="${attr.value}"`, 100);
      }
    }
    return "";
  };

  const isRendered = (el: Element): boolean => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    return true;
  };

  const toRef = (el: Element, ordinal: number): ElementRef => {
    const id = el.id ?? "";
    const dataAttribute = stableDataAttribute(el);
    const tagName = el.tagName;
    const role = implicitRole(el);
    const name = accessibleName(el);
    const path = domPath(el);
    let replaySelector = "";
    if (id !== "") {
      replaySelector = `#${CSS.escape(id)}`;
    } else if (dataAttribute !== "") {
      const eq = dataAttribute.indexOf("=");
      const attrName = eq > 0 ? dataAttribute.slice(0, eq) : dataAttribute;
      replaySelector = `${tagName.toLowerCase()}[${attrName}]`;
    } else {
      replaySelector = path;
    }
    const rect = el.getBoundingClientRect();
    const rectVisible = rect.width > 0 && rect.height > 0;
    const html = truncate(el.outerHTML, MAX_FINGERPRINT_CHARS);
    return {
      role,
      accessibleName: name,
      elementId: truncate(id, 120),
      dataAttribute,
      tagName,
      ordinal,
      fingerprint: html,
      domPath: truncate(path, 300),
      replaySelector: truncate(replaySelector, 300),
      boundingBox: rectVisible
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null,
      exposed: el.getAttribute("aria-hidden") !== "true",
      disabled:
        el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true",
      tabIndex: el.hasAttribute("tabindex") ? Number(el.getAttribute("tabindex")) : null,
    };
  };

  const byRoleAndName = (elements: Element[]): ElementRef[] => {
    const seen = new Map<string, number>();
    return elements.map((el) => {
      const key = `${implicitRole(el)}::${accessibleName(el)}`;
      const ordinal = seen.get(key) ?? 0;
      seen.set(key, ordinal + 1);
      return toRef(el, ordinal);
    });
  };

  const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6"))
    .slice(0, MAX_HEADINGS)
    .map((el) => ({
      level: Number(el.tagName.slice(1)),
      name: visibleText(el),
    }));

  const landmarkRoles = Array.from(
    document.querySelectorAll(
      "header, nav, main, footer, aside, form, section[aria-label], section[aria-labelledby], div[role], search",
    ),
  ).map((el) => implicitRole(el));

  const linkEls = Array.from(document.querySelectorAll('a[href]'));
  const buttonEls = Array.from(
    document.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]'),
  );

  const controlEls = Array.from(
    document.querySelectorAll(
      'input, select, textarea, [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"], [role="listbox"]',
    ),
  ).slice(0, MAX_CONTROLS);

  const dialogEls = Array.from(
    document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]'),
  ).slice(0, MAX_DIALOGS);

  const disclosureCount = document.querySelectorAll("[aria-expanded]").length;

  const focusable = Array.from(
    document.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), summary, audio[controls], video[controls], [contenteditable="true"]',
    ),
  ).filter((el) => isRendered(el) && el.getAttribute("aria-hidden") !== "true");

  return {
    title: truncate(document.title, MAX_TEXT_CHARS),
    headings,
    landmarkRoles,
    linkCount: linkEls.length,
    buttonCount: buttonEls.length,
    controls: byRoleAndName(controlEls),
    dialogs: byRoleAndName(dialogEls),
    tablistCount: document.querySelectorAll('[role="tablist"]').length,
    tabCount: document.querySelectorAll('[role="tab"]').length,
    menuCount: document.querySelectorAll('[role="menu"], [role="menubar"]').length,
    disclosureCount,
    keyboardOrderSize: focusable.length,
  };
}

/** Enrich bare refs with control-specific ARIA relationships (in-page). */
export function snapshotControlStates(): {
  ariaExpanded: string | null;
  ariaControls: string | null;
  ariaHaspopup: string | null;
  ariaSelected: string | null;
  required: boolean;
  invalid: boolean;
  describedBy: string;
  inputType: string;
}[] {
  const MAX_CONTROLS = 300;
  const els = Array.from(
    document.querySelectorAll(
      'input, select, textarea, [role="checkbox"], [role="radio"], [role="switch"], [role="slider"], [role="combobox"], [role="listbox"]',
    ),
  ).slice(0, MAX_CONTROLS);
  return els.map((el) => ({
    ariaExpanded: el.getAttribute("aria-expanded"),
    ariaControls: el.getAttribute("aria-controls"),
    ariaHaspopup: el.getAttribute("aria-haspopup"),
    ariaSelected: el.getAttribute("aria-selected"),
    required:
      el.hasAttribute("required") || el.getAttribute("aria-required") === "true",
    invalid: el.getAttribute("aria-invalid") === "true",
    describedBy: el.getAttribute("aria-describedby") ?? "",
    inputType:
      el instanceof HTMLInputElement
        ? (el.getAttribute("type") ?? "text").toLowerCase()
        : el.tagName.toLowerCase(),
  }));
}

/** Collect raw hrefs (resolved to absolute URLs) from the live page. */
export function snapshotAbsoluteLinks(): string[] {
  const MAX_LINKS_RETURNED = 500;
  const hrefs = Array.from(document.querySelectorAll("a[href]"))
    .map((anchor) => anchor.getAttribute("href") ?? "")
    .filter((href) => href !== "" && !href.startsWith("#"));
  const absolute: string[] = [];
  for (const href of hrefs.slice(0, MAX_LINKS_RETURNED)) {
    try {
      absolute.push(new URL(href, document.baseURI).toString());
    } catch {
      /* skip unresolvable hrefs — they are not navigable targets */
    }
  }
  return [...new Set(absolute)];
}

const DOWNLOAD_EXTENSIONS = [
  ".pdf", ".zip", ".tar", ".gz", ".rar", ".7z", ".exe", ".dmg",
  ".pkg", ".msi", ".apk", ".csv", ".xls", ".xlsx", ".doc", ".docx",
  ".ppt", ".pptx", ".mp3", ".mp4", ".avi", ".mov", ".wmv", ".ogg",
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".woff", ".woff2",
];

/**
 * Keep only navigable same-origin http(s) page targets: drops mailto/tel/
 * javascript (never absolute http URLs by here), cross-origin links, and
 * file-download links. Pure string/URL work — no browser assumptions.
 */
export function filterNavigableSameOriginLinks(hrefs: string[], origin: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const href of hrefs) {
    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      continue;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
    if (parsed.origin !== origin) continue;
    const path = parsed.pathname.toLowerCase();
    if (DOWNLOAD_EXTENSIONS.some((ext) => path.endsWith(ext))) continue;
    parsed.hash = "";
    const normalized = parsed.toString();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

/** Wait for a stable, usable page: loaded document plus settled content. */
export async function waitForStablePage(
  page: Page,
  navigationTimeoutMs: number,
): Promise<void> {
  await page.waitForLoadState("domcontentloaded", { timeout: navigationTimeoutMs });
  await page.waitForFunction(() => document.readyState === "complete", null, {
    timeout: navigationTimeoutMs,
  }).catch(() => {
    /* slow pages still get scanned — readiness is best-effort */
  });
  await page.waitForTimeout(750);
}

/** Collect the generic interaction surface of the current page. */
export async function collectPageSurface(
  page: Page,
  pageUrl: string,
  finalUrl: string,
): Promise<PageSurface> {
  const snapshot = await page.evaluate(snapshotPageSurface);
  const states = await page.evaluate(snapshotControlStates);
  const surface: PageSurface = {
    pageUrl,
    finalUrl,
    title: snapshot.title,
    headingCount: snapshot.headings.length,
    headings: snapshot.headings,
    landmarkRoles: [...new Set(snapshot.landmarkRoles)],
    linkCount: snapshot.linkCount,
    buttonCount: snapshot.buttonCount,
    controls: snapshot.controls.map((ref, index) => ({
      ref,
      ariaExpanded: states[index]?.ariaExpanded ?? null,
      ariaControls: states[index]?.ariaControls ?? null,
      ariaHaspopup: states[index]?.ariaHaspopup ?? null,
      ariaSelected: states[index]?.ariaSelected ?? null,
      required: states[index]?.required ?? false,
      invalid: states[index]?.invalid ?? false,
      describedBy: states[index]?.describedBy ?? "",
      inputType: states[index]?.inputType ?? "",
    })),
    dialogCount: snapshot.dialogs.length,
    dialogs: snapshot.dialogs,
    tablistCount: snapshot.tablistCount,
    tabCount: snapshot.tabCount,
    menuCount: snapshot.menuCount,
    disclosureCount: snapshot.disclosureCount,
    keyboardOrderSize: snapshot.keyboardOrderSize,
    sameOriginLinkCount: 0,
  };
  // Fail loudly on our own shape bugs — never emit malformed evidence.
  return PageSurfaceSchema.parse(surface);
}
