# Design direction

Third Brain is a quiet Obsidian surface, not a second notes application. Native host CSS variables, flat lists and source quotations carry the hierarchy. No independent brand font, dashboard metric wall, graph hero, auto-popup or automatic source insertion.

## Main path

Idea → optional low/medium/high breadth → Find connections → explanation → evidence → Open original. Current-note context is an explicit one-time snapshot. Facet buttons are alternate inputs in the same surface, not a second search system.

## States

| State | Evidence | Primary action | Recovery |
| --- | --- | --- | --- |
| First use | No indexed fragments | Refresh notes | Synthetic demo instructions in the README |
| Ready | Source/fragment count and last generation time | Find connections | Change idea or refresh |
| Indexing | Completed/total source count | Cancel | Previous complete revision remains usable |
| Searching | Actual controller task | Cancel | Input remains in the panel |
| No match | Zero evidence-supported candidates | Add context | No fabricated cards |
| Changed source | Hash/quote check rejects stale evidence | Refresh notes | Original is never rewritten |
| Model/network failure | Generic safe error, no raw provider echo | Check settings or use local excerpts | No silent semantic fallback |
| Protected-file conflict | Store refuses unowned/human-edited output | Review the generated layer | Original and edited file remain untouched |
| Invalid state | Strict load/recovery failure | Review state/backup | No empty-state rebuild over corrupt data |

## Presentation contract

One primary button; processing/scheduling controls live in host settings. Headings name results, not internal layers. Narrow panels wrap text and controls; keyboard focus is visible. Status changes use a polite live region; errors use an alert. No motion is needed. Screenshots must show the real renderer; browser-harness captures are explicitly labelled as harness captures rather than Obsidian captures.

## Benchmark roles

- Smart Connections: quick related-note discovery; do not reproduce its branding or implementation.
- Obsidian sample plugin and developer docs: host settings, sidebar lifecycle and release shape; do not leave sample/demo code in the production bundle.
- Copilot / Smart Second Brain: model configuration and retrieval boundaries; do not turn this plugin into a general chat assistant or copy their code.

Sources and licensing observations are in `docs/RESEARCH.md`.
