# A11yForge — Data & Schema Specification

## 1. Purpose

This document describes the core persisted and runtime data contracts for A11yForge.

These are conceptual contracts aligned with the existing shared/Zod architecture. Exact source definitions in `packages/shared` remain authoritative.

Schemas are divided into:

- implemented exploration contracts,
- existing repair contracts,
- planned generic source-connected contracts.

---

# 2. Common identifiers

Recommended opaque string IDs:

```text
targetId
runId
pageId
elementId
probeResultId
findingId
sourceId
traceId
diagnosisId
proposalId
repairId
eventId
```

IDs must not encode secrets or absolute local filesystem paths.

---

# 3. WebTarget

```ts
type WebTarget = {
  targetId: string
  entryUrl: string
  normalizedUrl: string
  origin: string
  createdAt: string

  explorationPolicy: {
    maxPages: number
    maxActionsPerPage: number
    maxScreenshots: number
    maxDurationMs: number
    sameOriginOnly: boolean
  }
}
```

---

# 4. ExplorationRun

```ts
type ExplorationRun = {
  runId: string
  targetId: string

  status:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"

  startedAt: string
  completedAt?: string

  visitedPages: PageSummary[]
  probeResults: ProbeResult[]
  findings: AccessibilityFinding[]

  coverage: CoverageSummary

  artifacts: ArtifactRef[]
}
```

---

# 5. PageSummary

```ts
type PageSummary = {
  pageId: string
  url: string
  path: string
  title?: string

  surfaceCounts: {
    headings: number
    landmarks: number
    links: number
    buttons: number
    formControls: number
    dialogs: number
    menus: number
    tabs: number
    disclosures: number
  }

  screenshotIds: string[]
}
```

---

# 6. StableElementRef

```ts
type StableElementRef = {
  refId: string

  role?: string
  accessibleName?: string

  id?: string
  stableDataAttributes?: Record<string, string>

  domPath?: string
  ordinal?: number

  fingerprint?: string

  boundedHtml?: string

  geometry?: {
    x: number
    y: number
    width: number
    height: number
  }
}
```

Rules:
- IDs/data attributes are preferred when stable.
- Raw CSS selector is not the primary identity.
- `boundedHtml` must remain size-limited.
- Geometry is observation data, not persistent identity.

---

# 7. PageSurface

```ts
type PageSurface = {
  pageId: string
  url: string

  title?: string

  headings: SemanticNode[]
  landmarks: SemanticNode[]
  links: StableElementRef[]
  buttons: StableElementRef[]
  formControls: FormControlSurface[]
  dialogs: DialogSurface[]
  menus: SemanticNode[]
  tabs: TabSurface[]
  comboboxes: SemanticNode[]
  disclosures: DisclosureSurface[]

  keyboardOrder: StableElementRef[]
}
```

---

# 8. ProbeResult

```ts
type ProbeStatus =
  | "passed"
  | "failed"
  | "observed"
  | "not-applicable"
  | "not-tested"
  | "inconclusive"

type ProbeResult = {
  probeResultId: string
  probeId: string

  targetId: string
  pageId: string
  pageUrl: string

  status: ProbeStatus

  title: string
  humanSummary: string

  severity?: "minor" | "moderate" | "serious" | "critical"

  evidence: EvidenceItem[]
  actionTrace: BrowserActionObservation[]
  screenshotIds: string[]

  standardReferences?: StandardReference[]

  startedAt: string
  completedAt: string
}
```

---

# 9. EvidenceItem

```ts
type EvidenceItem = {
  evidenceId: string

  kind:
    | "browser-observation"
    | "focus-observation"
    | "axe-finding"
    | "assertion"
    | "source-match"
    | "build-result"
    | "test-result"

  summary: string

  elementRef?: StableElementRef
  boundedHtml?: string

  data?: Record<string, unknown>
}
```

All evidence must be:
- bounded,
- serializable,
- source-of-truth preserving,
- safe for frontend projection.

---

# 10. Browser action trace

```ts
type BrowserAction =
  | { type: "navigate"; path: string }
  | { type: "focus"; target: StableElementRef }
  | { type: "tab" }
  | { type: "shift-tab" }
  | { type: "press-key"; key: string }
  | { type: "safe-click"; target: StableElementRef }
  | { type: "inspect"; target: StableElementRef }

type BrowserActionObservation = {
  sequence: number
  action: BrowserAction
  before?: StableElementRef
  after?: StableElementRef
  timestamp: string
}
```

