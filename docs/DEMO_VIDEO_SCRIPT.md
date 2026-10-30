# A11yForge — Hackathon Demo Video Walkthrough Script

**Target Duration:** 2 minutes 40 seconds  
**Target Event:** Meta Global AI Developer Hackathon (Indie Developer Track — *Push the Frontier*)  
**Speaker/Author:** Amirtheshwaran Navaneethakrishnan  

---

### 0:00–0:12 — Hook

**SCREEN**
- A11yForge landing page (`http://localhost:3000`).
- Slow, cinematic movement on the website hero chassis.
- Enter a real website URL into the exploration input.

**NARRATION**
> *"Most accessibility tools can tell you that something is wrong.*  
> *A11yForge goes further.*  
> *It finds the problem in a real browser, connects that evidence back to the code, proposes a repair, and refuses to call it fixed until it proves it."*

---

### 0:12–0:32 — Scan a real website

**SCREEN**
- Click **Check my website**.
- Live exploration starts with real-time SSE stage progression:
  1. Opening your website
  2. Looking for problems
  3. Checking keyboard use
  4. Reviewing results
- Results view loads with mapped element markers and categories.

**NARRATION**
> *"I can give A11yForge a real website.*  
> *The browser exploration itself is deterministic. It uses real page structure, accessibility checks, keyboard interactions, screenshots, and element geometry.*  
> *The AI does not invent what happened in the browser."*

---

### 0:32–0:53 — Understand the problem

**SCREEN**
- Results view with the website as the central hero object.
- Select a category chip (Keyboard, Forms, Images, Readability).
- Choose a specific finding card.
- Click **Show me**.
- Camera zooms and frames the exact affected element on the 3D plane without distortion.

**NARRATION**
> *"Instead of giving users a wall of accessibility jargon, A11yForge shows the problem directly on the website.*  
> *Here, it can explain something as simply as:*  
> *'This button has no name.'*  
> *And 'Show me' takes you directly to the affected element.*  
> *Technical evidence is still available under Developer details."*

---

### 0:53–1:15 — Connect runtime evidence to source

**SCREEN**
- Navigate to the Source Connection view (`/connect`).
- Two-plane showroom: the website moves left, the source code appears on the right.
- Visual connection linking the browser element to responsible source code lines.

**NARRATION**
> *"Once source code is available, A11yForge connects what happened in the browser with the implementation behind it.*  
> *This is where Meta's models become part of the repair loop.*  
> *The model receives bounded browser and source evidence, diagnoses the failure, and proposes a small anchored repair.*  
> *It doesn't get to invent browser facts, source files, or decide whether its own fix worked."*

---

### 1:15–1:35 — First repair

**SCREEN**
- Switch to the recorded real repair demo theatre (`/console`).
- Timeline progression: **Problem → Code → First fix**.
- Show the first generated unified code diff.

**NARRATION**
> *"This is a recorded real repair from A11yForge.*  
> *A Meta model diagnosed a keyboard-focus failure and proposed a fix.*  
> *And in the browser, the first fix actually improved the behavior.*  
> *But there was a problem."*

---

### 1:35–1:55 — The killer moment (Self-Rejection)

**SCREEN**
- Timeline advances to: **Rejected**.
- Prominent badge/notice: **"That fix wasn't good enough."**
- Expand the Developer details drawer to reveal the strict TypeScript compilation failure (`TS18048`).

**NARRATION**
> *"The repair failed strict TypeScript validation.*  
> *So A11yForge rejected its own AI-generated fix.*  
> *The model was not allowed to declare success just because the browser looked better.*  
> *Instead, the compiler failure became evidence for exactly one bounded revision."*

---

### 1:55–2:15 — Revision and verification

**SCREEN**
- Timeline advances: **Revision → Verified**.
- Show the corrected patch code.
- Playwright replays the original keyboard interaction.
- Show the clean focus path inside the modal.
- The defect marker turns green / disappears.

**NARRATION**
> *"The revised repair passed the project checks.*  
> *Then A11yForge replayed the exact interaction that originally failed, checked the reverse keyboard path, and ran accessibility regression checks.*  
> *Only after those deterministic gates passed was the repair accepted."*

---

### 2:15–2:28 — Meta architecture

**SCREEN**
- Brief clean architecture flow:
  ```text
  Browser evidence
         ↓
  Meta diagnosis
         ↓
  Source evidence
         ↓
  Meta repair
         ↓
  Build + replay
         ↓
  Bounded revision
         ↓
      Verified
  ```

**NARRATION**
> *"Meta models provide the reasoning, diagnosis, repair proposal, revision, and critique.*  
> *Deterministic tools provide the evidence and the final proof.*  
> *That separation is the core of A11yForge."*

---

### 2:28–2:40 — Finish

**SCREEN**
- Return to the brand mark:
  **"Fixed. Checked. Proven."**
- Final A11yForge hero frame.

**NARRATION**
> *"A11yForge doesn't just ask AI to fix accessibility.*  
> *It gives AI evidence, tests what it creates, rejects bad fixes, and proves the result.*  
> *Find it. Fix it. Prove it."*
