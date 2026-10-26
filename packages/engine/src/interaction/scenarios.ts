import {
  ScenarioDefinitionSchema,
  type ScenarioDefinition,
} from "@a11yforge/shared";

/**
 * Phase 2 keyboard scenario definitions (data-driven, no runner rewrites
 * needed to select a scenario — later phases pick by id).
 */

/** Modal region every keyboard scenario asserts containment against. */
export const CHECKOUT_MODAL_SELECTOR = "#checkout-modal";

/** Selector of the button that opens the checkout modal. */
export const PROCEED_TO_CHECKOUT_SELECTOR = ".proceed-to-checkout";

/** How many Tab presses the checkout scenario attempts (bounded). */
export const CHECKOUT_TAB_PRESSES = 10;

function tabPresses(count: number): ScenarioDefinition["steps"] {
  return Array.from({ length: count }, () => ({
    kind: "press",
    key: "Tab",
  }) as const);
}

/**
 * `checkout-modal-keyboard`: open the checkout dialog, then repeatedly press
 * Tab. The fixture deliberately has no focus trap, so focus deterministically
 * walks out onto `#background-control` while the modal stays open and the
 * `focus-contained-in-modal` assertion fails with evidence.
 */
export const CHECKOUT_MODAL_KEYBOARD: ScenarioDefinition =
  ScenarioDefinitionSchema.parse({
    id: "checkout-modal-keyboard",
    description:
      "Open the checkout modal and press Tab until focus leaves the dialog.",
    modalSelector: CHECKOUT_MODAL_SELECTOR,
    steps: [
      { kind: "screenshot", name: "before-modal.png" },
      { kind: "click", selector: PROCEED_TO_CHECKOUT_SELECTOR },
      { kind: "wait-for", selector: CHECKOUT_MODAL_SELECTOR },
      { kind: "screenshot", name: "modal-open.png" },
      ...tabPresses(CHECKOUT_TAB_PRESSES),
    ],
  });

const REGISTRY: Record<string, ScenarioDefinition> = {
  [CHECKOUT_MODAL_KEYBOARD.id]: CHECKOUT_MODAL_KEYBOARD,
};

/** Look up a scenario by id (throws on unknown ids — never silently empty). */
export function getScenario(id: string): ScenarioDefinition {
  const scenario = REGISTRY[id];
  if (!scenario) {
    throw new Error(
      `Unknown keyboard scenario: ${id} (known: ${Object.keys(REGISTRY).join(", ")})`,
    );
  }
  return scenario;
}
