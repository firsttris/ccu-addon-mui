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
