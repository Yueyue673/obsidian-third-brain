# Project work rules

This is a new general-purpose open-source Obsidian plugin, not a copy of any private vault.

- Read PRODUCT-SPINE.md before changes. All changes must trace to its numbered requirements, a reproduced bug, or an adjacent quality gap in the same user journey.
- Work only inside this repository and explicitly designated scratch/test directories. Never read, edit, rename, move or delete the user's real vault, source notes, chats, server files or credentials.
- Publish only code, public technical research, documentation and clearly synthetic examples. No personal paths, server IPs, transcript passages, names from private chats, real emails, API keys, tokens or local state in git or release assets.
- Do not copy third-party implementations. Cite official documentation and respect dependency licences. New code is MIT.
- The AI edits a distinct owned derived layer; it is not the original author. Never overwrite user-authored files, even inside the configured generated folder.
- Model inputs are untrusted data. The model cannot name output paths, execute tools, write frontmatter, make network requests, delete files or assert provenance. Validate strict output and exact quotation evidence locally.
- Cloud usage is opt-in. Local/private data never goes to a cloud endpoint. Never log note bodies, questions or secrets. Secrets belong to the host's secret storage, not plugin data.json.
- Do not use OS monitoring, click/dwell tracking, keystroke analysis or default behaviour profiling. Quiet periodic refresh runs only while Obsidian is open.
- Preserve user files during failures, cancellation and source changes. Transaction/journal state must be validated and constrained to owned paths; corrupted state fails closed.
- Implement vertical slices, not stubs. Run typecheck, tests, production build and a real end-to-end smoke path. Report implemented versus live-verified separately.
- Use actual product screenshots or clearly labelled test-harness screenshots, never a fabricated UI. Keep Chinese/English install instructions and limitations accurate.
- Do not claim GitHub CI, publishing or downloads succeeded without reading the exact remote target back.
- No automatic purchases, subscription changes, account registration or external-server deployment.
- For ongoing improvement, one evidenced change per iteration, regression proof, full gates, privacy scan and honest changelog. Do not generate pointless commits to look busy.
