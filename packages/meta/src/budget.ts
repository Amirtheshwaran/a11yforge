/**
 * Hard model-call budget.
 *
 * Every diagnosis run owns one budget. Each paid request consumes one unit;
 * anything beyond the cap throws instead of spending credits. There is no
 * autonomous retry loop: transport/API errors are reported, and malformed or
 * invalid model results fail rather than silently triggering another request.
 */
export class ModelCallBudgetExhaustedError extends Error {
  constructor(maxCalls: number) {
    super(
      `Model call budget exhausted (max ${maxCalls} per run): refusing another paid request.`,
    );
    this.name = "ModelCallBudgetExhaustedError";
  }
}

export class ModelCallBudget {
  private used = 0;

  constructor(private readonly maxCalls: number) {
    if (!Number.isInteger(maxCalls) || maxCalls < 1) {
      throw new Error(
        `ModelCallBudget requires a positive integer cap, got: ${maxCalls}`,
      );
    }
  }

  /** Consume one call. Throws when the budget is already spent. */
  consume(): void {
    if (this.used >= this.maxCalls) {
      throw new ModelCallBudgetExhaustedError(this.maxCalls);
    }
    this.used += 1;
  }

  get usedCalls(): number {
    return this.used;
  }

  get remainingCalls(): number {
    return this.maxCalls - this.used;
  }
}
