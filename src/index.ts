/**
 * opencodev2-notification
 * Native OS notifications for OpenCode V2
 *
 * Philosophy: "Notify the human when the AI needs them back, not for every micro-event."
 *
 * Features:
 * - Native OS notifications on macOS, Windows, and Linux
 * - Auto-detects terminal emulator for click-to-focus (macOS)
 * - Suppresses notifications when terminal is focused (macOS)
 * - Parent session only by default (no spam from sub-tasks)
 * - Quiet hours support
 * - Configurable sounds per event type
 *
 * Notification paths:
 * - macOS: alerter (native Notification Center)
 * - Windows: node-notifier (toast notifications)
 * - Linux: node-notifier (notify-send)
 */

import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Plugin } from "@opencode/plugin"
import type { Event } from "@opencode/plugin"

// ==========================================
// TYPES
// ==========================================

interface NotifyConfig {
  /** Notify for child/sub-session events (default: false) */
  notifyChildSessions: boolean
  /** Seconds before a desktop notification disappears (default: 0, no timeout) */
  timeout: number
  /** Sound configuration per event type */
  sounds: {
    idle: string
    error: string
    permission: string
    question?: string
  }
  /** Quiet hours configuration */
  quietHours: {
    enabled: boolean
    start: string // "HH:MM" format
    end: string // "HH:MM" format
  }
  /** Override terminal detection (optional) */
  terminal?: string
}

interface TerminalInfo {
  name: string | null
  bundleId: string | null
  processName: string | null
}

// ==========================================
// DEFAULT CONFIGURATION
// ==========================================

const DEFAULT_CONFIG: NotifyConfig = {
  notifyChildSessions: false,
  timeout: 0,
  sounds: {
    idle: "Glass",
    error: "Basso",
    permission: "Submarine",
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00",
  },
}

// Terminal name to macOS process name mapping (for focus detection)
const TERMINAL_PROCESS_NAMES: Record<string, string> = {
  ghostty: "Ghostty",
  kitty: "kitty",
  iterm: "iTerm2",
  iterm2: "iTerm2",
  wezterm: "WezTerm",
  alacritty: "Alacritty",
  terminal: "Terminal",
  apple_terminal: "Terminal",
  hyper: "Hyper",
  warp: "Warp",
  vscode: "Code",
  "vscode-insiders": "Code - Insiders",
}

// ==========================================
// CONFIGURATION LOADING
// ==========================================

async function loadConfig(): Promise<NotifyConfig> {
  const configPath = path.join(
    os.homedir(),
    ".config",
    "opencode",
    "opencodev2-notification.json"
  )

  try {
    const content = await fs.readFile(configPath, "utf8")
    const userConfig = JSON.parse(content) as Partial<NotifyConfig>

    // Validate timeout
    const configuredTimeout = userConfig.timeout
    let timeout = DEFAULT_CONFIG.timeout
    if (
      typeof configuredTimeout === "number" &&
      Number.isFinite(configuredTimeout) &&
      configuredTimeout >= 0
    ) {
      timeout = configuredTimeout
    }

    // Merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
      timeout,
      sounds: {
        ...DEFAULT_CONFIG.sounds,
        ...userConfig.sounds,
      },
      quietHours: {
        ...DEFAULT_CONFIG.quietHours,
        ...userConfig.quietHours,
      },
    }
  } catch {
    // Config doesn't exist or is invalid, use defaults
    return DEFAULT_CONFIG
  }
}

// ==========================================
// TERMINAL DETECTION (macOS)
// ==========================================

