# Multilingual Virtual Assistant Mindfulness

This repository combines the mindfulness web/avatar chatbot, backend services, and the mobile version of the Multi-Language Wellness App.

## Projects

- `Web_Mindfulness_Chatbot/` contains the browser-based mindfulness chatbot and avatar experience.
- `Mobile_Mindfulness_React/` contains the earlier mobile mindfulness React project.
- The repository root now also contains the merged Expo mobile app from `mobile-app`.
- `server.py`, `chatbot.py`, `requirements.txt`, and `render.yaml` support the Python backend/deployment flow.

## Mobile App Setup

The merged mobile app is built with JavaScript, React Native, and Expo.

1. Create a local `.env` file at the repository root.
2. Add the Firebase keys required by `src/config/firebaseConfig.js`.
3. Install dependencies:

```bash
npm install
```

4. Start Expo:

```bash
npm start
```

`npm start` uses tunnel mode by default for reliable Expo Go testing when LAN access is blocked.

Other mobile start commands:

```bash
npm run start:lan
npm run start:tunnel
```

## Viewing The App On Mobile

1. Install Expo Go on your mobile device.
2. Start the app with `npm start`.
3. Scan the QR code shown in the terminal.
4. Wait for Expo Go to load the app.

## Mac Developers

The easiest path is to use Expo Go on a real iPhone and scan the QR code from the dev server. Xcode is not required for normal device testing.

If you see an `unable to run simctl` or `xcrun simctl failed` warning while using a physical device, you can ignore it as long as Metro starts and the QR code appears. Avoid pressing `i` unless you intend to use the iOS Simulator.

Only install and configure Xcode if you want to run the app in the iOS Simulator.

## Expo Go Loading Issues On Mac

If Expo Go gets stuck on "Taking longer than expected", the phone likely cannot reach the dev server on the Mac.

Try tunnel mode first:

```bash
npm install
npm start
```

If tunnel mode fails, retry once and confirm dependencies are installed. For LAN mode, make sure the phone and Mac are on the same Wi-Fi, VPN is off, and the macOS firewall allows incoming connections for Node, Terminal, or your editor.
