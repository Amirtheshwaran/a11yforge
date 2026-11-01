---
title: A11yForge
emoji: 🔎
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
short_description: Finds accessibility failures in a real browser.
---

# A11yForge

A11yForge observes accessibility failures in a real browser, uses Meta models to
reason about bounded repairs, and refuses to call a fix successful until
deterministic replay verifies it.

Source, documentation and limitations:
https://github.com/Amirtheshwaran/a11yforge

This Space runs website scans and the recorded repair. It holds no model key, so
it makes no model calls. The repair shown here is a recorded real run against a
controlled target, not a live repair of the website you scan.
