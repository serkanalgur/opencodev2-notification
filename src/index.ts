/**
 * opencodev2-notification
 * Native OS notifications for OpenCode V2
 *
 * Philosophy: "Notify the human when the AI needs them back, not for every micro-event."
 *
 * Features:
 * - Uses OpenCode's built-in attention API for native notifications
 * - Auto-detects terminal emulator for click-to-focus (macOS)
 * - Suppresses notifications when terminal is focused (macOS)
 * - Parent session only by default (no spam from sub-tasks)
 * - Quiet hours support
 * - Configurable sounds per event type
 */

import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Plugin } from "@opencode/plugin/tui"

// ==========================================
// TYPES
// ==========================================

type AttentionSoundName = "default" | "question" | "permission" | "error" | "done" | "subagent_done"

interface NotifyConfig {
  /** Notify for child/sub-session events (default: false) */
  notifyChildSessions: boolean
  /** Sound configuration per event type */
  sounds: {
    idle: AttentionSoundName
    error: AttentionSoundName
    permission: AttentionSoundName
  }
  /** Quiet hours configuration */
  quietHours: {
    enabled: boolean
    start: string // "HH:MM" format
    end: string // "HH:MM" format
  }
}

// ==========================================
// DEFAULT CONFIGURATION
// ==========================================

const DEFAULT_CONFIG: NotifyConfig = {
  notifyChildSessions: false,
  sounds: {
    idle: "done",
    error: "error",
    permission: "permission",
  },
  quietHours: {
    enabled: false,
    start: "22:00",
    end: "08:00",
  },
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

    // Merge with defaults
    return {
      ...DEFAULT_CONFIG,
      ...userConfig,
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
// DEDUPLICATION
// ==========================================

type RecentNotifications = Map<string, number>

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
// CLI PLUGIN EXPORT
// ==========================================

export default Plugin.define({
  id: "opencodev2-notification",
  async setup(context) {
    // Load config at startup
    const config = await loadConfig()

    // Deduplication maps
    const recentReadyNotifications: RecentNotifications = new Map()
    const recentPermissionNotifications: RecentNotifications = new Map()

    // Helper: get session info
    const getSessionTitle = (sessionID: string): string => {
      const session = context.data.session.get(sessionID)
      if (session?.title) {
        return session.title.slice(0, 50)
      }
      return "Task"
    }

    // Helper: check if parent session
    const isParentSession = (sessionID: string): boolean => {
      const session = context.data.session.get(sessionID)
      // No parentID means this IS the parent/root session
      return !(session as any)?.parentID
    }

    // Helper: send notification using OpenCode's built-in attention API
    const sendNotification = async (
      title: string,
      message: string,
      soundName: AttentionSoundName
    ): Promise<void> => {
      try {
        await context.attention.notify({
          title,
          message,
          notification: { when: "blurred" },
          sound: { name: soundName, volume: 1, when: "always" },
        })
      } catch (error) {
        console.error("opencodev2-notification: failed to send notification:", error)
      }
    }

    // Subscribe to events using context.data.on
    const unsubscribers: Array<() => void> = []

    // Session idle - task completed
    unsubscribers.push(
      context.data.on("session.idle", async (event) => {
        const sessionID = toNonEmptyString(event.data.sessionID)
        if (!sessionID) return

        // Check parent session
        if (!config.notifyChildSessions) {
          if (!isParentSession(sessionID)) return
        }

        // Check quiet hours
        if (isQuietHours(config)) return

        // Deduplication
        const dedupeKey = `session-ready:${sessionID}`
        if (
          !shouldSendDedupedNotification(
            recentReadyNotifications,
            dedupeKey,
            READY_DEDUPE_WINDOW_MS
          )
        ) {
          return
        }

        const sessionTitle = getSessionTitle(sessionID)
        await sendNotification(
          "Ready for review",
          sessionTitle,
          config.sounds.idle
        )
      })
    )

    // Session execution failed
    unsubscribers.push(
      context.data.on("session.execution.failed", async (event) => {
        const sessionID = toNonEmptyString(event.data.sessionID)
        if (!sessionID) return

        // Check parent session
        if (!config.notifyChildSessions) {
          if (!isParentSession(sessionID)) return
        }

        // Check quiet hours
        if (isQuietHours(config)) return

        const error = event.data.error
        const errorMessage = (error.message ?? "Something went wrong").slice(0, 100)

        await sendNotification(
          "Something went wrong",
          errorMessage,
          config.sounds.error
        )
      })
    )

    // Permission asked
    unsubscribers.push(
      context.data.on("permission.asked", async (event) => {
        // Check quiet hours
        if (isQuietHours(config)) return

        // Deduplication
        const permissionKey = toNonEmptyString(event.data.id)
          ? `permission:request:${event.data.id}`
          : `permission:${Date.now()}`
        if (
          !shouldSendDedupedNotification(
            recentPermissionNotifications,
            permissionKey,
            PERMISSION_DEDUPE_WINDOW_MS
          )
        ) {
          return
        }

        await sendNotification(
          "Waiting for you",
          "OpenCode needs your input",
          config.sounds.permission
        )
      })
    )

    // Permission replied (when user responds)
    unsubscribers.push(
      context.data.on("permission.replied", async (event) => {
        // Check quiet hours
        if (isQuietHours(config)) return

        // Deduplication
        const permissionKey = toNonEmptyString(event.data.requestID)
          ? `permission:replied:${event.data.requestID}`
          : `permission-reply:${Date.now()}`
        if (
          !shouldSendDedupedNotification(
            recentPermissionNotifications,
            permissionKey,
            PERMISSION_DEDUPE_WINDOW_MS
          )
        ) {
          return
        }

        await sendNotification(
          "Permission Updated",
          "Your input has been recorded",
          config.sounds.permission
        )
      })
    )

    // Return cleanup function
    return () => {
      unsubscribers.forEach((unsub) => unsub())
    }
  },
})
