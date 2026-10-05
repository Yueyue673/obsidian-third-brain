# Troubleshooting / 排障

## No first-run results

Refresh notes once. An empty vault has no prior personal material to retrieve. If notes are excluded, too sparse or missing readable content, no fragment is the correct result. The plugin does not fabricate examples in your vault.

先更新一次；没有原始资料时，不会凭空生成你的知识。合成示例需要你明确选用。

## No match for an idea

Add context or use a different idea. Local excerpts compare text and existing facets, not arbitrary semantics. For semantic interpretation, configure a supported model intentionally. High breadth cannot force a result from unrelated material.

## Model request did not complete

Check mode, exact endpoint/model, cloud consent and secret selection. Local mode accepts loopback destinations; cloud mode needs HTTPS and a secret. Redirects, oversized replies, timeout, malformed JSON, unknown fields and unsupported quotations are rejected. No raw remote response is printed. Switching to local excerpts is explicit, not a hidden downgrade.

## Refresh cancelled or failed

The last complete index remains available. Retry after checking settings and source stability. Editing an original during processing can cause source verification to reject that batch; your edit is not overwritten.

## Source changed or disappeared

Refresh before opening an old quotation. Stale evidence is filtered, not presented as a live citation. The plugin never guesses another file based on a shared basename.

## Protected-file conflict

Files are not owned merely because they are under the generated folder. A manual file, human-edited generated file, invalid ownership record or unsafe link blocks overwriting. Preserve the file and inspect the conflict in a disposable copy. Do not reset state just to force the write.

## Invalid index or recovery

Corrupt/unknown-version state fails closed. Keep the entire generated layer and its hidden history intact for diagnosis in a copy. Do not attach it publicly if it contains real note text. The plugin does not automatically treat corrupt state as empty.

## Scheduled updates never run

Obsidian must be open and the schedule must be Daily or Weekly. Manual is the default. A successful refresh records when maintenance ran, even when note content did not change.

## Long current note

Select a shorter passage, then choose Use current note. The explicit context input is bounded; it is not a background stream of your editor.

## Safe bug report

Use a synthetic note and relative path, plugin version, desktop app version, processing mode and the action that failed. Never paste a key, a credential-bearing URL, a private query, your real vault or generated history. See [SECURITY.md](../SECURITY.md).
