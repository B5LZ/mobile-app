import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
import {
  Alert,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';
import * as Speech from 'expo-speech';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { recordCompletedSession } from '../utils/sessionTracking';

// ─── Constants ────────────────────────────────────────────────────────────────

const DOCK_HEIGHT = 480;
const AVATAR_TTS_SERVER = 'https://multilingual-virtual-assistant.onrender.com';
const AVATAR_TTS_VOICE = 'en-US-JennyNeural';
const AVATAR_TTS_PROVIDER = 'azure';

function hashTtsKey(text) {
  const input = `${AVATAR_TTS_VOICE}|${AVATAR_TTS_PROVIDER}|${(text || '').trim()}`;
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    result += chars[a >> 2];
    result += chars[((a & 3) << 4) | (b >> 4)];
    result += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : '=';
    result += i + 2 < bytes.length ? chars[c & 63] : '=';
  }
  return result;
}

function parseTtsPayloadFromBuffer(buffer) {
  if (!buffer || buffer.byteLength < 512) throw new Error('TTS audio too small');
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0x7b) {
    try {
      const json = JSON.parse(new TextDecoder().decode(buffer));
      const audioBase64 = json.audio || json.base64 || '';
      if (audioBase64 && audioBase64.length > 512) {
        return {
          base64: audioBase64,
          visemes: Array.isArray(json.visemes) ? json.visemes : [],
        };
      }
    } catch {
      // Fall through to legacy raw-audio handling.
    }
  }
  return {
    base64: arrayBufferToBase64(buffer),
    visemes: [],
  };
}

function readCachedTtsPayload(raw, legacyBase64 = false) {
  if (legacyBase64) {
    if (raw && raw.length > 512) {
      return { base64: raw, visemes: [] };
    }
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.base64 && parsed.base64.length > 512) {
      return {
        base64: parsed.base64,
        visemes: Array.isArray(parsed.visemes) ? parsed.visemes : [],
      };
    }
  } catch {
    if (raw && raw.length > 512 && !raw.trimStart().startsWith('{')) {
      return { base64: raw, visemes: [] };
    }
  }
  return null;
}

const TTS_MAX_CONCURRENT = 2;
let ttsActiveFetches = 0;
const ttsFetchWaitQueue = [];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function acquireTtsSlot() {
  if (ttsActiveFetches < TTS_MAX_CONCURRENT) {
    ttsActiveFetches += 1;
    return;
  }
  await new Promise((resolve) => {
    ttsFetchWaitQueue.push(resolve);
  });
  ttsActiveFetches += 1;
}

function releaseTtsSlot() {
  ttsActiveFetches = Math.max(0, ttsActiveFetches - 1);
  const next = ttsFetchWaitQueue.shift();
  if (next) next();
}

