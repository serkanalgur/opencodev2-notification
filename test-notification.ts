/**
 * Quick test - run this to verify notifications work
 * bun run test-notification.ts
 */

async function testMacOSNotification() {
  console.log("🍎 Testing macOS notification via osascript...")
  
  const script = `display notification "Test notification from OpenCode Plugin!" with title "OpenCode V2 Notification" sound name "Glass"`
  
  const proc = Bun.spawn(["osascript", "-e", script], {
    stdout: "pipe",
    stderr: "pipe",
  })
  
  const exitCode = await proc.exited
  const stderr = await new Response(proc.stderr).text()
  
  if (exitCode === 0) {
    console.log("✅ macOS notification sent successfully!")
  } else {
    console.log("❌ Failed:", stderr)
  }
}

async function testLinuxNotification() {
  console.log("🐧 Testing Linux notification via notify-send...")
  
  const notifySendPath = Bun.which("notify-send")
  if (!notifySendPath) {
    console.log("⚠️  notify-send not found, testing dbus-send fallback...")
    
    // Test dbus-send fallback
    const proc = Bun.spawn([
      "dbus-send",
      "--session",
      "--type=method_call",
      "--dest=org.freedesktop.Notifications",
      "/org/freedesktop/Notifications",
      "org.freedesktop.Notifications.Notify",
      "string:opencode",
      "uint32:0",
      "string:",
      "string:Test Notification",
      "string:Hello from OpenCode Plugin!",
      "array:string:",
      "dict:string:variant:",
      "int32:5000",
    ], { stdout: "ignore", stderr: "pipe" })
    
    const exitCode = await proc.exited
    if (exitCode === 0) {
      console.log("✅ Linux dbus-send notification sent!")
    } else {
      console.log("❌ dbus-send failed (this is expected if no desktop environment)")
    }
    return
  }
  
  const proc = Bun.spawn([notifySendPath, "-a", "OpenCode", "Test Notification", "Hello from OpenCode Plugin!"], {
    stdout: "ignore",
    stderr: "pipe",
  })
  
  const exitCode = await proc.exited
  if (exitCode === 0) {
    console.log("✅ Linux notification sent!")
  } else {
    console.log("❌ notify-send failed")
  }
}

async function main() {
  console.log("🚀 OpenCode V2 Notification Plugin - Test\n")
  
  switch (process.platform) {
    case "darwin":
      await testMacOSNotification()
      break
    case "linux":
      await testLinuxNotification()
      break
    case "win32":
      console.log("🪟 Windows detected - test via PowerShell (run in PowerShell)")
      console.log('   powershell -Command "[System.Reflection.Assembly]::LoadWithPartialName(\'System.Windows.Forms\'); $n = New-Object System.Windows.Forms.NotifyIcon; $n.Icon = [System.Drawing.SystemIcons]::Information; $n.Visible = $true; $n.ShowBalloonTip(3000, \'OpenCode\', \'Test Notification\', \'Info\')"')
      break
    default:
      console.log(`⚠️  Unsupported platform: ${process.platform}`)
  }
  
  console.log("\n✨ Done!")
}

main()
