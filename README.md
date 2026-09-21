# @serkanalgur/opencodev2-notification

> Native OS notifications for OpenCode V2

A plugin for [OpenCode V2](https://opencode.ai) that delivers native OS notifications when tasks complete, errors occur, or the AI needs your input.

## Why This Exists

You delegate a task and switch to another window. Now you're checking back every 30 seconds. Did it finish? Did it error? Is it waiting for permission?

This plugin solves that:

- **Stay focused** - Work in other apps. A notification arrives when the AI needs you.
- **Zero dependencies** - Uses only built-in OS APIs (osascript, PowerShell, notify-send)
- **Native OS notifications** - macOS Notification Center, Windows Toast, Linux Desktop Notifications
- **Smart defaults** - Won't spam you. Only notifies for meaningful events with parent-session filtering and quiet-hours support.

## Installation

```bash
npm install @serkanalgur/opencodev2-notification
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
| Session complete | Yes | Glass | Main task done - time to review |
| Session error | Yes | Basso | Something broke - needs attention |
| Permission needed | Yes | Submarine | AI is blocked, waiting for you |
| Question asked | Yes | Submarine (default) | Questions should always reach you promptly |
| Sub-task complete/error | No (default) | - | Set `notifyChildSessions: true` to include child sessions |

The plugin automatically:

1. Detects your terminal emulator
2. Suppresses notifications when your terminal is focused on macOS
3. Enables click-to-focus on macOS (click notification → terminal foregrounds)

Question notifications bypass macOS focus suppression so direct prompts are not missed.

## Zero Dependencies - Pure Native!

This plugin uses **built-in OS APIs** only. No external packages to install!

| Platform | Method | Requirements |
|----------|--------|--------------|
| **macOS** | `osascript` (AppleScript) | Built into macOS since 10.0 |
| **Windows** | PowerShell Toast/BalloonTip | Built into Windows 7+ |
| **Linux** | `notify-send` / `dbus-send` | Pre-installed on most desktop distros |

### How It Works

- **macOS:** Uses `osascript -e 'display notification ...'` - native Notification Center
- **Windows:** Uses PowerShell with .NET Toast notifications (or BalloonTip fallback)
- **Linux:** Uses `notify-send` (or `dbus-send` as fallback for minimal systems)

## Platform Support

| Feature | macOS | Windows | Linux |
|---------|-------|---------|-------|
| Native OS notifications | Yes | Yes | Yes |
| Custom sounds | Yes | No | No |
| Focus detection | Yes | No | No |
| Click-to-focus | Yes | No | No |

## Configuration (Optional)

Works out of the box. To customize, create `~/.config/opencode/opencodev2-notification.json`:

```json
{
  "notifyChildSessions": false,
  "timeout": 0,
  "terminal": "ghostty",
  "sounds": {
    "idle": "Glass",
    "error": "Basso",
    "permission": "Submarine",
    "question": "Submarine"
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
| `timeout` | number | `0` | Seconds before notification disappears (0 = no timeout) |
| `terminal` | string | auto-detect | Override terminal auto-detection |
| `sounds.idle` | string | `"Glass"` | Sound for session complete |
| `sounds.error` | string | `"Basso"` | Sound for errors |
| `sounds.permission` | string | `"Submarine"` | Sound for permission requests |
| `sounds.question` | string | `"Submarine"` | Sound for questions |
| `quietHours.enabled` | boolean | `false` | Enable quiet hours |
| `quietHours.start` | string | `"22:00"` | Quiet hours start (HH:MM) |
| `quietHours.end` | string | `"08:00"` | Quiet hours end (HH:MM) |

### Available macOS Sounds

Basso, Blow, Bottle, Frog, Funk, Glass, Hero, Morse, Ping, Pop, Purr, Sosumi, Submarine, Tink

## FAQ

### Does this add bloat to my context?

Minimal footprint. The plugin is event-driven - it listens for session events and fires notifications. No tools are added to your conversation.

### Will I get spammed with notifications?

No. Smart defaults prevent noise:

- Only notifies for parent sessions (not every sub-task)
- Supports quiet-hours suppression
- Suppresses when your terminal is the active window on macOS
- Deduplication prevents rapid-fire notifications

### Can I disable it temporarily?

Remove the plugin from your `opencode.json` or delete the plugin files.

## Credits

Inspired by [opencode-notify](https://github.com/kdcokenny/opencode-notify) by [kdcokenny](https://github.com/kdcokenny).

## License

MIT
