# Third-party notices

Third Brain's independently authored code is MIT. The production plugin references the Obsidian host API and Node built-ins; the Obsidian/Electron host is not bundled with the release assets.

Pinned direct development dependencies, verified from installed package metadata:

| Package | Version | Declared licence |
| --- | --- | --- |
| obsidian SDK declarations | 1.13.1 | MIT |
| TypeScript | 5.9.3 | Apache-2.0 |
| Vitest | 4.1.11 | MIT |
| esbuild | 0.28.2 | MIT |
| tsx | 4.20.6 | MIT |
| @types/node | 22.18.10 | MIT |

Each dependency remains subject to its own licence and notices. The [complete lockfile inventory](docs/DEPENDENCIES.md) contains 139 entries, including optional platform variants: 121 MIT, 3 Apache-2.0, 12 MPL-2.0, 2 ISC and 1 BSD-3-Clause. Every entry has a declared licence. This is metadata inspection, not a warranty or a claim that all optional entries are installed on one platform.

Transitive packages retain their packaged notices when installed. Production builds generate an esbuild input manifest and reject inputs outside the independently authored `src/` tree; no development package implementation is bundled into the plugin. The host and Node built-ins remain external. If that invariant changes, review the new shipped source, notices and licence obligations before release.

No competitor implementation or personal-vault script is copied into the plugin.

Development/CI dependencies are not equivalent to shipped plugin runtime dependencies. Review dependency changes and bundle contents before release rather than assuming an old licence applies to a new version.
