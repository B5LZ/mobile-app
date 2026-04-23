# mobile-app
This repository contains our code for our mobile version of the Multi-Language Wellness App.
The project is built using JS and React Native.

# Setting Up
- Once you clone the repository, you must create a .env locally at the root level and place the Firebase keys in there to use the database.
- To get the environment variables, contact the development team.

# Starting the code 
- npm install  (this must be run again after any changes are made to the repo).
- **npm start** — tunnel mode (default for the team; reliable Expo Go on Mac when LAN is blocked)
- **npm run start:lan** — same Wi‑Fi as your phone; use this if tunnel fails (e.g. ngrok `reading 'body'` on Windows) or you prefer LAN
- `npm run start:tunnel` — same as `npm start`

# Viewing the app on mobile
1) Download Expo Go on your mobile device
2) If you are on IOS, scan the QR that is produced in the terminal after running npm start, and it should open in your Expo Go app.
3) Wait for the app to load and you will see our work.

# Mac developers (Expo + `simctl` / Xcode)
**Easiest path — no Xcode required:** use **Expo Go on a real iPhone** and scan the QR code from the dev server. You do **not** need the iOS Simulator for day‑to‑day work.

If you see **`unable to run simctl` / `xcrun simctl` failed** when starting Expo:
- That command is only needed for the **iOS Simulator**. If you are testing on a **physical device with Expo Go**, you can **ignore the warning** as long as Metro starts and the QR code appears.
- Do **not** press **`i`** in the terminal (that tries to open the Simulator). Use the QR code + Expo Go instead.

**Only if you want the iOS Simulator:** install **Xcode** from the App Store, open it once, install an **iOS Simulator** runtime (Xcode → Settings → Platforms), then in Terminal run `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` and `sudo xcodebuild -license accept`. Confirm with `xcrun simctl help` before relying on **`i`** in Expo.

# Mac: Expo Go stuck on “Taking longer than expected” / won’t load
That means the **phone cannot reach the dev server** on your Mac (LAN QR uses your Wi‑Fi IP and port `8081`). Windows/Linux can work while Mac fails if **the Mac firewall** or **network path** blocks that traffic—it is not because they pressed **`i`**.

**Try this first (works for most teams): tunnel mode** (serves the bundle over the internet so the phone does not need local LAN access):

```bash
npm install
npm start
```

`@expo/ngrok` is listed in **devDependencies** so everyone gets the same tunnel package after `npm install`. Prefer that over letting Expo install it **globally** (global installs sometimes misbehave).

**If tunnel crashes** with `Cannot read properties of undefined (reading 'body')` or an ngrok `CommandError`:
- Retry once; check [ngrok status](https://status.ngrok.com/) for outages.
- Run again after `npm install` so the local `@expo/ngrok` is present.
- If it keeps failing, use **LAN mode** and fix the Mac **firewall** (section below) so `npm run start:lan` + QR works without tunnel.

Scan the **tunnel** QR code (it will look different from the normal LAN URL).

**If you prefer normal LAN mode**, on the Mac:

1. **Phone and Mac on the same Wi‑Fi**; turn **VPN off** on both while testing.
2. **Firewall:** *System Settings → Network → Firewall* — allow **incoming** connections for **Node**, **Terminal**, or **Cursor** (or temporarily turn the firewall off once to confirm that was the cause).
3. Restart the dev server in LAN mode: `npx expo start --lan -c` (or `npm run start:lan -- --clear`).
4. **Expo Go** must be a recent version compatible with **Expo SDK 54** (update from the App Store).

If tunnel works but LAN does not, keep using **`npm start`** (tunnel) for demos until LAN/firewall is fixed.
