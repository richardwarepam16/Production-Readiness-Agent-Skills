---
name: accessibility-baseline
description: Audit web accessibility against WCAG 2.2 AA basics — keyboard operability, focus management, form labels, colour contrast, alt text, heading structure, ARIA misuse, modal and dialog traps, motion preferences, and the div-as-button pattern. Use before any public launch of a web UI, when the user mentions accessibility, a11y, WCAG, ADA, screen readers, or an accessibility complaint or demand letter, and whenever reviewing UI code built quickly with AI assistance since generated markup frequently omits labels and keyboard support.
---

# Accessibility baseline

Included in a pre-production audit for two reasons. It's the right thing to do — roughly one in
six people has a disability that affects how they use software. And in the US it is a live
litigation area: thousands of ADA web accessibility lawsuits are filed annually, overwhelmingly
against small businesses, and the demand letters are formulaic. The EU Accessibility Act
extends similar obligations to many consumer services in Europe.

You cannot fully automate this — automated tools catch roughly a third of WCAG issues. But that
third is cheap to find and includes the ones that most often appear in complaints.

## Run the tools first

```bash
npx @axe-core/cli https://your-app.example.com
npx lighthouse https://your-app.example.com --only-categories=accessibility
npx pa11y-ci --sitemap https://your-app.example.com/sitemap.xml
```

Add `eslint-plugin-jsx-a11y` to the lint config — it catches a good share of these at write
time, which is far cheaper than an audit. `axe-core` in a Playwright/Cypress test on key pages
prevents regressions.

Then check by hand the things tools can't see.

## The manual checks that matter most

**Keyboard only.** Put the mouse away and try to complete the core flow — sign up, do the main
thing, log out. Every interactive element must be reachable with Tab, activatable with
Enter/Space, and dismissible with Escape where relevant. This single test finds more real
problems than any scanner. Specifically look for:

- **The `<div onClick>` pattern.** A div with a click handler is invisible to keyboards and
  screen readers. It is the most common serious issue in AI-generated UI code. Use a real
  `<button>`. If you truly can't, you need `role`, `tabIndex={0}`, and both key handlers — and
  you will get some of it wrong, so use the button.
- **Focus visibility.** `outline: none` with no replacement is disqualifying — a keyboard user
  cannot see where they are. Style `:focus-visible` instead of removing focus styles.
- **Focus order** follows visual order, and nothing focusable is hidden off-screen.
- **Focus management in modals** — focus moves into the dialog on open, is trapped inside,
  returns to the trigger on close. Escape closes it. Content behind is `inert` or
  `aria-hidden`.
- **Skip link** to main content for keyboard users on nav-heavy pages.

**Forms.** Every input has a real `<label for>` (a placeholder is not a label — it disappears
on typing and often fails contrast). Errors are associated with the field via
`aria-describedby`, announced via a live region, and describe how to fix the problem rather
than just "invalid". Required fields marked programmatically, not just with a red asterisk.
Related radios and checkboxes grouped in `<fieldset>` with a `<legend>`. Autocomplete
attributes on personal-data fields.

**Colour and contrast.** 4.5:1 for body text, 3:1 for large text and for UI component
boundaries and focus indicators. Light-grey-on-white placeholder text and low-contrast disabled
states are near-universal failures. Also: never use colour as the *only* signal — a red border
with no icon or text is invisible to a colour-blind user.

**Images and media.** Meaningful images have alt text that conveys the meaning; decorative
images have `alt=""` (not a missing attribute, and not "image of…"). Icon-only buttons need an
accessible name (`aria-label`). Video needs captions; audio needs a transcript.

**Structure.** One `<h1>` per page, headings in order with no skipped levels, landmarks
(`<main>`, `<nav>`, `<header>`, `<footer>`), `<html lang="en">`, a unique descriptive
`<title>` per page. Screen reader users navigate by headings — a page of styled `<div>`s is a
featureless wall to them.

**Motion and zoom.** Respect `prefers-reduced-motion` — vestibular disorders make parallax and
large animations genuinely nauseating. Content reflows at 200% zoom and at 320px width without
horizontal scrolling. Nothing auto-plays with sound. No content flashes more than three times
per second.

**Time limits.** Session timeouts warn and can be extended. Carousels and toasts can be paused.

## ARIA

The first rule of ARIA is not to use it. A native `<button>`, `<select>`, `<details>`, or
`<dialog>` carries correct semantics and keyboard behaviour for free; the same widget built
from divs plus ARIA is usually worse. Watch for the specific failure modes: `role="button"`
without keyboard handlers, `aria-hidden="true"` on something focusable (a screen-reader user
tabs to an element that announces nothing), redundant roles (`<button role="button">`),
`aria-label` overriding perfectly good visible text so the announced name doesn't match what a
voice-control user says, and toggle state (`aria-expanded`, `aria-checked`) that never updates.

## Screen reader spot-check

Fifteen minutes on the main flow with VoiceOver (⌘F5 on macOS), NVDA (free, Windows), or
TalkBack. You don't need expertise — just notice whether you can tell what's happening. Buttons
announced as "button" with no name, forms where you can't tell which field you're in, and
"clickable" divs are all immediately obvious.

## Reporting

Group by page and flow rather than by rule, and lead with anything that makes a core task
impossible — those are both the worst harm and the ones cited in demand letters. Severity here
maps to blocking-ness: *cannot complete signup with a keyboard* is P1 in this repo's rubric
(P0 if you're contractually or statutorily bound to a standard, e.g. selling to government).
Contrast tweaks and missing landmarks are P2.

If the user wants to publish an accessibility statement, note that it should describe the
actual current state and a remediation timeline — an overclaiming statement is a written
admission in a complaint. Overlay widgets that promise one-line ADA compliance do not work,
have been the subject of FTC action and hundreds of lawsuits against sites using them, and
should be recommended against.
