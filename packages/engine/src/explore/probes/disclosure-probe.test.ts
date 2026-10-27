import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { disclosureProbe, safetyVerdict } from "./disclosure-probe.js";

function candidate(overrides = {}) {
  return {
    selector: "button[aria-expanded][0]",
    label: "Menu",
    tag: "button",
    inputType: "",
    inForm: false,
    explicitButtonType: true,
    isSubmitter: false,
    expanded: "false",
    controlsId: "menu-1",
    controlledExists: true,
    controlledVisible: false,
    hasPopup: "true",
    ...overrides,
  };
}

describe("disclosure safetyVerdict", () => {
  it("refuses submitters that could change data", () => {
    const verdict = safetyVerdict(candidate({ isSubmitter: true }));
    assert.equal(verdict.safe, false);
    assert.match(verdict.reason, /submit/);
  });

  it("refuses untyped buttons inside forms (implicit submit)", () => {
    const verdict = safetyVerdict(candidate({ inForm: true, explicitButtonType: false }));
    assert.equal(verdict.safe, false);
  });

  it("refuses controls with no resolvable disclosure relationship", () => {
    const verdict = safetyVerdict(
      candidate({ controlsId: null, controlledExists: false, hasPopup: null }),
    );
    assert.equal(verdict.safe, false);
  });

  it("allows popup semantics outside forms", () => {
    const verdict = safetyVerdict(candidate({}));
    assert.equal(verdict.safe, true);
  });

  it("allows explicitly typed buttons inside forms with a controlled target", () => {
    const verdict = safetyVerdict(
      candidate({ inForm: true, explicitButtonType: true, hasPopup: null }),
    );
    assert.equal(verdict.safe, true);
  });
});

describe("disclosure probe applicability", () => {
  it("applies only when expanded-state semantics were discovered", () => {
    const base = {
      pageUrl: "https://example.com/",
      finalUrl: "https://example.com/",
      title: "",
      headingCount: 0,
      headings: [],
      landmarkRoles: [],
      linkCount: 0,
      buttonCount: 0,
      controls: [],
      dialogCount: 0,
      dialogs: [],
      tablistCount: 0,
      tabCount: 0,
      menuCount: 0,
      disclosureCount: 0,
      keyboardOrderSize: 0,
      sameOriginLinkCount: 0,
    };
    assert.equal(disclosureProbe.applicable(base), false);
    assert.equal(disclosureProbe.applicable({ ...base, disclosureCount: 2 }), true);
  });
});
