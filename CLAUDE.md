# Notes for Claude

## Reference implementation: OpenCCU

Base every CCU feature on how the original WebUI does it, taken from the
OpenCCU sources, not from memory:

- https://github.com/OpenCCU/OpenCCU: the patched WebUI files
  (`buildroot-external/package/openccu-base/rootfs-patches/*/rootfs/www/...`)
- https://github.com/OpenCCU/OpenCCU-Base: the complete WebUI
  (`www/webui/webui.js`, `www/config/easymodes/**`, `www/rega/esp/controls/*.fn`)

Clone them shallowly (`git clone --depth 1`) and look up datapoint names,
enum values, ReGa scripts and XML-RPC calls there. Name the source file in
comments and commit messages where it settles a detail (e.g. "as in the
WebUI's door_opener.fn").

## Reference implementation: openccu-lite

The same for the openccu-lite build: base it on the sources, not on memory.

- https://github.com/hobbyquaker/openccu-lite: the system around it
  (`docs/porting-from-rega.md`, `docs/addons.md`, `docs/known-issues.md`)
- https://github.com/hobbyquaker/occulited: the APIs MUI talks to, meta,
  lite-rpc, system and auth (`docs/meta-api.md`, `docs/meta-format.md`,
  `docs/system-api.md`, `docs/manifest-format.md`, and as specifications
  `docs/openapi.json`, `docs/asyncapi.json`, `docs/lite-rpc-methods.json`)

Clone them shallowly as well and look up endpoints, fields, scopes and event
kinds there; name the source file where it settles a detail.

## Pull requests

One feature per PR, and each PR carries only its own commits: after a PR is
merged, reset the working branch to the current `origin/main`
(`git fetch origin main && git checkout -B <branch> origin/main`, then
`git push --force-with-lease -u origin <branch>`) before starting the next
change. Never merge `main` into the branch, so earlier, already merged
commits don't show up again in the next PR.

## Code style

Functional, not object-oriented: pure functions (data in, data out),
function tables instead of long `switch`es, no classes, no new interfaces
where passing a function will do. TypeScript: hooks and function
components.

- A file does one thing; split by domain once it grows past ~400 lines,
  a component or function past ~150 (Go: ~70).
- Pure logic goes next to its component in a `*Model.ts` with unit
  tests; hooks in `use*.ts`.
- Code only the CCU needs goes in files with `//go:build !lite`; shared
  files reach the ReGa through `rega_ccu.go`/`rega_lite.go`.
- A refactor changes no behavior. Prove it: a sorted line diff for moves,
  the markup or screenshots before and after for components
  (`visual.spec.ts`, or a temporary snapshot test with fixed data and time).
- Biome, `tsc`, `staticcheck` (both builds) and the tests stay green;
  a `biome-ignore` says why the code is right as it is.
