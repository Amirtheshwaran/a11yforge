import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ModelCallBudget,
  ModelCallBudgetExhaustedError,
} from "./budget.js";

describe("ModelCallBudget", () => {
  it("allows calls up to the cap", () => {
    const budget = new ModelCallBudget(1);
    budget.consume();
    assert.equal(budget.usedCalls, 1);
    assert.equal(budget.remainingCalls, 0);
  });

  it("refuses any call beyond the cap instead of spending credits", () => {
    const budget = new ModelCallBudget(1);
    budget.consume();
    assert.throws(
      () => budget.consume(),
      (error: unknown) => error instanceof ModelCallBudgetExhaustedError,
    );
  });

  it("rejects a non-positive cap", () => {
    assert.throws(() => new ModelCallBudget(0));
    assert.throws(() => new ModelCallBudget(-1));
  });
});