async function runOsascript(script: string): Promise<string | null> {
  if (process.platform !== "darwin") return null

  try {
    const proc = Bun.spawn(["osascript", "-e", script], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const output = await new Response(proc.stdout).text()
    return output.trim()
  } catch {
    return null
  }
}

async function getBundleId(appName: string): Promise<string | null> {
  return runOsascript(`id of application "${appName}"`)
}

async function getFrontmostApp(): Promise<string | null> {
  return runOsascript(
    'tell application "System Events" to get name of first application process whose frontmost is true'
  )
}

async function detectTerminalInfo(
  config: NotifyConfig
): Promise<TerminalInfo> {
  // Try to detect terminal using environment variables
  const terminalName =
    config.terminal ||
    process.env.TERM_PROGRAM?.toLowerCase() ||
    process.env.TERM?.toLowerCase() ||
    null

  if (!terminalName) {
    return { name: null, bundleId: null, processName: null }
  }

  // Get process name for focus detection
  const processName =
    TERMINAL_PROCESS_NAMES[terminalName.toLowerCase()] || terminalName

  // Dynamically get bundle ID from macOS
  const bundleId = await getBundleId(processName)

  return {
    name: terminalName,
    bundleId,
    processName,
  }
}

async function isTerminalFocused(terminalInfo: TerminalInfo): Promise<boolean> {
  if (!terminalInfo.processName) return false
  if (process.platform !== "darwin") return false

  const frontmost = await getFrontmostApp()
  if (!frontmost) return false

  // Case-insensitive comparison
  return frontmost.toLowerCase() === terminalInfo.processName.toLowerCase()
}

// ==========================================
// QUIET HOURS CHECK
// ==========================================

function isQuietHours(config: NotifyConfig): boolean {
  if (!config.quietHours.enabled) return false

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  const [startHour, startMin] = config.quietHours.start.split(":").map(Number)
  const [endHour, endMin] = config.quietHours.end.split(":").map(Number)

  const startMinutes = startHour * 60 + startMin
  const endMinutes = endHour * 60 + endMin

  // Handle overnight quiet hours (e.g., 22:00 - 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes
}

// ==========================================
// NOTIFICATION BACKENDS
// ==========================================

async function sendMacOSNotification(
  title: string,
  message: string,
  subtitle: string | undefined,
  sound: string,
  bundleId: string | null,
  timeout: number
): Promise<void> {
  try {
    const whichPath = Bun.which("alerter")
    if (!whichPath) {
      console.warn(
        "opencodev2-notification: alerter not found on PATH. Install with: brew install vjeantet/tap/alerter"
      )
      return
    }

    const args = ["alerter", "--message", message, "--title", title]
    if (subtitle) args.push("--subtitle", subtitle)
    if (sound) args.push("--sound", sound)
    if (bundleId) args.push("--sender", bundleId)
    if (timeout > 0) args.push("--timeout", String(timeout))

    const proc = Bun.spawn([whichPath, ...args.slice(1)], {
      stdout: "ignore",
      stderr: "ignore",
    })

    // Don't block on notification
    void proc.exited.then((exitCode) => {
      if (exitCode !== 0) {
        console.warn(`opencodev2-notification: alerter exited with code ${exitCode}`)
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`opencodev2-notification: macOS notification failed (${message})`)
  }
}

async function sendNodeNotifierNotification(
  title: string,
  message: string,
  sound: string,
  timeout: number
): Promise<void> {
  try {
    // Dynamic import for node-notifier (may not be installed)
    const notifier = await import("node-notifier")
    notifier.default.notify({
      title,
      message,
      sound,
      timeout,
    })
  } catch {
    console.warn(
      "opencodev2-notification: node-notifier not available. Install with: npm install -g node-notifier"
    )
  }
}

async function sendNotification(
  title: string,
  message: string,
  subtitle: string | undefined,
  sound: string,
  terminalInfo: TerminalInfo,
  timeout: number
): Promise<void> {
  if (process.platform === "darwin") {
    await sendMacOSNotification(
      title,
      message,
      subtitle,
      sound,
      terminalInfo.bundleId,
      timeout
    )
  } else {
    await sendNodeNotifierNotification(title, message, sound, timeout)
  }
}

// ==========================================
// DEDUPLICATION
// ==========================================

type RecentNotifications = Map<string, number>

const QUESTION_DEDUPE_WINDOW_MS = 1500
const READY_DEDUPE_WINDOW_MS = 1500
const PERMISSION_DEDUPE_WINDOW_MS = 1500

function shouldSendDedupedNotification(
  recentNotifications: RecentNotifications,
  dedupeKey: string,
  windowMs: number,
  nowMs = Date.now()
): boolean {
  // Prune old entries
  for (const [key, timestamp] of recentNotifications) {
    if (nowMs - timestamp >= windowMs) {
      recentNotifications.delete(key)
    }
  }

  const lastSentAt = recentNotifications.get(dedupeKey)
  if (lastSentAt !== undefined && nowMs - lastSentAt < windowMs) {
    return false
  }

  recentNotifications.set(dedupeKey, nowMs)
  return true
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim()
  if (!normalized) return null
  return normalized
}

// ==========================================
// PLUGIN EXPORT
// ==========================================

export default Plugin.define({
  id: "opencodev2-notification",
  async setup(ctx) {
    // Load config at startup
    const config = await loadConfig()

    // Detect terminal at startup (cached for performance)
    const terminalInfo = await detectTerminalInfo(config)

    // Deduplication maps
    const recentQuestionNotifications: RecentNotifications = new Map()
    const recentReadyNotifications: RecentNotifications = new Map()
    const recentPermissionNotifications: RecentNotifications = new Map()

    // Helper: get session info
    const getSessionTitle = async (sessionID: string): Promise<string> => {
      try {
        const session = await ctx.session.get({ sessionID })
        if (session?.title) {
          return session.title.slice(0, 50)
        }
      } catch {
        // Use default
      }
      return "Task"
    }

    // Helper: check if parent session
    const isParentSession = async (sessionID: string): Promise<boolean> => {
      try {
        const session = await ctx.session.get({ sessionID })
        // In V2, check if session has a parent
        return !(session as any)?.parentID
      } catch {
        // If we can't fetch, assume it's a parent to be safe
        return true
      }
    }

    // Subscribe to events
    const controller = new AbortController()
    void (async () => {
      for await (const event of ctx.event.subscribe({
        signal: controller.signal,
      })) {
        try {
          await handleEvent(event)
        } catch (error) {
          console.error("opencodev2-notification: event handler error:", error)
        }
      }
    })()

    // Event handler
    async function handleEvent(event: any): Promise<void> {
      const eventType = event.type
      const properties = event.properties || {}

      switch (eventType) {
        case "session.idle": {
          const sessionID = toNonEmptyString(properties.sessionID)
          if (!sessionID) break

          // Check parent session
          if (!config.notifyChildSessions) {
            const isParent = await isParentSession(sessionID)
            if (!isParent) break
          }

          // Check quiet hours
          if (isQuietHours(config)) break

          // Check terminal focus
          if (await isTerminalFocused(terminalInfo)) break

          // Deduplication
          const dedupeKey = `session-ready:${sessionID}`
          if (
            !shouldSendDedupedNotification(
              recentReadyNotifications,
              dedupeKey,
              READY_DEDUPE_WINDOW_MS
            )
          ) {
            break
          }

          const sessionTitle = await getSessionTitle(sessionID)
          await sendNotification(
            "Ready for review",
            sessionTitle,
            sessionTitle,
            config.sounds.idle,
            terminalInfo,
            config.timeout
          )
          break
        }

        case "session.error": {
          const sessionID = toNonEmptyString(properties.sessionID)
          if (!sessionID) break

          // Check parent session
          if (!config.notifyChildSessions) {
            const isParent = await isParentSession(sessionID)
            if (!isParent) break
          }

          // Check quiet hours
          if (isQuietHours(config)) break

          // Check terminal focus
          if (await isTerminalFocused(terminalInfo)) break

          const error = properties.error
          const errorMessage =
            typeof error === "string"
              ? error.slice(0, 100)
              : error
                ? String(error).slice(0, 100)
                : "Something went wrong"

          await sendNotification(
            "Something went wrong",
            errorMessage,
            undefined,
            config.sounds.error,
            terminalInfo,
            config.timeout
          )
          break
        }

        case "permission.updated":
        case "permission.asked": {
          // Check quiet hours
          if (isQuietHours(config)) break

          // Check terminal focus
          if (await isTerminalFocused(terminalInfo)) break

          // Deduplication
          const permissionKey = toNonEmptyString(properties.id)
            ? `permission:request:${properties.id}`
            : `permission:${Date.now()}`
          if (
            !shouldSendDedupedNotification(
              recentPermissionNotifications,
              permissionKey,
              PERMISSION_DEDUPE_WINDOW_MS
            )
          ) {
            break
          }

          await sendNotification(
            "Waiting for you",
            "OpenCode needs your input",
            undefined,
            config.sounds.permission,
            terminalInfo,
            config.timeout
          )
          break
        }

        case "question.asked": {
          // Check quiet hours
          if (isQuietHours(config)) break

          // Deduplication
          const questionKey = toNonEmptyString(properties.id)
            ? `question:request:${properties.id}`
            : `question:${Date.now()}`
          if (
            !shouldSendDedupedNotification(
              recentQuestionNotifications,
              questionKey,
              QUESTION_DEDUPE_WINDOW_MS
            )
          ) {
            break
          }

          const sound = config.sounds.question ?? config.sounds.permission
          await sendNotification(
            "Question for you",
            "OpenCode needs your input",
            undefined,
            sound,
            terminalInfo,
            config.timeout
          )
          break
        }
      }
    }

    // Return cleanup function
    return () => {
      controller.abort()
    }
  },
})