No model-generated JavaScript/browser scripts.

---

# 11. AccessibilityFinding

```ts
type FindingCategory =
  | "confirmed-failure"
  | "automated-finding"
  | "observation"
  | "not-tested"

type AccessibilityFinding = {
  findingId: string
  runId: string
  pageId: string

  category: FindingCategory

  title: string
  summary: string
  whyItMatters?: string

  severity?: "minor" | "moderate" | "serious" | "critical"

  evidenceIds: string[]
  reproductionPlanId?: string

  standardReferences?: StandardReference[]

  sourceRepairEligible?: boolean
}
```

---

# 12. ReproductionPlan

```ts
type ReproductionPlan = {
  reproductionPlanId: string
  runId: string
  findingId: string

  pagePath: string
  query?: string

  initialConditions: ReproductionCondition[]
  actions: BrowserAction[]
  assertions: ReproductionAssertion[]
}
```

Example assertions:

```ts
type ReproductionAssertion =
  | {
      type: "focus-contained"
      region: StableElementRef
    }
  | {
      type: "axe-rule-cleared"
      ruleId: string
      target?: StableElementRef
    }
  | {
      type: "element-has-accessible-name"
      target: StableElementRef
    }
```

Only deterministic, replayable assertions belong here.

---

# 13. CoverageSummary

```ts
type CoverageSummary = {
  pagesVisited: number
  probesExecuted: number
  probesNotApplicable: number
  interactionsNotTested: number

  automatedFindings: number
  confirmedFailures: number
  observations: number
}
```

A clean run must never imply full accessibility certification.

---

# 14. RunEvent

```ts
type RunEvent = {
  eventId: string
  runId: string
  sequence: number
  timestamp: string

  type: string
  stage: string

  status:
    | "pending"
    | "running"
    | "passed"
    | "failed"
    | "cancelled"
    | "completed"

  message: string

  metadata?: Record<string, unknown>
}
```

Metadata must be frontend-safe and bounded.

---

# 15. ArtifactRef

```ts
type ArtifactRef = {
  artifactId: string
  runId: string

  kind:
    | "json"
    | "screenshot"
    | "patch"
    | "log"

  name: string
  contentType: string

  safeUrl?: string
}
```

Never expose arbitrary local paths.

---

# 16. SourceTarget — Phase 9

```ts
type SourceTarget = {
  sourceId: string

  kind:
    | "public-git"
    | "local"

  originalReference: string

  revision?: string
  connectedAt: string

  workspaceRef: string
}
```

`workspaceRef` is internal and must not leak an absolute path to frontend clients.

---

# 17. SourceInventory — Phase 9

```ts
type SourceInventory = {
  sourceId: string
  revision?: string

  fileCount: number
  totalIndexedBytes: number

  manifests: SourceManifest[]
  lockfiles: string[]

  scripts: DeclaredScript[]

  files: SourceFileSummary[]
}
```

---

# 18. SourceFileSummary

```ts
type SourceFileSummary = {
  path: string
  sizeBytes: number
  text: boolean

  extension?: string
  ignored: boolean

  fingerprint?: string
}
```

Paths are repository-relative.

---

# 19. ExecutionProfile — Phase 9

```ts
type ExecutionCommand = {
  command: string
  source:
    | "manifest"
    | "standard-adapter"
    | "user-supplied"

  evidence?: string
}

type ExecutionProfile = {
  workingDirectory: string

  packageManager?: string

  install?: ExecutionCommand
  typecheck?: ExecutionCommand
  build?: ExecutionCommand
  tests: ExecutionCommand[]
  start?: ExecutionCommand

  readiness?: {
    type: "http"
    path?: string
    timeoutMs: number
  }
}
```

No command may have `source: "model"`.

---

# 20. SourceCandidate — Phase 9

```ts
type SourceCandidate = {
  filePath: string

  score: number

  matchedEvidenceIds: string[]
  matchedTerms: string[]

  reasons: string[]

  snippets: SourceSnippet[]
}
```

`score` is deterministic ranking metadata, not an AI probability.

---

# 21. SourceSnippet

```ts
type SourceSnippet = {
  filePath: string
  startLine: number
  endLine: number
  content: string

  matchedEvidenceIds: string[]
  matchedTerms: string[]
}
```

Source content must be bounded.

---

# 22. SourceTraceResult — Phase 9

