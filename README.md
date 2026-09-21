# @serkanalgur/opencodev2-notification

[![npm version](https://img.shields.io/npm/v/@serkanalgur/opencodev2-notification.svg)](https://www.npmjs.com/package/@serkanalgur/opencodev2-notification)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenCode Plugin](https://img.shields.io/badge/OpenCode-V2%20Plugin-blue.svg)](https://opencode.ai)
[![GitHub stars](https://img.shields.io/github/stars/serkanalgur/opencodev2-notification)](https://github.com/serkanalgur/opencodev2-notification/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/serkanalgur/opencodev2-notification)](https://github.com/serkanalgur/opencodev2-notification/issues)

> Native OS notifications for OpenCode V2

A CLI plugin for [OpenCode V2](https://opencode.ai) that delivers native OS notifications when tasks complete, errors occur, or the AI needs your input.

## Why This Exists

You delegate a task and switch to another window. Now you're checking back every 30 seconds. Did it finish? Did it error? Is it waiting for permission?

This plugin solves that:

- **Stay focused** - Work in other apps. A notification arrives when the AI needs you.
- **Uses OpenCode's built-in attention API** - Native notifications on all platforms
- **Smart defaults** - Won't spam you. Only notifies for meaningful events with parent-session filtering and quiet-hours support.
- **Lightweight** - Event-driven, no tools added to your conversation

## Installation

```bash
opencode plugin add @serkanalgur/opencodev2-notification
```

### Via opencode.json

Add to your `opencode.json` or `opencode.jsonc`:

```jsonc
{
  "plugins": ["@serkanalgur/opencodev2-notification"]
}
```

### As a local plugin

Or copy the plugin files to your `.opencode/plugins/` directory:

```
.opencode/plugins/notification/index.ts
```

## How It Works

> "Notify the human when the AI needs them back, not for every micro-event."

| Event | Notifies? | Sound | Why |
|-------|-----------|-------|-----|
| Session complete | Yes | done | Main task done - time to review |
| Session error | Yes | error | Something broke - needs attention |
| Permission needed | Yes | permission | AI is blocked, waiting for you |
| Sub-task complete/error | No (default) | - | Set `notifyChildSessions: true` to include child sessions |

The plugin automatically:

1. Uses OpenCode's built-in `attention.notify()` API for native notifications
2. Only notifies when terminal is not focused (no spam while you're working)
3. Deduplicates rapid-fire notifications

## Platform Support

| Platform | Method | Status |
|----------|--------|--------|
| **macOS** | Notification Center | ✅ Full support |
| **Windows** | Toast notifications | ✅ Full support |
| **Linux** | Desktop notifications | ✅ Full support |

## Configuration (Optional)

Works out of the box. To customize, create `~/.config/opencode/opencodev2-notification.json`:

```json
{
  "notifyChildSessions": false,
  "sounds": {
    "idle": "done",
    "error": "error",
    "permission": "permission"
  },
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "08:00"
  }
}
```

### Configuration Keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `notifyChildSessions` | boolean | `false` | Include child/sub-session notifications |
| `sounds.idle` | string | `"done"` | Sound for session complete |
| `sounds.error` | string | `"error"` | Sound for errors |
| `sounds.permission` | string | `"permission"` | Sound for permission requests |
| `quietHours.enabled` | boolean | `false` | Enable quiet hours |
| `quietHours.start` | string | `"22:00"` | Quiet hours start (HH:MM) |
| `quietHours.end` | string | `"08:00"` | Quiet hours end (HH:MM) |

### Available Sound Names

`default`, `question`, `permission`, `error`, `done`, `subagent_done`

## FAQ

### Does this add bloat to my context?

Minimal footprint. The plugin is event-driven - it listens for session events and fires notifications. No tools are added to your conversation.

### Will I get spammed with notifications?

No. Smart defaults prevent noise:

- Only notifies for parent sessions (not every sub-task)
- Supports quiet-hours suppression
- Only notifies when terminal is not focused
- Deduplication prevents rapid-fire notifications

### Can I disable it temporarily?

Remove the plugin from your `opencode.json` or delete the plugin files.

## Credits

Inspired by [opencode-notify](https://github.com/kdcokenny/opencode-notify) by [kdcokenny](https://github.com/kdcokenny).

## License

MIT