async function fetchTtsHttpResponse(text) {
  const body = JSON.stringify({
    text,
    voice_name: AVATAR_TTS_VOICE,
    provider: AVATAR_TTS_PROVIDER,
  });
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await acquireTtsSlot();
    try {
      const response = await fetch(`${AVATAR_TTS_SERVER}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      if ([502, 503, 504].includes(response.status) && attempt < 3) {
        throw new Error(`TTS HTTP ${response.status}`);
      }
      if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3 && /TTS HTTP 50[234]/.test(error.message || '')) {
        await sleep(1200 * attempt);
        continue;
      }
      throw error;
    } finally {
      releaseTtsSlot();
    }
  }
  throw lastError || new Error('TTS fetch failed');
}

async function fetchTtsPayloadForText(text, memoryCache) {
  const trimmed = (text || '').trim();
  if (!trimmed) throw new Error('Missing TTS text');

  const cacheKey = hashTtsKey(trimmed);
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }

  const cacheDir = FileSystem.cacheDirectory || '';
  const filePath = `${cacheDir}tts-${cacheKey}.json`;
  const legacyFilePath = `${cacheDir}tts-${cacheKey}.mp3`;

  for (const [path, legacy] of [[filePath, false], [legacyFilePath, true]]) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (!info.exists || (info.size || 0) <= 64) continue;
      const raw = legacy
        ? await FileSystem.readAsStringAsync(path, { encoding: 'base64' })
        : await FileSystem.readAsStringAsync(path);
      const payload = readCachedTtsPayload(raw, legacy);
      if (payload) {
        memoryCache.set(cacheKey, payload);
        return payload;
      }
      await FileSystem.deleteAsync(path, { idempotent: true });
    } catch {
      // Try the next cache location or refetch from server.
    }
  }

  const response = await fetchTtsHttpResponse(trimmed);
  const payload = parseTtsPayloadFromBuffer(await response.arrayBuffer());
  memoryCache.set(cacheKey, payload);

  try {
    await FileSystem.writeAsStringAsync(filePath, JSON.stringify(payload));
  } catch {
    // In-memory cache is enough when disk write fails.
  }

  return payload;
}

function getTtsCacheFilePath(text) {
  const trimmed = (text || '').trim();
  if (!trimmed) return '';
  return `${FileSystem.cacheDirectory || ''}tts-${hashTtsKey(trimmed)}.json`;
}

async function deliverTtsToWebView(webViewRef, requestId, text, payload) {
  let deliver = payload;
  if (!deliver?.base64) {
    const filePath = getTtsCacheFilePath(text);
    if (filePath) {
      try {
        const info = await FileSystem.getInfoAsync(filePath);
        if (info.exists) {
          const raw = await FileSystem.readAsStringAsync(filePath);
          deliver = readCachedTtsPayload(raw);
        }
      } catch {
        // Fall through to null payload below.
      }
    }
  }
  const visemes = Array.isArray(deliver?.visemes) ? deliver.visemes : [];
  const base64 = deliver?.base64 || null;
  const deliverPayload = JSON.stringify({ id: requestId, base64, visemes });
  webViewRef.current?.injectJavaScript(
    `(function(){try{window._onNativeTtsAudio(${deliverPayload});}catch(e){}})();true;`,
  );
}

// ─── Session catalog ──────────────────────────────────────────────────────────

const sessionCatalog = [
  { id: 'caregiver-fatigue',  title: 'Caregiver Fatigue',         description: 'A compassion meditation to recharge when caring for others.', kind: 'scripted',    duration: '~4 min · 6 segments' },
  { id: 'body-scan',          title: 'Body Scan',                 description: 'A guided check-in from head to toe.',                        kind: 'placeholder', duration: 'Coming soon' },
  { id: 'five-senses',        title: 'Five Senses Grounding',     description: 'A grounding exercise to reconnect with the present moment.',  kind: 'placeholder', duration: 'Coming soon' },
  { id: 'mindful-breathing',  title: 'Mindful Breathing',         description: 'A foundational breath awareness practice you can use anywhere.', kind: 'scripted', duration: '~5 min · 5 segments' },
  { id: 'loving-kindness',    title: 'Loving Kindness',           description: 'A compassion-focused mindfulness practice.',                 kind: 'placeholder', duration: 'Coming soon' },
  { id: 'mindful-walking',    title: 'Mindful Walking',           description: 'A light movement practice with full attention on each step.', kind: 'placeholder', duration: 'Coming soon' },
  { id: 'seated-stretch',     title: 'Seated Stretch Reset',      description: 'Gentle seated stretches to release tension.',                kind: 'placeholder', duration: 'Coming soon' },
  { id: 'mindful-listening',  title: 'Mindful Listening',         description: 'A practice that centers attention through sound.',            kind: 'placeholder', duration: 'Coming soon' },
  { id: 'affirmation-breath', title: 'Affirmation Breath',        description: 'Pair a calming phrase with your breath.',                    kind: 'placeholder', duration: 'Coming soon' },
  { id: 'stress-release',     title: 'Stress Release Check-In',   description: 'Notice, name, and soften what you are carrying.',            kind: 'placeholder', duration: 'Coming soon' },
  { id: 'morning-intention',  title: 'Morning Intention',         description: 'A simple intention-setting practice for the day.',           kind: 'placeholder', duration: 'Coming soon' },
  { id: 'sleep-wind-down',    title: 'Sleep Wind Down',           description: 'A quiet practice to prepare your body for rest.',            kind: 'placeholder', duration: 'Coming soon' },
].map((s, i) => ({ ...s, number: String(i + 1).padStart(2, '0') }));

// ─── Scripted session content ─────────────────────────────────────────────────

const SESSION_SCRIPTS = {
  'caregiver-fatigue': [
    { key: 'cf1',  text: "Thanks for joining me for this short meditation." },
    { key: 'cf2',  text: "In this brief practice, we'll explore some simple steps to recharge when we're feeling burnt out or overwhelmed by our efforts to help others." },
    { key: 'cf3',  text: "Go ahead and get comfortable. You can close your eyes if you like, or keep them gently open with a soft, relaxed gaze." },
    { key: 'cf4',  text: "As you settle in, take a few slow, calming breaths. And notice how it feels to breathe." },
    { key: 'cf5',  text: "Now let your breath return to its normal pace. Give yourself a few moments to rest and recharge as you bring yourself fully into the here and now." },
    { key: 'cf6',  text: "Great. Now we'll shift gears and tap into our ability to hold the suffering of others in a healthy way." },
    { key: 'cf7',  text: "Empathy can be a bridge to care and compassion, but it can also lead us into a state of overwhelm — what scientists call empathic distress." },
    { key: 'cf8',  text: "One simple way to avoid this overwhelm is to ground yourself in a caring motivation. Let's give this a try." },
    { key: 'cf9',  text: "Start by bringing to mind someone you care about. It could be your care recipient or anyone you care about." },
    { key: 'cf10', text: "Take a moment to imagine that they're actually here with you, and see if you can sense the deep connection you share with them." },
    { key: 'cf11', text: "As you tap into this sense of connection, see if you could notice your impulse to care for this individual, or perhaps your natural wish for them to be happy and free from suffering." },
    { key: 'cf12', text: "If it helps, you can give voice to this in your mind. You may think to yourself: May you be free from suffering and hardship. May you have all the happiness in the world." },
    { key: 'cf13', text: "Feel free to make up your own compassionate phrases and imagine sharing them with this person that you care about." },
    { key: 'cf14', text: "Now bring others to mind — or perhaps groups of people, or even the Earth itself." },
    { key: 'cf15', text: "Acknowledge their pain and suffering, and also the tremendous resilience that we all have." },
    { key: 'cf16', text: "Imagine a world where they are free from suffering and free from adversity. See if you can picture them happy, at ease, healthy, and balanced." },
    { key: 'cf17', text: "Let your mind roam here and continue to send kind, caring thoughts and phrases out into the world." },
    { key: 'cf18', text: "Next, include yourself in this circle of compassion." },
    { key: 'cf19', text: "Imagine the people in your life who care for you, or even strangers who are sending love and compassion out into the world, just like you are." },
    { key: 'cf20', text: "Imagine that all this caring energy is flowing into you, and see if you can be open to receiving it." },
    { key: 'cf21', text: "For these last few moments, notice how you feel right now without any judgment." },
    { key: 'cf22', text: "Bring a sense of openness, curiosity, and care to your own thoughts and feelings, whatever they may be." },
    { key: 'cf23', text: "When we feel the suffering of others and the suffering of the world in a very direct way, our own feelings and reactions can easily overwhelm us." },
    { key: 'cf24', text: "Here we practice the skill of grounding ourselves in a caring motivation. With this motivation, we get a little more space to be with our feelings and reactions without getting swept away by them." },
    { key: 'cf25', text: "Hopefully you found this helpful. If you did, see if you can keep practicing for short moments over the next day or two. Take care and good luck with your practice." },
  ],
  'mindful-breathing': [
    { key: 'mb1',  text: "Hello and welcome back. Today we are going to focus on a fundamental practice: mindful breathing." },
    { key: 'mb2',  text: "This is a tool you can use anywhere, at any time, to ground yourself and find a moment of calm." },
    { key: 'mb3',  text: "Start by finding a comfortable seat. Allow your back to be straight but not stiff." },
    { key: 'mb4',  text: "Let your hands rest gently in your lap or on your knees. If it feels okay, go ahead and close your eyes, or simply lower your gaze and let it soften." },
    { key: 'mb5',  text: "Now, take a deep breath in through your nose, feeling your lungs expand. And exhale slowly through your mouth." },
    { key: 'mb6',  text: "Do that one more time — deep breath in... and a long breath out." },
    { key: 'mb7',  text: "Now, let your breath settle into its natural rhythm. You don't need to change it or control it. Just observe it." },
    { key: 'mb8',  text: "Notice where you feel the breath most clearly. It might be the cool air at the tip of your nose, the rise and fall of your chest, or the expansion and contraction of your belly." },
    { key: 'mb9',  text: "As you sit here, you may notice your mind starting to wander. This is perfectly normal. That's just what minds do." },
    { key: 'mb10', text: "When you realize your thoughts have drifted to the past, the future, or a to-do list, simply acknowledge the thought without judgment." },
    { key: 'mb11', text: "Think of it like a cloud passing through the sky. Then, gently and kindly, escort your attention back to the physical sensation of your breath." },
    { key: 'mb12', text: "Back to the inhale... and the exhale." },
    { key: 'mb13', text: "Let's stay with this for a few moments in silence. Following each breath from the beginning of the inhalation, through the brief pause, to the end of the exhalation." },
    { key: 'mb14', text: "If you get distracted ten times, just bring yourself back ten times. Every time you return to the breath, you are strengthening your mindfulness muscle." },
    { key: 'mb15', text: "As we bring this practice to a close, take a moment to notice how you feel. Is there a sense of stillness? A bit more space in your mind?" },
    { key: 'mb16', text: "Know that this breath is always available to you as an anchor." },
    { key: 'mb17', text: "When you're ready, gently wiggle your fingers and toes, and slowly open your eyes." },
    { key: 'mb18', text: "Thank you for practicing with me today. Take this sense of presence with you as you move into the rest of your day." },
  ],
};

// Group scripted passages into named parts (matches catalog segment counts).
const SESSION_CHAPTERS = {
  'caregiver-fatigue': [
    { title: 'Settle in', startIndex: 0, endIndex: 4 },
    { title: 'Empathy & overwhelm', startIndex: 5, endIndex: 7 },
    { title: 'Caring for someone', startIndex: 8, endIndex: 12 },
    { title: 'Wider compassion', startIndex: 13, endIndex: 16 },
    { title: 'Including yourself', startIndex: 17, endIndex: 21 },
    { title: 'Closing', startIndex: 22, endIndex: 24 },
  ],
  'mindful-breathing': [
    { title: 'Welcome', startIndex: 0, endIndex: 3 },
    { title: 'Settle & breathe', startIndex: 4, endIndex: 6 },
    { title: 'Follow your breath', startIndex: 7, endIndex: 8 },
    { title: 'Wandering mind', startIndex: 9, endIndex: 11 },
    { title: 'Closing', startIndex: 12, endIndex: 17 },
  ],
};

function getSessionChapters(sessionId) {
  return SESSION_CHAPTERS[sessionId] || [];
}

function getChapterIndexForSegment(sessionId, segmentIndex) {
  const chapters = getSessionChapters(sessionId);
  for (let i = chapters.length - 1; i >= 0; i -= 1) {
    if (segmentIndex >= chapters[i].startIndex) return i;
  }
  return 0;
}

function getChapterSpeechText(sessionId, chapterIndex) {
  const chapters = getSessionChapters(sessionId);
  const segments = SESSION_SCRIPTS[sessionId] || [];
  const chapter = chapters[chapterIndex];
  if (!chapter) return '';
  return segments
    .slice(chapter.startIndex, chapter.endIndex + 1)
    .map((segment) => segment.text)
    .join(' ');
}

function getAllSessionChapterTexts(sessionId) {
  const chapters = getSessionChapters(sessionId);
  return chapters
    .map((_, index) => getChapterSpeechText(sessionId, index))
    .filter(Boolean);
}

function getChapterSegmentTexts(sessionId, chapterIndex) {
  const chapters = getSessionChapters(sessionId);
  const segments = SESSION_SCRIPTS[sessionId] || [];
  const chapter = chapters[chapterIndex];
  if (!chapter) return [];
  return segments
    .slice(chapter.startIndex, chapter.endIndex + 1)
    .map((segment) => segment.text)
    .filter(Boolean);
}

function getAllSessionSegmentTexts(sessionId) {
  return (SESSION_SCRIPTS[sessionId] || [])
    .map((segment) => segment.text)
    .filter(Boolean);
}

function getFirstSessionSegmentText(sessionId) {
  return (SESSION_SCRIPTS[sessionId] || [])[0]?.text || '';
}

// Applied as the injectedJavaScript PROP on every WebView (runs after DOM is ready,
// before user interaction — more reliable than the injectJavaScript() method):
//   1. Forces textarea/input font-size to 16px  →  prevents iOS WKWebView auto-zoom
//      (WKWebView zooms in whenever a focused input has computed font-size < 16px)
//   2. Sets maximum-scale=1 on the viewport meta  →  belt-and-suspenders for zoom
//   3. Hides the avatar.html built-in Start/End Session buttons (.sr container)
const WEBVIEW_STATIC_JS = `(function(){try{
  var s=document.createElement('style');
  s.textContent=
    'textarea,input{font-size:16px!important;-webkit-text-size-adjust:none!important}' +
    'body.compact .ch{display:none!important}' +
    'body.compact .layout{grid-template-rows:minmax(160px,40%) 1fr!important}' +
    'body.guided .chat{display:none!important}' +
    'body.guided .layout{grid-template-columns:1fr!important;grid-template-rows:1fr!important;height:100%!important}' +
    'body.guided .scene{border-bottom:none;min-height:100%;height:100%!important}' +
    'body.guided html,body.guided body{height:100%!important;overflow:hidden!important}' +
    'body.guided #cv{width:100%!important;height:100%!important;display:block!important}' +
    '@media(max-width:860px){.layout{grid-template-rows:minmax(160px,40%) 1fr!important}}';
  document.head.appendChild(s);
  var vm=document.querySelector('meta[name="viewport"]');
  if(vm)vm.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1');
  var sr=document.querySelector('.sr');
  if(sr)sr.style.cssText='display:none!important';
  /* Warm up the Render server so TTS isn't slow on first use */
  setTimeout(function(){try{
    fetch('https://multilingual-virtual-assistant.onrender.com/health',{method:'GET'}).catch(function(){});
    fetch('https://multilingual-virtual-assistant.onrender.com/tts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:'Ready.',voice_name:'en-US-JennyNeural',provider:'azure'})
    }).catch(function(){});
  }catch(e){}},1000);
}catch(e){}})();true;`;

const HOME_WEBVIEW_STATIC_JS = `(function(){try{
  var s=document.createElement('style');
  s.textContent=
    'textarea,input{font-size:16px!important;-webkit-text-size-adjust:none!important}' +
    'body.compact .ch{display:none!important}' +
    'body.compact .layout{grid-template-rows:minmax(160px,40%) 1fr!important}' +
    '@media(max-width:860px){.layout{grid-template-rows:minmax(160px,40%) 1fr!important}}';
  document.head.appendChild(s);
  var vm=document.querySelector('meta[name="viewport"]');
  if(vm)vm.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1');
  var sr=document.querySelector('.sr');
  if(sr)sr.style.cssText='display:none!important';
  setTimeout(function(){try{
    fetch('https://multilingual-virtual-assistant.onrender.com/health',{method:'GET'}).catch(function(){});
    fetch('https://multilingual-virtual-assistant.onrender.com/tts',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({text:'Ready.',voice_name:'en-US-JennyNeural',provider:'azure'})
    }).catch(function(){});
  }catch(e){}},1000);
}catch(e){}})();true;`;

// Keep the old name as an alias so existing injectJavaScript() call-sites still compile
const HIDE_CONTROLS_JS = WEBVIEW_STATIC_JS;
const HIDE_HOME_CONTROLS_JS = HOME_WEBVIEW_STATIC_JS;

const PLACEHOLDER_SESSION_LINE = 'This guided session is coming soon. Please choose another session for now.';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createSessionId() {
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatDuration(totalSeconds) {
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts   = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((v) => String(v).padStart(2, '0')).join(':');
}

// ─── Avatar URI builder ───────────────────────────────────────────────────────

function buildAvatarUri(baseUri, params) {
  if (!baseUri) return null;
  const qs = Object.entries(params)
    .filter(([, v]) => v != null && v !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  if (!qs) return baseUri;
  return `${baseUri}${baseUri.includes('?') ? '&' : '?'}${qs}`;
}

function resolvePackagerAssetUri(asset) {
  if (!asset) return null;
  const remote = asset.uri;
  const local = asset.localUri;
  if (remote && /^https?:\/\//i.test(remote)) return remote;
  return local || remote || null;
}

function getFileUriParentDirectory(fileUri) {
  if (!fileUri || !String(fileUri).startsWith('file://')) return undefined;
  const lastSlash = fileUri.lastIndexOf('/');
  if (lastSlash <= 'file://'.length) return undefined;
  return fileUri.slice(0, lastSlash + 1);
}

function buildLocalBackendUri(baseUri) {
  try {
    const url = new URL(baseUri);
    if (!url.hostname || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      return '';
    }
    url.port = '8000';
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function firstWhitespaceToken(text) {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) return '';
  return s.split(/\s+/)[0] || '';
}

/** Prefer `users/{uid}.firstName`, else first word of `fullName` (sign-up stores both). */
function greetingFirstNameFromUserDoc(data) {
  if (!data || typeof data !== 'object') return '';
  const fn = typeof data.firstName === 'string' ? data.firstName.trim() : '';
  if (fn) return fn;
  return firstWhitespaceToken(
    typeof data.fullName === 'string' ? data.fullName : '',
  );
}

function firstNameFromAuthDisplayName(displayName) {
  return firstWhitespaceToken(
    typeof displayName === 'string' ? displayName : '',
  );
}

// ─── Floating Avatar Dock ─────────────────────────────────────────────────────
// Always mounted — opacity:0 + pointerEvents:none when not visible so the
// WebView keeps running and localStorage / chat state survives screen transitions.

function FloatingAvatarDock({
  avatarUri,
  avatarError,
  avatarReadAccessUri,
  expanded,
  visible,
  onToggle,
  webViewRef,
  onLoad,
  onMessage,
  onError,
  labels,
}) {
  const hiddenStyle = !visible && styles.floatingHidden;

  if (!expanded) {
    return (
      <View pointerEvents={visible ? 'auto' : 'none'} style={[styles.guideBarWrap, hiddenStyle]}>
        <Pressable
          style={({ pressed }) => [styles.guideBar, pressed && styles.btnPressed]}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={labels.openGuide}
        >
          <View style={styles.guideBarOrb} />
          <View style={styles.guideBarTextWrap}>
            <Text style={styles.guideBarTitle}>{labels.barLabel}</Text>
            <Text style={styles.guideBarAction}>{labels.barAction}</Text>
          </View>
          <Text style={styles.guideBarChevron}>›</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={[styles.floatingDock, hiddenStyle]}>
      <View style={styles.floatingDockHeader}>
        <View>
          <Text style={styles.floatingDockKicker}>{labels.dockKicker}</Text>
          <Text style={styles.floatingDockTitle}>{labels.dockTitle}</Text>
        </View>
        <Pressable onPress={onToggle} hitSlop={10} accessibilityRole="button" accessibilityLabel={labels.hideGuide}>
          <Text style={styles.floatingDockHideText}>{labels.hideGuide}</Text>
        </Pressable>
      </View>
      {avatarUri ? (
        <WebView
          ref={webViewRef}
          source={{ uri: avatarUri }}
          style={styles.dockWebView}
          originWhitelist={['*', 'file://']}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={avatarReadAccessUri}
          mixedContentMode="always"
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          injectedJavaScript={HOME_WEBVIEW_STATIC_JS}
          onLoad={onLoad}
          onError={onError}
          onHttpError={onError}
          onMessage={onMessage}
        />
      ) : (
        <View style={styles.avatarLoading}>
          <View style={styles.loadingOrb} />
          <Text style={styles.loadingText}>{avatarError || 'Loading avatar...'}</Text>
          {!!avatarError && !!avatarUri && (
            <Text style={styles.loadingDetailText} numberOfLines={3}>
              uri: {String(avatarUri).slice(0, 200)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Session Avatar Panel ─────────────────────────────────────────────────────

function SessionAvatarPanel({ avatarUri, avatarError, avatarReadAccessUri, webViewRef, onLoad, onMessage, onError }) {
  return (
    <View style={styles.sessionAvatarPanel}>
      {avatarUri ? (
        <WebView
          ref={webViewRef}
          source={{ uri: avatarUri }}
          style={styles.sessionWebView}
          originWhitelist={['*', 'file://']}
          allowFileAccess
          allowUniversalAccessFromFileURLs
          allowFileAccessFromFileURLs
          allowingReadAccessToURL={avatarReadAccessUri}
          mixedContentMode="always"
          javaScriptEnabled
          domStorageEnabled
          scrollEnabled={false}
          bounces={false}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          injectedJavaScript={WEBVIEW_STATIC_JS}
          onLoad={onLoad}
          onError={onError}
          onHttpError={onError}
          onMessage={onMessage}
        />
      ) : (
        <View style={styles.avatarLoading}>
          <View style={styles.loadingOrb} />
          <Text style={styles.loadingText}>{avatarError || 'Loading avatar...'}</Text>
          {!!avatarError && !!avatarUri && (
            <Text style={styles.loadingDetailText} numberOfLines={3}>
              uri: {String(avatarUri).slice(0, 200)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Summary Modal ────────────────────────────────────────────────────────────

function SummaryModal({ visible, duration, summary, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.summaryCard} onPress={() => {}}>
          <Text style={styles.summaryTitle}>Session Complete</Text>
          <Text style={styles.summaryDuration}>Session length: {duration}</Text>
          <Text style={styles.summaryBody}>{summary}</Text>
          <Pressable
            style={({ pressed }) => [styles.summaryCloseBtn, pressed && styles.btnPressed]}
            onPress={onClose}
          >
            <Text style={styles.summaryCloseBtnText}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── HomeScreen ───────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { locale, setLocale, t } = useLanguage();

  // ── Screen ──
  const [screen, setScreen]                       = useState('home');
  const [selectedSessionId, setSelectedSessionId] = useState(sessionCatalog[0].id);

  // ── Avatar ──
  const avatarConversationId                      = useRef(createSessionId()).current;
  const [avatarHtmlBase, setAvatarHtmlBase]       = useState(null);
  const [avatarModelUri, setAvatarModelUri]       = useState(null);
  const [avatarEnvUri, setAvatarEnvUri]           = useState(null);
  const [avatarReadAccessUri, setAvatarReadAccessUri] = useState(null);
  const [avatarLoadError, setAvatarLoadError]     = useState('');
  const [guideDockVisible, setGuideDockVisible]   = useState(false);
  const [dockExpanded, setDockExpanded]           = useState(false);
  const sessionWebViewRef                         = useRef(null);
  const homeDockWebViewRef                        = useRef(null);
  const homeDockLoadCount                         = useRef(0);
  const avatarVoiceId                             = useRef(null);
  const ttsBase64Cache                            = useRef(new Map());
  const ttsInFlight                               = useRef(new Map());

  // ── Session state ──
  const [sessionActive, setSessionActive]         = useState(false);
  const [sessionStatus, setSessionStatus]         = useState('Not started');
  const [sessionStartTime, setSessionStartTime]   = useState(null);
  const [placeholderMessage, setPlaceholderMessage] = useState('');

  // ── Script state (scripted sessions) ──
  const [scriptSlideIndex, setScriptSlideIndex] = useState(0);
  const [ttsVoiceReady, setTtsVoiceReady] = useState(false);

  // ── Modals ──
  const [summaryVisible, setSummaryVisible]   = useState(false);
  const [sessionSummary, setSessionSummary]   = useState('');
  const [sessionDuration, setSessionDuration] = useState('');

  // ── Completed-session tracking (Firestore) ──
  const [completedSessionIds, setCompletedSessionIds] = useState(() => new Set());
  const [homeGreetingName, setHomeGreetingName] = useState('');

  useEffect(() => {
    let unsubUser = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      if (!user) {
        setCompletedSessionIds(new Set());
        setHomeGreetingName('');
        return;
      }
      setHomeGreetingName(firstNameFromAuthDisplayName(user.displayName));
      const userRef = doc(db, 'users', user.uid);
      void (async () => {
        try {
          const snap = await getDoc(userRef);
          const data = snap.exists ? snap.data() : null;
          const fromDoc = greetingFirstNameFromUserDoc(data);
          if (fromDoc) {
            setHomeGreetingName(fromDoc);
          }
          const full =
            data &&
            typeof data.fullName === 'string' &&
            data.fullName.trim();
          const built =
            full ||
            [data?.firstName, data?.lastName]
              .filter((v) => typeof v === 'string' && v.trim())
              .join(' ')
              .trim();
          if (built && !user.displayName?.trim()) {
            void updateProfile(user, { displayName: built }).catch(() => {});
          }
        } catch {
          // Firestore rules or network — keep displayName-based greeting
        }
      })();
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const data = snap.exists ? snap.data() : null;
          const ids = data?.completedSessionIds;
          setCompletedSessionIds(new Set(Array.isArray(ids) ? ids : []));
          const fromDoc = greetingFirstNameFromUserDoc(data);
          setHomeGreetingName(
            fromDoc || firstNameFromAuthDisplayName(user.displayName) || '',
          );
        },
        () => {
          setCompletedSessionIds(new Set());
          setHomeGreetingName(
            firstNameFromAuthDisplayName(user.displayName) || '',
          );
        },
      );
    });
    return () => {
      if (unsubUser) unsubUser();
      unsubAuth();
    };
  }, []);

  const selectedSession = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
  const guideLabels = useMemo(() => ({
    openGuide: t('guideOpen'),
    hideGuide: t('guideHide'),
    barLabel: t('guideBarLabel'),
    barAction: t('guideBarAction'),
    dockKicker: t('guideDockKicker'),
    dockTitle: t('guideDockTitle'),
  }), [t]);
  const homeDockUri = useMemo(() => buildAvatarUri(avatarHtmlBase, {
    compact: '1', host: 'home-dock', chat_id: avatarConversationId, tts_base: AVATAR_TTS_SERVER, tts_voice: AVATAR_TTS_VOICE, tts_provider: AVATAR_TTS_PROVIDER, model_url: avatarModelUri, env_url: avatarEnvUri,
  }), [avatarHtmlBase, avatarConversationId, avatarModelUri, avatarEnvUri]);

  const sessionAvatarUri = useMemo(() => buildAvatarUri(avatarHtmlBase, {
    compact: '1', guided: '1', host: 'session-panel', session: selectedSessionId, chat_id: avatarConversationId, tts_base: AVATAR_TTS_SERVER, tts_voice: AVATAR_TTS_VOICE, tts_provider: AVATAR_TTS_PROVIDER, model_url: avatarModelUri, env_url: avatarEnvUri,
  }), [avatarHtmlBase, selectedSessionId, avatarConversationId, avatarModelUri, avatarEnvUri]);

  const getTtsPayload = useCallback(async (text) => {
    const key = (text || '').trim();
    if (!key) throw new Error('Missing TTS text');
    if (ttsInFlight.current.has(key)) return ttsInFlight.current.get(key);
    const job = fetchTtsPayloadForText(key, ttsBase64Cache.current).finally(() => {
      ttsInFlight.current.delete(key);
    });
    ttsInFlight.current.set(key, job);
    return job;
  }, []);

  const prefetchSessionTts = useCallback((sessionId) => {
    void (async () => {
      for (const segmentText of getAllSessionSegmentTexts(sessionId)) {
        try {
          await getTtsPayload(segmentText);
        } catch {
          // Keep prefetching remaining segments after a transient failure.
        }
      }
    })();
  }, [getTtsPayload]);

  useEffect(() => {
    fetch(`${AVATAR_TTS_SERVER}/health`).catch(() => {});
    fetch(`${AVATAR_TTS_SERVER}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Ready.',
        voice_name: AVATAR_TTS_VOICE,
        provider: AVATAR_TTS_PROVIDER,
      }),
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (screen !== 'session') {
      setTtsVoiceReady(false);
      return;
    }
    const session = sessionCatalog.find((s) => s.id === selectedSessionId);
    if (!session || session.kind !== 'scripted') {
      setTtsVoiceReady(true);
      return;
    }
    let cancelled = false;
    setTtsVoiceReady(false);
    const firstSegment = getFirstSessionSegmentText(selectedSessionId);
    if (!firstSegment) {
      setTtsVoiceReady(true);
      return undefined;
    }
    getTtsPayload(firstSegment)
      .then(() => {
        if (!cancelled) setTtsVoiceReady(true);
      })
      .catch(() => {
        if (!cancelled) setTtsVoiceReady(true);
      });
    prefetchSessionTts(selectedSessionId);
    return () => {
      cancelled = true;
    };
  }, [screen, selectedSessionId, getTtsPayload, prefetchSessionTts]);

  // ── Load avatar.html + avatar.glb + studio_lighting.hdr ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const htmlAsset = Asset.fromModule(require('../../assets/avatar.html'));
        const modelAsset = Asset.fromModule(require('../../assets/avatar.glb'));
        const envAsset = Asset.fromModule(require('../../assets/studio_lighting.hdr'));
        setAvatarLoadError('');
        await Promise.all([htmlAsset.downloadAsync(), modelAsset.downloadAsync(), envAsset.downloadAsync()]);
        const htmlUri = resolvePackagerAssetUri(htmlAsset);
        const modelUri = resolvePackagerAssetUri(modelAsset);
        const envUri = resolvePackagerAssetUri(envAsset);
        const readAccessUri = getFileUriParentDirectory(htmlAsset.localUri || htmlUri);
        if (!cancelled) {
          if (htmlUri && modelUri) {
            setAvatarHtmlBase(htmlUri);
            setAvatarModelUri(modelUri);
            setAvatarEnvUri(envUri || '');
            setAvatarReadAccessUri(readAccessUri);
          } else {
            setAvatarLoadError(
              'Avatar assets resolved to no URI. Check metro.config.js has assetExts for html, glb, and hdr, then run `npx expo start --clear`.',
            );
          }
        }
      } catch (err) {
        if (!cancelled) {
          const detail = err && (err.message || String(err));
          setAvatarLoadError(
            `Avatar asset failed: ${detail || 'unknown error'}`,
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAvatarWebViewError = useCallback((event) => {
    const native = event?.nativeEvent;
    const detail =
      (native && (native.description || native.statusCode || native.url)) ||
      'unknown WebView error';
    setAvatarLoadError(`WebView load failed: ${detail}`);
  }, []);

  // ── Pick a male English voice for native TTS ──
  useEffect(() => {
    const MALE_NAMES = ['alex', 'daniel', 'tom', 'evan', 'gordon', 'fred', 'rishi', 'aaron', 'lee', 'arthur'];
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const en = voices.filter((v) => v.language?.startsWith('en'));
        const male = en.find((v) =>
          MALE_NAMES.some((n) => v.identifier?.toLowerCase().includes(n) || v.name?.toLowerCase().includes(n))
        );
        if (male) avatarVoiceId.current = male.identifier;
      })
      .catch(() => {});
  }, []);

  const injectAvatarDone = useCallback(() => {
    const js = `(function(){try{if(typeof window.onNativeSpeakDone==='function')window.onNativeSpeakDone();}catch(e){}})();true;`;
    sessionWebViewRef.current?.injectJavaScript(js);
    homeDockWebViewRef.current?.injectJavaScript(js);
  }, []);

  // ── Handle messages sent from avatar.html via ReactNativeWebView.postMessage ──
  const handleWebViewMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'tts-fetch') {
        const host = msg.host || 'session-panel';
        const webViewRef = host === 'home-dock' ? homeDockWebViewRef : sessionWebViewRef;
        void (async () => {
          try {
            const ttsPayload = await getTtsPayload(msg.text || '');
            deliverTtsToWebView(webViewRef, msg.id, msg.text || '', ttsPayload);
          } catch (error) {
            console.warn('TTS fetch failed:', error);
            deliverTtsToWebView(webViewRef, msg.id, msg.text || '', null);
          }
        })();
      } else if (msg.type === 'native-speak') {
        // Fallback only when neural API TTS is unavailable in the WebView.
        const suspendJs = `(function(){try{if(typeof audioState!=='undefined'&&audioState.ctx&&audioState.ctx.state==='running')audioState.ctx.suspend();}catch(e){}})();true;`;
        sessionWebViewRef.current?.injectJavaScript(suspendJs);
        homeDockWebViewRef.current?.injectJavaScript(suspendJs);
        const resumeJs = `(function(){try{if(typeof audioState!=='undefined'&&audioState.ctx&&audioState.ctx.state==='suspended')audioState.ctx.resume();}catch(e){}})();true;`;
        const resumeCtx = () => {
          sessionWebViewRef.current?.injectJavaScript(resumeJs);
          homeDockWebViewRef.current?.injectJavaScript(resumeJs);
        };
        // Small delay so AudioContext fully releases the audio session before TTS starts
        setTimeout(() => {
          Speech.stop();
          Speech.speak(msg.text, {
            rate: 0.92,
            pitch: 1.0,
            voice: avatarVoiceId.current ?? undefined,
            onDone: () => { resumeCtx(); injectAvatarDone(); },
            onStopped: () => { resumeCtx(); injectAvatarDone(); },
            onError: () => { resumeCtx(); injectAvatarDone(); },
          });
        }, 120);
      } else if (msg.type === 'native-stop-speech') {
        Speech.stop();
        const resumeJs = `(function(){try{if(typeof audioState!=='undefined'&&audioState.ctx&&audioState.ctx.state==='suspended')audioState.ctx.resume();}catch(e){}})();true;`;
        sessionWebViewRef.current?.injectJavaScript(resumeJs);
        homeDockWebViewRef.current?.injectJavaScript(resumeJs);
      } else if (msg.type === 'native-dictate-hint') {
        Alert.alert(
          'Speak your message',
          'Tap the microphone key on your keyboard to dictate, then tap Send.',
        );
      }
    } catch {}
  }, [getTtsPayload, injectAvatarDone]);

  // ── Inject a postMessage event into the session avatar WebView ──
  // avatar.html listens for { source: 'mindfulness-host', type, ... } on window.
  const injectAvatarCommand = useCallback((command) => {
    const payload = JSON.stringify({ source: 'mindfulness-host', ...command });
    sessionWebViewRef.current?.injectJavaScript(
      `(function(){try{window._nativeHostCommand(${payload});}catch(e){}})();true;`
    );
  }, []);

  const speakChapterSegments = useCallback((sessionId, chapterIndex) => {
    const texts = getChapterSegmentTexts(sessionId, chapterIndex);
    if (!texts.length) return;
    injectAvatarCommand({ type: 'host-speak-script-segments', texts });
  }, [injectAvatarCommand]);

  // ── Called after the session WebView finishes loading ──
  // Always hides the avatar's built-in Start/End buttons.
  // Only re-injects context when returning to an already-active session (resume).
  const handleSessionAvatarLoad = useCallback(() => {
    setTimeout(() => {
      sessionWebViewRef.current?.injectJavaScript(HIDE_CONTROLS_JS);
    }, 300);
    setTimeout(() => {
      prefetchSessionTts(selectedSessionId);
      const segmentTexts = getAllSessionSegmentTexts(selectedSessionId);
      if (segmentTexts.length) {
        injectAvatarCommand({ type: 'host-prefetch-tts', texts: segmentTexts });
      }
    }, 500);
    if (!sessionActive) return;
    setTimeout(() => {
      const session = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
      if (session.kind === 'scripted') {
        const chapterIndex = getChapterIndexForSegment(session.id, scriptSlideIndex);
        speakChapterSegments(session.id, chapterIndex);
      }
    }, 700);
  }, [selectedSessionId, sessionActive, scriptSlideIndex, injectAvatarCommand, prefetchSessionTts, speakChapterSegments]);

  const handleHomeDockLoad = useCallback(() => {
    setTimeout(() => {
      homeDockWebViewRef.current?.injectJavaScript(HIDE_HOME_CONTROLS_JS);
    }, 300);
    homeDockLoadCount.current += 1;
  }, []);

  // ── Navigation guards ──
  useLayoutEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!BackHandler?.addEventListener) return undefined;
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (screen === 'session') { setScreen('home'); return true; }
        return true;
      });
      return () => sub.remove();
    }, [screen]),
  );

  // ── Auth ──
  const handleLogout = useCallback(async () => {
    try { await signOut(auth); } catch { /* ignore */ }
  }, []);

  const toggleLanguage = useCallback(() => {
    void setLocale(locale === 'en' ? 'ko' : 'en');
  }, [locale, setLocale]);

  const handleSettings = useCallback(() => {
    Alert.alert(t('cardSettingsTitle'), 'Coming soon.');
  }, [t]);

  // ── Session logic ──
  const openSession = useCallback((id) => {
    setSelectedSessionId(id);
    setScreen('session');
    // If switching to a different session while one is active, clear it silently
    if (sessionActive && selectedSessionId !== id) {
      setSessionActive(false);
      setSessionStatus('Not started');
      setSessionStartTime(null);
      setPlaceholderMessage('');
      setScriptSlideIndex(0);
      injectAvatarCommand({ type: 'host-end-session' });
    }
  }, [sessionActive, selectedSessionId, injectAvatarCommand]);

  // Called when the user explicitly presses Start Session
  const startSession = useCallback(async () => {
    const session = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
    setSummaryVisible(false);
    setSessionStartTime(Date.now());
    setSessionActive(true);
    setSessionStatus('Session active');
    if (session.kind === 'scripted') {
      const chapters = getSessionChapters(session.id);
      setScriptSlideIndex(chapters[0]?.startIndex ?? 0);
      const firstSegment = getChapterSegmentTexts(session.id, 0)[0];
      if (firstSegment) {
        try {
          await getTtsPayload(firstSegment);
        } catch {
          // Speak anyway; avatar will retry or fall back.
        }
      }
      speakChapterSegments(session.id, 0);
      prefetchSessionTts(session.id);
      return;
    }
    setPlaceholderMessage(`${session.title} is intentionally empty right now.`);
    prefetchSessionTts(session.id);
    injectAvatarCommand({ type: 'host-speak-script', text: PLACEHOLDER_SESSION_LINE });
  }, [selectedSessionId, injectAvatarCommand, prefetchSessionTts, getTtsPayload, speakChapterSegments]);

  const endSession = useCallback(() => {
    if (!sessionActive) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000));
    setSessionDuration(formatDuration(elapsed));
    const session = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
    const chapters = getSessionChapters(session.id);
    const chapterIndex = session.kind === 'scripted'
      ? getChapterIndexForSegment(session.id, scriptSlideIndex)
      : 0;
    const completed =
      session.kind !== 'scripted' ||
      (chapters.length > 0 && chapterIndex >= chapters.length - 1);
    setSessionSummary(
      session.kind === 'scripted'
        ? completed
          ? `You completed the full ${session.title} session.`
          : `You ended ${session.title} after part ${chapterIndex + 1} of ${chapters.length}.`
        : `${session.title} ended.`
    );
    void recordCompletedSession({
      sessionId: session.id,
      sessionTitle: session.title,
      durationSeconds: elapsed,
      completed,
      metadata: {
        kind: session.kind,
        scriptSlideIndex,
        scriptChapters: chapters.length,
        scriptChapterIndex: chapterIndex,
      },
    }).catch((error) => {
      console.warn('Failed to record session tracking data', error);
    });
    setSummaryVisible(true);
    setSessionActive(false);
    setSessionStatus('Not started');
    setSessionStartTime(null);
    setPlaceholderMessage('');
    setScriptSlideIndex(0);
    injectAvatarCommand({ type: 'host-end-session' });
  }, [sessionActive, sessionStartTime, selectedSessionId, scriptSlideIndex, injectAvatarCommand]);

  const goToNextScriptSegment = useCallback(() => {
    const chapters = getSessionChapters(selectedSessionId);
    const currentChapter = getChapterIndexForSegment(selectedSessionId, scriptSlideIndex);
    if (currentChapter >= chapters.length - 1) {
      endSession();
      return;
    }
    const nextChapter = currentChapter + 1;
    const nextStart = chapters[nextChapter]?.startIndex ?? scriptSlideIndex + 1;
    setScriptSlideIndex(nextStart);
    const segmentTexts = getChapterSegmentTexts(selectedSessionId, nextChapter);
    const firstSegment = segmentTexts[0];
    if (firstSegment) {
      getTtsPayload(firstSegment)
        .then(() => speakChapterSegments(selectedSessionId, nextChapter))
        .catch(() => speakChapterSegments(selectedSessionId, nextChapter));
    } else {
      speakChapterSegments(selectedSessionId, nextChapter);
    }
    getChapterSegmentTexts(selectedSessionId, nextChapter + 1).forEach((segmentText) => {
      getTtsPayload(segmentText).catch(() => {});
    });
  }, [scriptSlideIndex, selectedSessionId, endSession, speakChapterSegments, getTtsPayload]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={[styles.header, screen === 'session' && styles.headerCompact]}>
        <View style={styles.langContainer}>
          <Text style={[styles.globeText, screen === 'session' && styles.globeTextCompact]}>Language</Text>
          <Pressable
            onPress={toggleLanguage}
            style={({ pressed }) => [styles.langBtn, screen === 'session' && styles.langBtnCompact, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.langBtnText}>{locale.toUpperCase()}</Text>
          </Pressable>
        </View>
        <Text style={[styles.headerTitle, screen === 'session' && styles.headerTitleCompact]}>
          {t('homeTitle', {
            name: homeGreetingName || t('homeTitleFallbackName'),
          })}
        </Text>
        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [styles.logoutBtn, pressed && styles.topBtnPressed]}
          accessibilityRole="button"
        >
          <Text style={styles.logoutText}>{t('logOut')}</Text>
        </Pressable>
      </View>

      {/* ══ HOME SCREEN — full scrollable ══ */}
      {screen === 'home' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.container,
            guideDockVisible && !dockExpanded && styles.containerWithGuideBar,
            guideDockVisible && dockExpanded && styles.containerWithExpandedDock,
          ]}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>{t('guideEyebrow')}</Text>
            <Text style={styles.heroBody}>{t('guideHeroBody')}</Text>
            <View style={styles.heroActions}>
              {!guideDockVisible || !dockExpanded ? (
                <Pressable
                  style={({ pressed }) => [styles.heroBtnPrimary, pressed && styles.btnPressed]}
                  onPress={() => { setGuideDockVisible(true); setDockExpanded(true); }}
                >
                  <Text style={styles.heroBtnPrimaryText}>{t('guideOpen')}</Text>
                </Pressable>
              ) : (
                <Pressable style={({ pressed }) => [styles.heroBtnPrimary, pressed && styles.btnPressed]} onPress={() => openSession(sessionCatalog[0].id)}>
                  <Text style={styles.heroBtnPrimaryText}>{t('startCaregiverFatigue')}</Text>
                </Pressable>
              )}
              <Pressable style={({ pressed }) => [styles.heroBtnSecondary, pressed && styles.btnPressed]} onPress={() => openSession(selectedSessionId)}>
                <Text style={styles.heroBtnSecondaryText}>{t('exploreSessions')}</Text>
              </Pressable>
            </View>
          </View>

          {sessionActive && (
            <View style={styles.resumeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>{t('sessionInProgress')}</Text>
                <Text style={styles.resumeBody}>{t('sessionStillActive', { title: selectedSession.title })}</Text>
              </View>
              <Pressable style={({ pressed }) => [styles.heroBtnPrimary, { marginTop: 0 }, pressed && styles.btnPressed]} onPress={() => setScreen('session')}>
                <Text style={styles.heroBtnPrimaryText}>{t('resumeSession')}</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('sessionSectionTitle')}</Text>
          <View style={styles.sessionGrid}>
            {sessionCatalog.map((s) => {
              const isAvailable = s.kind !== 'placeholder';
              const selected  = selectedSessionId === s.id;
              const disabled  = sessionActive && selectedSessionId !== s.id;
              const completed = completedSessionIds.has(s.id);
              const badgeLabel = completed
                ? t('sessionBadgeCompleted')
                : isAvailable
                  ? t('sessionBadgeAvailable')
                  : t('sessionBadgeComingSoon');
              const metaLabel = isAvailable ? s.duration : t('sessionDurationComingSoon');
              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.sessionTile,
                    isAvailable ? styles.sessionTileGuided : styles.sessionTilePlaceholder,
                    completed && styles.sessionTileCompleted,
                    selected && styles.sessionTileSelected,
                    disabled && styles.btnDisabled,
                    pressed && !disabled && styles.btnPressed,
                  ]}
                  onPress={() => openSession(s.id)}
                  disabled={disabled}
                >
                  <View style={styles.sessionTileTop}>
                    <Text style={styles.sessionNumber}>{s.number}</Text>
                    <View
                      style={[
                        styles.pill,
                        completed
                          ? styles.pillCompleted
                          : isAvailable
                            ? styles.pillGuided
                            : styles.pillEmpty,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          completed
                            ? styles.pillTextCompleted
                            : isAvailable
                              ? styles.pillTextGuided
                              : styles.pillTextEmpty,
                        ]}
                      >
                        {badgeLabel}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.sessionTileTitle}>{s.title}</Text>
                  {!!s.description && <Text style={styles.sessionTileDesc}>{s.description}</Text>}
                  <Text style={styles.sessionTileMeta}>{metaLabel}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('cardAboutTitle')}</Text>
            <Text style={styles.cardText}>{t('cardAboutText')}</Text>
          </View>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('cardUpdatesTitle')}</Text>
            <Text style={styles.cardText}>{t('cardUpdatesText')}</Text>
          </View>
          <Pressable onPress={handleSettings} style={({ pressed }) => [styles.card, pressed && styles.btnPressed]}>
            <Text style={styles.cardTitle}>{t('cardSettingsTitle')}</Text>
            <Text style={styles.cardText}>{t('cardSettingsText')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ══ SESSION SCREEN — single viewport, no scroll ══ */}
      {screen === 'session' && (
        <View style={styles.sessionRoot}>
          <View style={styles.sessionNavBar}>
            <Pressable
              style={({ pressed }) => [styles.sessionBackBtn, pressed && styles.btnPressed]}
              onPress={() => setScreen('home')}
              accessibilityRole="button"
              accessibilityLabel="Back to sessions list"
            >
              <Text style={styles.sessionBackBtnText}>← Sessions</Text>
            </Pressable>
            {sessionActive && (
              <Pressable
                style={({ pressed }) => [styles.endBtn, pressed && styles.btnPressed]}
                onPress={endSession}
                accessibilityRole="button"
              >
                <Text style={styles.endBtnText}>End Session</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.sessionBody}>
            <View style={styles.sessionTopSection}>
              <View style={styles.detailHero}>
                <View style={styles.detailMetaRow}>
                  <Text style={styles.detailNumber}>{selectedSession.number}</Text>
                  <View style={[styles.pill, selectedSession.kind !== 'placeholder' ? styles.pillGuided : styles.pillEmpty]}>
                    <Text style={[styles.pillText, selectedSession.kind !== 'placeholder' ? styles.pillTextGuided : styles.pillTextEmpty]}>
                      {selectedSession.kind === 'scripted' ? t('sessionDetailGuided') : t('sessionDetailComingSoon')}
                    </Text>
                  </View>
                  {sessionActive && (
                    <Text style={styles.detailStatus} numberOfLines={1}>{sessionStatus}</Text>
                  )}
                </View>
                <Text style={styles.detailTitle} numberOfLines={sessionActive ? 1 : 2}>
                  {selectedSession.title}
                </Text>
                <Text
                  style={styles.detailDescription}
                  numberOfLines={sessionActive ? 1 : 2}
                  ellipsizeMode="tail"
                >
                  {selectedSession.description}
                </Text>
                {!sessionActive && selectedSession.kind === 'scripted' && (
                  <Pressable
                    style={({ pressed }) => [
                      styles.startBtnFull,
                      !ttsVoiceReady && styles.startBtnUnavailable,
                      pressed && ttsVoiceReady && styles.btnPressed,
                    ]}
                    onPress={startSession}
                    disabled={!ttsVoiceReady}
                    accessibilityRole="button"
                    accessibilityLabel={ttsVoiceReady ? 'Start session' : 'Preparing voice'}
                  >
                    <Text style={styles.startBtnFullText}>
                      {ttsVoiceReady ? 'Start session' : 'Preparing voice…'}
                    </Text>
                  </Pressable>
                )}
                {!sessionActive && selectedSession.kind !== 'scripted' && (
                  <View style={styles.startBtnUnavailable}>
                    <Text style={styles.startBtnUnavailableText}>{t('sessionDetailComingSoon')}</Text>
                  </View>
                )}
              </View>

              {selectedSession.kind === 'scripted' && sessionActive && (() => {
                const chapters = getSessionChapters(selectedSession.id);
                const total = chapters.length;
                const currentChapter = getChapterIndexForSegment(selectedSession.id, scriptSlideIndex);
                const chapter = chapters[currentChapter];
                const pct = total > 0 ? ((currentChapter + 1) / total) * 100 : 0;
                const isLast = currentChapter >= total - 1;
                return (
                  <View style={styles.progressCard}>
                    <Text style={styles.progressLabel}>
                      Part {currentChapter + 1} of {total}
                    </Text>
                    {!!chapter?.title && (
                      <Text style={styles.progressChapterTitle} numberOfLines={1}>{chapter.title}</Text>
                    )}
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Pressable
                      style={({ pressed }) => [styles.continueBtn, pressed && styles.btnPressed]}
                      onPress={goToNextScriptSegment}
                      accessibilityRole="button"
                      accessibilityLabel={isLast ? 'Finish session' : 'Continue to next part'}
                    >
                      <Text style={styles.continueBtnText}>{isLast ? 'Finish session' : 'Continue'}</Text>
                    </Pressable>
                  </View>
                );
              })()}
            </View>

            <SessionAvatarPanel
              avatarUri={sessionAvatarUri}
              avatarError={avatarLoadError}
              avatarReadAccessUri={avatarReadAccessUri}
              webViewRef={sessionWebViewRef}
              onLoad={handleSessionAvatarLoad}
              onError={handleAvatarWebViewError}
              onMessage={handleWebViewMessage}
            />
          </View>
        </View>
      )}

      {/* ── Floating avatar dock — always mounted, hidden on session screen ── */}
      <FloatingAvatarDock
        avatarUri={homeDockUri}
        avatarError={avatarLoadError}
        avatarReadAccessUri={avatarReadAccessUri}
        expanded={dockExpanded}
        visible={screen === 'home' && guideDockVisible}
        onToggle={() => setDockExpanded((v) => !v)}
        webViewRef={homeDockWebViewRef}
        onLoad={handleHomeDockLoad}
        onError={handleAvatarWebViewError}
        onMessage={handleWebViewMessage}
        labels={guideLabels}
      />

      <SummaryModal
        visible={summaryVisible}
        duration={sessionDuration}
        summary={sessionSummary}
        onClose={() => { setSummaryVisible(false); setScreen('home'); }}
      />

    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardShadow = Platform.select({
  ios:     { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 10 },
  android: { elevation: 4 },
  default: {},
});

const styles = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: ThemeColor.SCREEN_BG },
  scroll:    { flex: 1 },
  container: { padding: 16, paddingBottom: 32, maxWidth: 520, width: '100%', alignSelf: 'center' },
  containerWithGuideBar: { paddingBottom: 100 },
  containerWithExpandedDock: { paddingBottom: DOCK_HEIGHT + 24 },

  // Header
  header:        { backgroundColor: ThemeColor.BRAND, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  headerCompact: { paddingVertical: 8 },
  headerTitle:   { flex: 1, color: ThemeColor.WHITE, fontSize: 18, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  headerTitleCompact: { fontSize: 16 },
  langContainer: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 6 },
  globeText:     { color: ThemeColor.WHITE, fontSize: 11, fontWeight: '700' },
  globeTextCompact: { fontSize: 10 },
  langBtn:       { minWidth: 34, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: ThemeRadius.SM, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
  langBtnCompact:{ minHeight: 28 },
  langBtnText:   { color: ThemeColor.WHITE, fontSize: 13, fontWeight: '700' },
  logoutBtn:     { width: 92, alignItems: 'flex-end', paddingVertical: 6 },
  logoutText:    { color: ThemeColor.WHITE, fontWeight: '700', fontSize: 14 },

  // Hero
  hero:                { borderRadius: 16, backgroundColor: ThemeColor.BRAND, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12, gap: 8 },
  heroEyebrow:         { color: 'rgba(255,255,255,0.72)', fontSize: 12, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle:           { color: ThemeColor.WHITE, fontSize: 28, fontWeight: '900', lineHeight: 32 },
  heroBody:            { color: 'rgba(255,255,255,0.84)', fontSize: 14, lineHeight: 21 },
  heroActions:         { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  heroBtnPrimary:      { backgroundColor: ThemeColor.WHITE, borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16 },
  heroBtnPrimaryText:  { color: ThemeColor.BRAND, fontWeight: '800', fontSize: 14 },
  heroBtnSecondary:    { borderRadius: 10, paddingVertical: 11, paddingHorizontal: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },
  heroBtnSecondaryText:{ color: ThemeColor.WHITE, fontWeight: '700', fontSize: 14 },

  // Resume banner
  resumeCard:  { backgroundColor: ThemeColor.WHITE, borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, ...cardShadow },
  resumeTitle: { fontSize: 14, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, marginBottom: 2 },
  resumeBody:  { fontSize: 13, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 18 },

  // ── Guide bar (home screen, collapsed) ──
  guideBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
  },
  guideBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: ThemeColor.BRAND,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 56,
    ...Platform.select({
      ios:     { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  guideBarOrb:        { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.9)' },
  guideBarTextWrap:   { flex: 1 },
  guideBarTitle:      { color: ThemeColor.WHITE, fontSize: 16, fontWeight: '800' },
  guideBarAction:     { color: 'rgba(255,255,255,0.82)', fontSize: 13, marginTop: 2 },
  guideBarChevron:    { color: ThemeColor.WHITE, fontSize: 28, fontWeight: '300', lineHeight: 28 },

  floatingDock: {
    position: 'absolute', bottom: 12, right: 16, left: 16,
    width: undefined,
    height: DOCK_HEIGHT,
    borderRadius: 18, overflow: 'hidden', backgroundColor: '#0d1b36', zIndex: 200,
    ...Platform.select({
      ios:     { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 18 },
      android: { elevation: 10 },
    }),
  },
  floatingHidden:      { opacity: 0 },
  floatingDockHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#172861' },
  floatingDockKicker:  { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  floatingDockTitle:   { color: ThemeColor.WHITE, fontSize: 14, fontWeight: '700', marginTop: 2 },
  floatingDockHideText:{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },
  dockWebView:         { flex: 1, backgroundColor: '#0d1b36' },

  // Avatar loading state
  avatarLoading:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#0d1b36', paddingHorizontal: 16 },
  loadingOrb:        { width: 48, height: 48, borderRadius: 24, backgroundColor: ThemeColor.BRAND, opacity: 0.5 },
  loadingText:       { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' },
  loadingDetailText: { color: 'rgba(255,255,255,0.5)', fontSize: 10, textAlign: 'center' },

  // ── Session avatar (fills remaining viewport) ──
  sessionAvatarPanel: { flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', marginTop: 6, backgroundColor: '#0d1b36', ...cardShadow },
  sessionWebView:     { flex: 1, width: '100%', backgroundColor: '#0d1b36' },

  // Session grid
  sectionTitle:           { fontSize: 20, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, marginBottom: 12, marginTop: 4 },
  sessionGrid:            { gap: 10, marginBottom: 20 },
  sessionTile:            { width: '100%', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1.5 },
  sessionTileGuided:      { backgroundColor: '#e8edf7', borderColor: 'rgba(31,60,136,0.2)' },
  sessionTilePlaceholder: { backgroundColor: ThemeColor.WHITE, borderColor: 'rgba(31,60,136,0.1)' },
  sessionTileCompleted:   { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  sessionTileSelected:    { borderColor: ThemeColor.BRAND, borderWidth: 2 },
  sessionTileTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionNumber:          { fontSize: 20, fontWeight: '900', color: ThemeColor.BRAND },
  sessionTileTitle:       { fontSize: 16, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, lineHeight: 22 },
  sessionTileDesc:        { fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 21 },
  sessionTileMeta:        { fontSize: 13, color: ThemeColor.HOME_SUBTITLE, fontWeight: '600' },

  // Pills
  pill:              { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillGuided:        { backgroundColor: ThemeColor.BRAND },
  pillEmpty:         { backgroundColor: '#e8edf7' },
  pillCompleted:     { backgroundColor: '#16a34a' },
  pillText:          { fontSize: 11, fontWeight: '800' },
  pillTextGuided:    { color: ThemeColor.WHITE },
  pillTextEmpty:     { color: ThemeColor.HOME_SUBTITLE },
  pillTextCompleted: { color: ThemeColor.WHITE },

  // Info cards
  card:          { backgroundColor: ThemeColor.WHITE, padding: 20, borderRadius: 8, borderTopWidth: 4, borderTopColor: ThemeColor.BRAND, marginBottom: 14, ...cardShadow },
  cardTitle:     { fontSize: 18, fontWeight: '700', color: ThemeColor.BRAND, marginBottom: 5 },
  cardText:      { color: ThemeColor.HOME_CARD_TEXT, lineHeight: 22 },

  // Session screen — fixed viewport, no scroll
  sessionRoot: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: ThemeColor.SCREEN_BG,
  },
  sessionNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: ThemeColor.SCREEN_BG,
    paddingHorizontal: 16,
    paddingVertical: 6,
    minHeight: 44,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(31,60,136,0.12)',
  },
  sessionBackBtn: {
    minHeight: 44,
    minWidth: 140,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  sessionBackBtnText: {
    color: ThemeColor.BRAND,
    fontWeight: '800',
    fontSize: 17,
  },
  sessionBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  sessionTopSection: {
    flexShrink: 0,
  },

  endBtn:           { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, borderColor: 'rgba(180,40,40,0.4)', backgroundColor: 'rgba(220,50,50,0.08)', minHeight: 44, justifyContent: 'center' },
  endBtnText:       { color: '#c0392b', fontWeight: '800', fontSize: 14 },
  detailHero:       { backgroundColor: ThemeColor.WHITE, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6, gap: 8, ...cardShadow },
  detailMetaRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  detailNumber:     { fontSize: 26, fontWeight: '900', color: ThemeColor.BRAND },
  detailStatus:     { fontSize: 13, color: ThemeColor.HOME_SUBTITLE, fontWeight: '700', marginLeft: 'auto', flexShrink: 1 },
  detailTitle:      { fontSize: 20, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, lineHeight: 26 },
  detailDescription:{ fontSize: 17, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 24 },
  startBtnFull: {
    backgroundColor: ThemeColor.BRAND,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    width: '100%',
    marginTop: 2,
  },
  startBtnFullText: {
    color: ThemeColor.WHITE,
    fontWeight: '800',
    fontSize: 19,
    letterSpacing: 0.2,
  },
  startBtnUnavailable: {
    backgroundColor: '#eef1f7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    width: '100%',
    marginTop: 2,
    borderWidth: 1,
    borderColor: 'rgba(31,60,136,0.12)',
  },
  startBtnUnavailableText: {
    color: ThemeColor.HOME_SUBTITLE,
    fontWeight: '800',
    fontSize: 17,
  },

  placeholderCard:  { backgroundColor: ThemeColor.WHITE, borderRadius: 16, padding: 18, gap: 8, marginBottom: 16, ...cardShadow },
  placeholderTitle: { fontSize: 17, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY },
  placeholderBody:  { fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 21 },
  progressCard:     { backgroundColor: ThemeColor.WHITE, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6, gap: 6, ...cardShadow },
  progressLabel:    { fontSize: 16, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY },
  progressChapterTitle: { fontSize: 14, fontWeight: '600', color: ThemeColor.BRAND, lineHeight: 20 },
  progressTrack:    { height: 8, borderRadius: 4, backgroundColor: 'rgba(31,60,136,0.12)', overflow: 'hidden' },
  progressFill:     { height: '100%', backgroundColor: ThemeColor.BRAND, borderRadius: 4 },
  continueBtn:      { backgroundColor: ThemeColor.BRAND, borderRadius: 12, paddingVertical: 12, alignItems: 'center', minHeight: 48, justifyContent: 'center' },
  continueBtnText:  { color: ThemeColor.WHITE, fontWeight: '800', fontSize: 17 },

  // Summary modal
  overlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  summaryCard:         { width: '100%', maxWidth: 380, backgroundColor: ThemeColor.WHITE, borderRadius: 20, padding: 24, gap: 10 },
  summaryTitle:        { fontSize: 20, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, textAlign: 'center' },
  summaryDuration:     { fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, textAlign: 'center' },
  summaryBody:         { fontSize: 15, color: ThemeColor.TEXT_PRIMARY, lineHeight: 22 },
  summaryCloseBtn:     { backgroundColor: ThemeColor.BRAND, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  summaryCloseBtnText: { color: ThemeColor.WHITE, fontWeight: '800', fontSize: 15 },

  // Shared
  btnDisabled:   { opacity: 0.4 },
  btnPressed:    { opacity: 0.85 },
  topBtnPressed: { opacity: 0.82 },
});