```ts
type SourceTraceStatus =
  | "found"
  | "ambiguous"
  | "not-found"

type SourceTraceResult = {
  traceId: string
  findingId: string
  sourceId: string

  status: SourceTraceStatus

  searchTerms: SourceSearchTerm[]
  candidates: SourceCandidate[]

  selectedContext: SourceSnippet[]
}
```

Automatic repair requires `found` plus sufficiency validation.

---

# 23. AccessibilityDiagnosis

Existing conceptual contract:

```ts
type AccessibilityDiagnosis = {
  diagnosisId: string

  issueType: string
  title: string
  summary: string

  severity: string
  confidence: number

  evidenceIds: string[]

  observedFailure: string
  likelyCause: string
  recommendedRepairStrategy: string

  relevantWcagCriteria?: string[]

  needsSourceContext: boolean
}
```

Rules:
- observed fact and inference must remain separate,
- every evidence ID must exist,
- no invented source detail.

---

# 24. RepairProposal

Existing conceptual contract:

```ts
type RepairProposal = {
  proposalId: string
  diagnosisId: string

  summary: string
  rationale: string

  evidenceIds: string[]

  targetFiles: string[]

  edits: RepairEdit[]

  risks: string[]
  verificationPlan: string[]
}
```

---

# 25. RepairEdit

```ts
type RepairEdit = {
  filePath: string
  originalText: string
  replacementText: string
  reason: string
}
```

Validation:
- file supplied,
- path in root,
- anchor exists exactly once,
- replacement differs,
- edit count bounded,
- no forbidden config bypass.

---

# 26. RepairFailureFeedback

```ts
type RepairFailureFeedback = {
  proposalId: string
  repairId: string

  failedStage: string
  exitStatus?: number

  boundedErrorOutput: string

  diagnostics: {
    code?: string
    message: string
    filePath?: string
  }[]

  originalEvidenceIds: string[]
  originalEdit: RepairEdit[]
}
```

Only verifier-derived facts.

---

# 27. RepairVerificationResult

```ts
type RepairVerificationResult = {
  repairId: string
  proposalId: string

  installPassed?: boolean
  typecheckPassed?: boolean
  buildPassed?: boolean
  testsPassed?: boolean

  applicationStarted?: boolean

  originalAssertion: AssertionResult
  repairedAssertion?: AssertionResult

  targetFailureResolved: boolean

  baselineAxeRules: string[]
  repairedAxeRules: string[]
  newSeriousOrCriticalViolations: string[]

  outcome:
    | "verified"
    | "rejected"
    | "unverifiable"

  reasons: string[]

  diffArtifactId?: string
}
```

---

# 28. ModelUsage

```ts
type ModelUsage = {
  operation: string
  model: string

  inputTokens?: number
  cachedInputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  totalTokens?: number

  latencyMs?: number
  requestId?: string

  timestamp: string
}
```

Never fabricate unavailable usage fields.

---

# 29. CriticDecision

```ts
type CriticDecision = {
  decision: "ACCEPT" | "REJECT"
  confidence: number

  summary: string

  evidenceIds: string[]

  verificationConcerns: string[]
  remainingRisks: string[]
}
```

Critic is only valid after deterministic eligibility.

---

# 30. Frontend result model

The frontend should receive a reduced safe view model rather than internal artifacts wholesale.

Concept:

```ts
type FindingViewModel = {
  findingId: string

  title: string
  summary: string

  category: string
  severity?: string

  pageUrl: string

  evidenceSummary: HumanEvidenceView

  canConnectSource: boolean
}

type RepairViewModel = {
  status:
    | "creating"
    | "verifying"
    | "verified"
    | "rejected"
    | "unverifiable"

  humanMessage: string

  sourceFile?: string
  diffUrl?: string
  patchDownloadUrl?: string

  verificationChecks: {
    label: string
    status: "passed" | "failed" | "not-run"
  }[]
}
```

No secret/internal absolute paths.

---

# 31. Schema rules

1. Shared Zod schemas are runtime boundaries.
2. JSON Schema used for model constrained decoding must stay aligned with Zod.
3. Unknown model evidence references are rejected.
4. Unknown source paths are rejected.
5. Artifact schemas are versioned if incompatible changes occur.
6. Frontend projections are narrower than backend artifacts.
7. Recorded demo artifacts are explicitly marked recorded.
8. Internal filesystem paths never appear in frontend models.
