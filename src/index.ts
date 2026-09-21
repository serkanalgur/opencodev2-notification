/**
 * opencodev2-notification — server entry
 *
 * The notification logic lives in ./tui.ts (a CLI/TUI plugin that requires the
 * client-side `attention` API). This server entry is loaded when the package is
 * listed in opencode.json(c) `plugins`, but it intentionally does nothing:
 * `attention` is only available on the TUI client, so the real plugin must be
 * loaded as a CLI plugin via cli.json → plugins → ./tui.
 */
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "opencodev2-notification.server",
  setup() {
    // No-op: the client-side plugin in ./tui does the work.
  },
})