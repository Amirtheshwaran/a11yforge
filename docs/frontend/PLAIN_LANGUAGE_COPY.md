# A11yForge Plain Language Copy Dictionary

A11yForge enforces the Eight-Year-Old Rule: every primary user-facing string must be directly explainable without technical jargon. Technical terms (rules, ASTs, CDP traces, WCAG criteria) are strictly relegated to the collapsible **Developer details** drawer.

---

## 1. Primary Rule Translations

| Axe / Technical Rule | Primary Headline | User Explanation |
| :--- | :--- | :--- |
| `button-name` | This button has no name. | Someone using a screen reader may not know what this button does. |
| `image-alt` | This picture has no description. | Screen readers cannot tell what this image shows. |
| `color-contrast` | This text is hard to read. | The text is too faint against its background for people with low vision. |
| `label` | This field does not explain what to type. | People using assistive technology cannot tell what information this input needs. |
| `keyboard-traversal` | Keyboard focus is trapped or lost. | Someone using a keyboard without a mouse cannot navigate out of this section. |
| `landmark-one-main` | The main part of the page is hard to find. | Screen-reader users cannot jump straight to the page's primary content. |
| `link-name` | This link has no text. | People cannot tell where this link leads. |

---

## 2. Experience Stage Copy

- **Landing:**
  - Headline: *See where your website is hard to use.*
  - Supporting: *A11yForge checks your website in a real browser, shows exactly where people may have trouble, and can repair supported problems.*
  - CTA: *Check my website*
  - Trust: *Real browser testing · No account required*

- **Scanning:**
  - Headline: *Checking your website*
  - Supporting: *A11yForge is looking for problems that can make this website difficult to use.*
  - Stages:
    1. *Opening your website*
    2. *Looking for problems*
    3. *Checking keyboard use*
    4. *Reviewing results*

- **Results:**
  - Headline: *We found 12 problems.*
  - Supporting: *2 should be fixed first to make sure everyone can actually use your site.*
  - Actions: *Review problems · Check another site*

- **Rejection Moment:**
  - Headline: *That fix wasn't good enough.*
  - Supporting: *The website behavior improved, but the project failed one of its checks.*
  - Action: *A11yForge will try one careful revision using that failure.*

- **Verification:**
  - Headline: *Fixed. Checked. Proven.*
  - Supporting: *A11yForge replayed the original problem and confirmed that it no longer happens.*
