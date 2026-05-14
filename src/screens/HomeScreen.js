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
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { WebView } from 'react-native-webview';
import { Asset } from 'expo-asset';
import * as Speech from 'expo-speech';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { recordCompletedSession } from '../utils/sessionTracking';

// ─── Constants ────────────────────────────────────────────────────────────────

const API_BASE_URL     = 'https://multilingual-virtual-assistant.onrender.com';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const DOCK_WIDTH           = Math.min(SCREEN_WIDTH - 32, 320);
const DOCK_HEIGHT          = 480;
const SESSION_AVATAR_HEIGHT = Math.max(320, Math.round(SCREEN_HEIGHT * 0.62));

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
    '@media(max-width:860px){.layout{grid-template-rows:minmax(160px,40%) 1fr!important}}';
  document.head.appendChild(s);
  var vm=document.querySelector('meta[name="viewport"]');
  if(vm)vm.setAttribute('content','width=device-width,initial-scale=1,maximum-scale=1');
  var sr=document.querySelector('.sr');
  if(sr)sr.style.cssText='display:none!important';
  /* Warm up the Render server so TTS isn't slow on first use */
  setTimeout(function(){try{fetch('https://multilingual-virtual-assistant.onrender.com/health',{method:'GET'}).catch(function(){});}catch(e){}},1000);
}catch(e){}})();true;`;

// Keep the old name as an alias so existing injectJavaScript() call-sites still compile
const HIDE_CONTROLS_JS = WEBVIEW_STATIC_JS;

const INITIAL_CHAT_MESSAGE = {
  id: 'assistant-welcome',
  role: 'assistant',
  content: 'Hi, I can answer general mindfulness questions and explain any session tile in the app. Open a session first if you want details about that specific practice.',
};

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

// Build the session avatar start prompt — used on fresh start and on resume
function buildSessionStartPrompt(session, scriptSlideIndex = 0) {
  if (session.kind === 'scripted') {
    const segments = SESSION_SCRIPTS[session.id] || [];
    const segment  = segments[scriptSlideIndex] || segments[0];
    if (!segment) return `Welcome to the ${session.title} session.`;
    return segment.text;
  }

  return [
    `You are opening the ${session.title} mindfulness session.`,
    'Reply with a short, warm welcome only.',
    'Say you are the user\'s mindfulness assistant and you are here to help.',
    'Ask how they are doing today.',
  ].join(' ');
}

function buildChatPrompt(message, sessionContext) {
  if (!sessionContext?.selectedSession) {
    return [
      'App context: The mobile mindfulness app has 12 selectable session tiles.',
      'Sessions 1 and 4 have scripted content.',
      'The other 10 session pages are placeholders for future guided content.',
      `User message: ${message}`,
    ].join('\n');
  }
  const lines = [
    'App context: The mobile mindfulness app has 12 selectable session tiles.',
    `Current session title: ${sessionContext.selectedSession.title}`,
    `Session status: ${sessionContext.sessionActive ? 'active' : 'not started'}`,
  ];
  if (sessionContext.selectedSession.kind === 'scripted') {
    const segments = SESSION_SCRIPTS[sessionContext.selectedSession.id] || [];
    lines.push(`This is a scripted session with ${segments.length} passages. Current passage: ${(sessionContext.scriptSlideIndex || 0) + 1}.`);
  }
  lines.push(`User message: ${message}`);
  return lines.join('\n');
}

function buildLocalChatFallback(_message, sessionContext) {
  if (sessionContext?.selectedSession?.kind === 'scripted') {
    const segments = SESSION_SCRIPTS[sessionContext.selectedSession.id] || [];
    return `${sessionContext.selectedSession.title} is a scripted session with ${segments.length} passages.`;
  }
  if (sessionContext?.selectedSession) {
    return `${sessionContext.selectedSession.title} is currently a placeholder session.`;
  }
  return 'This app has 12 session tiles. Sessions 1 and 4 have scripted content; the other 10 session pages are placeholders for future exercises.';
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

// ─── Floating Avatar Dock ─────────────────────────────────────────────────────
// Always mounted — opacity:0 + pointerEvents:none when not visible so the
// WebView keeps running and localStorage / chat state survives screen transitions.

function FloatingAvatarDock({ avatarUri, avatarError, expanded, visible, onToggle, webViewRef, onLoad, onMessage, onError }) {
  const hiddenStyle = !visible && styles.floatingHidden;

  if (!expanded) {
    return (
      <View pointerEvents={visible ? 'auto' : 'none'} style={[styles.floatingBtnWrap, hiddenStyle]}>
        <Pressable style={styles.floatingBtn} onPress={onToggle} accessibilityRole="button" accessibilityLabel="Open avatar guide">
          <View style={styles.floatingBtnOrb} />
          <Text style={styles.floatingBtnLabel}>Guide</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View pointerEvents={visible ? 'auto' : 'none'} style={[styles.floatingDock, hiddenStyle]}>
      <View style={styles.floatingDockHeader}>
        <View>
          <Text style={styles.floatingDockKicker}>Mini Guide</Text>
          <Text style={styles.floatingDockTitle}>Mindfulness guide</Text>
        </View>
        <Pressable onPress={onToggle} hitSlop={10}>
          <Text style={styles.floatingDockHideText}>Hide</Text>
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

// ─── Session Avatar Panel ─────────────────────────────────────────────────────

function SessionAvatarPanel({ avatarUri, avatarError, webViewRef, onLoad, onMessage, onError }) {
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

// ─── Chat Modal ───────────────────────────────────────────────────────────────

function ChatModal({ visible, onClose, sessionContext }) {
  const [messages, setMessages] = useState([INITIAL_CHAT_MESSAGE]);
  const [draft, setDraft]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [status, setStatus]     = useState('Ready');
  const chatSessionId           = useRef(createSessionId()).current;
  const scrollRef               = useRef(null);

  useEffect(() => {
    if (visible) setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [visible, messages]);

  const send = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    setMessages((prev) => [...prev, { id: `user-${Date.now()}`, role: 'user', content: trimmed }]);
    setDraft('');
    setBusy(true);
    setStatus('Thinking…');
    try {
      const res = await fetch(`${API_BASE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: buildChatPrompt(trimmed, sessionContext), session_id: chatSessionId }),
      });
      if (!res.ok) throw new Error(await res.text() || 'Request failed');
      const data = await res.json();
      setMessages((prev) => [...prev, { id: `assistant-${Date.now()}`, role: 'assistant', content: data.reply || '(No response.)' }]);
      setStatus('Ready');
    } catch {
      setMessages((prev) => [...prev, { id: `fallback-${Date.now()}`, role: 'assistant', content: buildLocalChatFallback(trimmed, sessionContext) }]);
      setStatus('Offline fallback');
    } finally {
      setBusy(false);
    }
  }, [draft, busy, chatSessionId, sessionContext]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <Pressable style={styles.overlayDismiss} onPress={onClose}>
          <Pressable style={styles.chatSheet} onPress={() => {}}>
            {/* Header */}
            <View style={styles.sheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Mindfulness Chat</Text>
                <Text style={styles.sheetSubtitle}>
                  {sessionContext?.selectedSession
                    ? `Context: ${sessionContext.selectedSession.title}`
                    : 'Context: general app help'}
                </Text>
              </View>
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <Text style={styles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            {/* Status */}
            <Text style={styles.chatStatus}>Assistant: {status}</Text>

            {/* Messages — tall scrollable area */}
            <ScrollView
              ref={scrollRef}
              style={styles.chatWindow}
              contentContainerStyle={styles.chatWindowContent}
              showsVerticalScrollIndicator
            >
              {messages.map((msg) => (
                <View key={msg.id} style={[styles.messageBubble, msg.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant]}>
                  <Text style={[styles.messageText, msg.role === 'user' ? styles.messageTextUser : styles.messageTextAssistant]}>
                    {msg.content}
                  </Text>
                </View>
              ))}
            </ScrollView>

            {/* Composer */}
            <View style={styles.composer}>
              <TextInput
                style={styles.chatInput}
                value={draft}
                onChangeText={setDraft}
                placeholder="Type a message…"
                placeholderTextColor={ThemeColor.PLACEHOLDER}
                editable={!busy}
                multiline
                onSubmitEditing={send}
                returnKeyType="send"
              />
              <Pressable
                style={({ pressed }) => [styles.sendBtn, (!draft.trim() || busy) && styles.btnDisabled, pressed && styles.btnPressed]}
                onPress={send}
                disabled={!draft.trim() || busy}
              >
                <Text style={styles.sendBtnText}>Send</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
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
  const [avatarLoadError, setAvatarLoadError]     = useState('');
  const [dockExpanded, setDockExpanded]           = useState(true);
  const sessionWebViewRef                         = useRef(null);
  const homeDockWebViewRef                        = useRef(null);
  const homeDockLoadCount                         = useRef(0);
  const avatarVoiceId                             = useRef(null);

  // ── Session state ──
  const [sessionActive, setSessionActive]         = useState(false);
  const [sessionStatus, setSessionStatus]         = useState('Not started');
  const [sessionStartTime, setSessionStartTime]   = useState(null);
  const [placeholderMessage, setPlaceholderMessage] = useState('');

  // ── Script state (scripted sessions) ──
  const [scriptSlideIndex, setScriptSlideIndex] = useState(0);

  // ── Modals ──
  const [summaryVisible, setSummaryVisible]   = useState(false);
  const [sessionSummary, setSessionSummary]   = useState('');
  const [sessionDuration, setSessionDuration] = useState('');

  // ── Completed-session tracking (Firestore) ──
  const [completedSessionIds, setCompletedSessionIds] = useState(() => new Set());

  useEffect(() => {
    let unsubUser = null;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }
      if (!user) {
        setCompletedSessionIds(new Set());
        return;
      }
      const userRef = doc(db, 'users', user.uid);
      unsubUser = onSnapshot(
        userRef,
        (snap) => {
          const ids = snap.exists() ? snap.data()?.completedSessionIds : null;
          setCompletedSessionIds(new Set(Array.isArray(ids) ? ids : []));
        },
        () => setCompletedSessionIds(new Set()),
      );
    });
    return () => {
      if (unsubUser) unsubUser();
      unsubAuth();
    };
  }, []);

  const selectedSession = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
  const sessionContext  = screen === 'session' || sessionActive
    ? { selectedSession, sessionActive, scriptSlideIndex }
    : null;
  const avatarBackendUri = useMemo(() => buildLocalBackendUri(avatarHtmlBase), [avatarHtmlBase]);

  // ── Avatar URIs — same chat_id for shared server-side conversation thread ──
  const homeDockUri = useMemo(() => buildAvatarUri(avatarHtmlBase, {
    compact: '1', host: 'home-dock', autostart: '1', chat_id: avatarConversationId, tts_base: avatarBackendUri,
  }), [avatarHtmlBase, avatarConversationId, avatarBackendUri]);

  const sessionAvatarUri = useMemo(() => buildAvatarUri(avatarHtmlBase, {
    compact: '1', host: 'session-panel', session: selectedSessionId, chat_id: avatarConversationId, tts_base: avatarBackendUri,
  }), [avatarHtmlBase, selectedSessionId, avatarConversationId, avatarBackendUri]);

  // ── Load avatar.html asset ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const asset = Asset.fromModule(require('../../assets/avatar.html'));
        setAvatarLoadError('');
        if (asset.localUri || asset.uri) {
          setAvatarHtmlBase(asset.localUri || asset.uri);
        }
        await asset.downloadAsync();
        const uri = asset.localUri || asset.uri;
        if (!cancelled) {
          if (uri) {
            setAvatarHtmlBase(uri);
          } else {
            setAvatarLoadError(
              'Avatar asset resolved to no URI. Check metro.config.js has assetExts.push("html") and run `npx expo start --clear`.',
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

  // ── Handle messages sent from avatar.html via ReactNativeWebView.postMessage ──
  const handleWebViewMessage = useCallback((event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'native-speak') {
        // Suspend the WebView AudioContext so iOS doesn't block AVSpeechSynthesizer
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
            rate: 0.9,
            voice: avatarVoiceId.current ?? undefined,
            onDone: resumeCtx,
            onStopped: resumeCtx,
            onError: resumeCtx,
          });
        }, 120);
      } else if (msg.type === 'native-stop-speech') {
        Speech.stop();
        const resumeJs = `(function(){try{if(typeof audioState!=='undefined'&&audioState.ctx&&audioState.ctx.state==='suspended')audioState.ctx.resume();}catch(e){}})();true;`;
        sessionWebViewRef.current?.injectJavaScript(resumeJs);
        homeDockWebViewRef.current?.injectJavaScript(resumeJs);
      }
    } catch {}
  }, []);

  // ── Inject a postMessage event into the session avatar WebView ──
  // avatar.html listens for { source: 'mindfulness-host', type, ... } on window.
  const injectAvatarCommand = useCallback((command) => {
    const payload = JSON.stringify({ source: 'mindfulness-host', ...command });
    sessionWebViewRef.current?.injectJavaScript(
      `(function(){try{window._nativeHostCommand(${payload});}catch(e){}})();true;`
    );
  }, []);

  // ── Called after the session WebView finishes loading ──
  // Always hides the avatar's built-in Start/End buttons.
  // Only re-injects context when returning to an already-active session (resume).
  const handleSessionAvatarLoad = useCallback(() => {
    setTimeout(() => {
      sessionWebViewRef.current?.injectJavaScript(HIDE_CONTROLS_JS);
    }, 300);
    if (sessionActive) {
      setTimeout(() => {
        const session  = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
        if (session.kind === 'scripted') {
          const segments = SESSION_SCRIPTS[session.id] || [];
          const segment  = segments[scriptSlideIndex] || segments[0];
          if (segment) {
            injectAvatarCommand({ type: 'host-speak-script', text: segment.text });
            return;
          }
        }
        const prompt = buildSessionStartPrompt(session, scriptSlideIndex);
        injectAvatarCommand({ type: 'host-start-session', prompt, announce: false });
      }, 700);
    }
  }, [selectedSessionId, sessionActive, scriptSlideIndex, injectAvatarCommand]);

  const handleHomeDockLoad = useCallback(() => {
    setTimeout(() => {
      homeDockWebViewRef.current?.injectJavaScript(HIDE_CONTROLS_JS);
    }, 300);
    homeDockLoadCount.current += 1;
    if (homeDockLoadCount.current === 1) {
      // First load only — send the welcome prompt via host-start-session
      // so it fires once and doesn't re-trigger on any subsequent reload
      setTimeout(() => {
        const payload = JSON.stringify({
          source: 'mindfulness-host', type: 'host-start-session', prompt: null, announce: false,
        });
        homeDockWebViewRef.current?.injectJavaScript(
          `(function(){try{window._nativeHostCommand(${payload});}catch(e){}})();true;`
        );
      }, 600);
    }
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
  const startSession = useCallback(() => {
    const session = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
    setSummaryVisible(false);
    setSessionStartTime(Date.now());
    setSessionActive(true);
    setSessionStatus('Session active');
    if (session.kind === 'scripted') {
      setScriptSlideIndex(0);
    } else {
      setPlaceholderMessage(`${session.title} is intentionally empty right now.`);
    }
    setTimeout(() => {
      if (session.kind === 'scripted') {
        const segments = SESSION_SCRIPTS[session.id] || [];
        const segment  = segments[0];
        if (segment) {
          injectAvatarCommand({ type: 'host-speak-script', text: segment.text });
          return;
        }
      }
      const prompt = buildSessionStartPrompt(session, 0);
      injectAvatarCommand({ type: 'host-start-session', prompt, announce: false });
    }, 200);
  }, [selectedSessionId, injectAvatarCommand]);

  const endSession = useCallback(() => {
    if (!sessionActive) return;
    const elapsed = Math.max(0, Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000));
    setSessionDuration(formatDuration(elapsed));
    const session = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
    const segments = SESSION_SCRIPTS[session.id] || [];
    const completed =
      session.kind !== 'scripted' ||
      (segments.length > 0 && scriptSlideIndex >= segments.length - 1);
    setSessionSummary(
      session.kind === 'scripted'
        ? completed
          ? `You completed the full ${session.title} session.`
          : `You ended ${session.title} after passage ${scriptSlideIndex + 1} of ${segments.length}.`
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
        scriptSegments: segments.length,
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
    // Tell avatar the session ended — it posts a closing message in chat
    injectAvatarCommand({ type: 'host-end-session' });
  }, [sessionActive, sessionStartTime, selectedSessionId, scriptSlideIndex, injectAvatarCommand]);

  const goToNextScriptSegment = useCallback(() => {
    const segments = SESSION_SCRIPTS[selectedSessionId] || [];
    if (scriptSlideIndex >= segments.length - 1) {
      endSession();
      return;
    }
    const nextIndex = scriptSlideIndex + 1;
    setScriptSlideIndex(nextIndex);
    injectAvatarCommand({ type: 'host-speak-script', text: segments[nextIndex].text });
  }, [scriptSlideIndex, selectedSessionId, endSession, injectAvatarCommand]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.langContainer}>
          <Text style={styles.globeText}>Language</Text>
          <Pressable
            onPress={toggleLanguage}
            style={({ pressed }) => [styles.langBtn, pressed && styles.topBtnPressed]}
            accessibilityRole="button"
          >
            <Text style={styles.langBtnText}>{locale.toUpperCase()}</Text>
          </Pressable>
        </View>
        <Text style={styles.headerTitle}>{t('homeTitle')}</Text>
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
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View style={styles.heroActions}>
              {!dockExpanded ? (
                <Pressable style={({ pressed }) => [styles.heroBtnPrimary, pressed && styles.btnPressed]} onPress={() => setDockExpanded(true)}>
                  <Text style={styles.heroBtnPrimaryText}>Open Guide</Text>
                </Pressable>
              ) : (
                <Pressable style={({ pressed }) => [styles.heroBtnPrimary, pressed && styles.btnPressed]} onPress={() => openSession(sessionCatalog[0].id)}>
                  <Text style={styles.heroBtnPrimaryText}>Start With Caregiver Fatigue</Text>
                </Pressable>
              )}
              <Pressable style={({ pressed }) => [styles.heroBtnSecondary, pressed && styles.btnPressed]} onPress={() => openSession(selectedSessionId)}>
                <Text style={styles.heroBtnSecondaryText}>Explore Sessions</Text>
              </Pressable>
            </View>
          </View>

          {sessionActive && (
            <View style={styles.resumeCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.resumeTitle}>Session in progress</Text>
                <Text style={styles.resumeBody}>{selectedSession.title} is still active.</Text>
              </View>
              <Pressable style={({ pressed }) => [styles.heroBtnPrimary, { marginTop: 0 }, pressed && styles.btnPressed]} onPress={() => setScreen('session')}>
                <Text style={styles.heroBtnPrimaryText}>Resume</Text>
              </Pressable>
            </View>
          )}

          <Text style={styles.sectionTitle}>Session Selection</Text>
          <View style={styles.sessionGrid}>
            {sessionCatalog.map((s) => {
              const isReady   = s.kind !== 'placeholder';
              const selected  = selectedSessionId === s.id;
              const disabled  = sessionActive && selectedSessionId !== s.id;
              const completed = completedSessionIds.has(s.id);
              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.sessionTile,
                    isReady ? styles.sessionTileGuided : styles.sessionTilePlaceholder,
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
                          : isReady
                            ? styles.pillGuided
                            : styles.pillEmpty,
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          completed
                            ? styles.pillTextCompleted
                            : isReady
                              ? styles.pillTextGuided
                              : styles.pillTextEmpty,
                        ]}
                      >
                        {completed ? 'Completed' : isReady ? 'Ready' : 'Empty'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.sessionTileTitle}>{s.title}</Text>
                  {!!s.description && <Text style={styles.sessionTileDesc} numberOfLines={2}>{s.description}</Text>}
                  <Text style={styles.sessionTileMeta}>{s.duration}</Text>
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
          <Pressable style={({ pressed }) => [styles.supportBtn, pressed && styles.btnPressed]} onPress={() => Alert.alert(t('supportTicket'), 'Coming soon.')}>
            <Text style={styles.supportBtnText}>{t('supportTicket')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ══ SESSION SCREEN — fully scrollable so nothing gets compressed ══ */}
      {screen === 'session' && (
        <ScrollView
          style={styles.sessionLayout}
          contentContainerStyle={styles.sessionScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          <View style={styles.sessionTopRow}>
            <Pressable style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]} onPress={() => setScreen('home')}>
              <Text style={styles.backBtnText}>← Sessions</Text>
            </Pressable>
            {sessionActive && (
              <Pressable style={({ pressed }) => [styles.endBtn, pressed && styles.btnPressed]} onPress={endSession}>
                <Text style={styles.endBtnText}>End Session</Text>
              </Pressable>
            )}
          </View>

          <View style={styles.detailHero}>
            <View style={styles.detailTopRow}>
              <Text style={styles.detailNumber}>{selectedSession.number}</Text>
              <View style={[styles.pill, selectedSession.kind !== 'placeholder' ? styles.pillGuided : styles.pillEmpty]}>
                <Text style={[styles.pillText, selectedSession.kind !== 'placeholder' ? styles.pillTextGuided : styles.pillTextEmpty]}>
                  {selectedSession.kind === 'scripted' ? 'Scripted session' : 'Empty session'}
                </Text>
              </View>
              <Text style={styles.detailTitle}>{selectedSession.title}</Text>
              {!sessionActive ? (
                <Pressable
                  style={({ pressed }) => [styles.startBtn, pressed && styles.btnPressed]}
                  onPress={startSession}
                >
                  <Text style={styles.startBtnText}>Start</Text>
                </Pressable>
              ) : (
                <Text style={styles.detailStatus}>{sessionStatus}</Text>
              )}
            </View>
          </View>

          {selectedSession.kind === 'scripted' && sessionActive && (() => {
            const segments = SESSION_SCRIPTS[selectedSession.id] || [];
            const total    = segments.length;
            const current  = Math.min(scriptSlideIndex + 1, total);
            const pct      = total > 0 ? (current / total) * 100 : 0;
            const isLast   = scriptSlideIndex >= total - 1;
            return (
              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressCount}>{current} / {total}</Text>
                </View>
                <View style={styles.progressRow}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${pct}%` }]} />
                  </View>
                  <Pressable
                    style={({ pressed }) => [styles.progressNextBtn, pressed && styles.btnPressed]}
                    onPress={goToNextScriptSegment}
                  >
                    <Text style={styles.startBtnText}>{isLast ? 'Finish' : 'Next →'}</Text>
                  </Pressable>
                </View>
              </View>
            );
          })()}

          <SessionAvatarPanel
            avatarUri={sessionAvatarUri}
            avatarError={avatarLoadError}
            webViewRef={sessionWebViewRef}
            onLoad={handleSessionAvatarLoad}
            onError={handleAvatarWebViewError}
            onMessage={handleWebViewMessage}
          />

          {selectedSession.kind !== 'scripted' && !!placeholderMessage && (
            <View style={styles.placeholderCard}>
              <Text style={styles.placeholderTitle}>Template Reserved</Text>
              <Text style={styles.placeholderBody}>{placeholderMessage}</Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* ── Floating avatar dock — always mounted, hidden on session screen ── */}
      <FloatingAvatarDock
        avatarUri={homeDockUri}
        avatarError={avatarLoadError}
        expanded={dockExpanded}
        visible={screen === 'home'}
        onToggle={() => setDockExpanded((v) => !v)}
        webViewRef={homeDockWebViewRef}
        onLoad={handleHomeDockLoad}
        onError={handleAvatarWebViewError}
        onMessage={handleWebViewMessage}
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
  container: { padding: 16, paddingBottom: 100, maxWidth: 520, width: '100%', alignSelf: 'center' },

  // Header
  header:        { backgroundColor: ThemeColor.BRAND, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 14 },
  headerTitle:   { flex: 1, color: ThemeColor.WHITE, fontSize: 18, fontWeight: '700', textAlign: 'center', paddingHorizontal: 8 },
  langContainer: { width: 92, flexDirection: 'row', alignItems: 'center', gap: 6 },
  globeText:     { color: ThemeColor.WHITE, fontSize: 11, fontWeight: '700' },
  langBtn:       { minWidth: 34, minHeight: 30, alignItems: 'center', justifyContent: 'center', borderRadius: ThemeRadius.SM, backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' },
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

  // ── Floating dock (home screen) ──
  floatingBtnWrap: { position: 'absolute', bottom: 28, right: 18, zIndex: 200 },
  floatingBtn: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: ThemeColor.BRAND,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    ...Platform.select({
      ios:     { shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  floatingBtnOrb:   { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.85)' },
  floatingBtnLabel: { color: ThemeColor.WHITE, fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },

  floatingDock: {
    position: 'absolute', bottom: 28, right: 16,
    width: DOCK_WIDTH, height: DOCK_HEIGHT,
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

  // ── Session avatar (inline) ──
  sessionAvatarPanel: { height: SESSION_AVATAR_HEIGHT, borderRadius: 18, overflow: 'hidden', marginBottom: 16, backgroundColor: '#0d1b36', ...cardShadow },
  sessionWebView:     { flex: 1, backgroundColor: '#0d1b36' },

  // Session grid
  sectionTitle:           { fontSize: 20, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, marginBottom: 12, marginTop: 4 },
  sessionGrid:            { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  sessionTile:            { width: (SCREEN_WIDTH - 42) / 2, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1.5, minHeight: 140 },
  sessionTileGuided:      { backgroundColor: '#e8edf7', borderColor: 'rgba(31,60,136,0.2)' },
  sessionTilePlaceholder: { backgroundColor: ThemeColor.WHITE, borderColor: 'rgba(31,60,136,0.1)' },
  sessionTileCompleted:   { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  sessionTileSelected:    { borderColor: ThemeColor.BRAND, borderWidth: 2 },
  sessionTileTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionNumber:          { fontSize: 20, fontWeight: '900', color: ThemeColor.BRAND },
  sessionTileTitle:       { fontSize: 14, fontWeight: '700', color: ThemeColor.TEXT_PRIMARY },
  sessionTileDesc:        { fontSize: 12, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 17 },
  sessionTileMeta:        { fontSize: 11, color: ThemeColor.HOME_SUBTITLE, fontWeight: '600' },

  // Pills
  pill:              { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  pillGuided:        { backgroundColor: ThemeColor.BRAND },
  pillEmpty:         { backgroundColor: '#e8edf7' },
  pillCompleted:     { backgroundColor: '#16a34a' },
  pillText:          { fontSize: 10, fontWeight: '800' },
  pillTextGuided:    { color: ThemeColor.WHITE },
  pillTextEmpty:     { color: ThemeColor.HOME_SUBTITLE },
  pillTextCompleted: { color: ThemeColor.WHITE },

  // Info cards
  card:          { backgroundColor: ThemeColor.WHITE, padding: 20, borderRadius: 8, borderTopWidth: 4, borderTopColor: ThemeColor.BRAND, marginBottom: 14, ...cardShadow },
  cardTitle:     { fontSize: 18, fontWeight: '700', color: ThemeColor.BRAND, marginBottom: 5 },
  cardText:      { color: ThemeColor.HOME_CARD_TEXT, lineHeight: 22 },
  supportBtn:    { backgroundColor: '#2ecc71', padding: 15, borderRadius: 8, marginTop: 4, alignItems: 'center' },
  supportBtnText:{ color: ThemeColor.WHITE, fontWeight: '700', fontSize: 16 },

  // Chat FAB

  // Session screen — single scrollable column, nothing gets compressed
  sessionLayout:       { flex: 1, backgroundColor: ThemeColor.SCREEN_BG },
  sessionScrollContent:{ padding: 16, paddingBottom: 100 },

  // Session screen
  sessionTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  backBtn:          { paddingVertical: 6 },
  backBtnText:      { color: ThemeColor.BRAND, fontWeight: '700', fontSize: 15 },
  endBtn:           { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(180,40,40,0.35)', backgroundColor: 'rgba(220,50,50,0.06)' },
  endBtnText:       { color: '#c0392b', fontWeight: '700', fontSize: 13 },
  startBtn:         { backgroundColor: ThemeColor.BRAND, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14, marginLeft: 'auto' },
  startBtnText:     { color: ThemeColor.WHITE, fontWeight: '800', fontSize: 13 },
  detailHero:       { backgroundColor: ThemeColor.WHITE, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, ...cardShadow },
  detailTopRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  detailNumber:     { fontSize: 28, fontWeight: '900', color: ThemeColor.BRAND },
  detailStatus:     { fontSize: 11, color: ThemeColor.HOME_SUBTITLE, fontWeight: '600', marginLeft: 'auto' },
  detailTitle:      { flex: 1, fontSize: 16, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY },
  detailDescription:{ fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 21 },

  placeholderCard:  { backgroundColor: ThemeColor.WHITE, borderRadius: 16, padding: 18, gap: 8, marginBottom: 16, ...cardShadow },
  placeholderTitle: { fontSize: 17, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY },
  placeholderBody:  { fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 21 },
  progressCard:     { backgroundColor: ThemeColor.WHITE, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, ...cardShadow },
  progressHeader:   { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 6 },
  progressLabel:    { fontSize: 13, fontWeight: '700', color: ThemeColor.TEXT_PRIMARY },
  progressCount:    { fontSize: 13, fontWeight: '800', color: ThemeColor.BRAND },
  progressRow:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressTrack:    { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(31,60,136,0.12)', overflow: 'hidden' },
  progressFill:     { height: '100%', backgroundColor: ThemeColor.BRAND, borderRadius: 4 },
  progressNextBtn:  { backgroundColor: ThemeColor.BRAND, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 },

  // Summary modal
  overlay:             { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  summaryCard:         { width: '100%', maxWidth: 380, backgroundColor: ThemeColor.WHITE, borderRadius: 20, padding: 24, gap: 10 },
  summaryTitle:        { fontSize: 20, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, textAlign: 'center' },
  summaryDuration:     { fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, textAlign: 'center' },
  summaryBody:         { fontSize: 15, color: ThemeColor.TEXT_PRIMARY, lineHeight: 22 },
  summaryCloseBtn:     { backgroundColor: ThemeColor.BRAND, borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
  summaryCloseBtnText: { color: ThemeColor.WHITE, fontWeight: '800', fontSize: 15 },

  // Chat modal — tall sheet so messages and composer are both visible
  overlayDismiss:  { flex: 1, justifyContent: 'flex-end' },
  chatSheet: {
    backgroundColor: ThemeColor.WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: Math.round(SCREEN_HEIGHT * 0.82),
    width: '100%',
    maxWidth: 600,
    alignSelf: 'center',
  },
  sheetHeader:  { flexDirection: 'row', alignItems: 'flex-start', padding: 18, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: ThemeColor.INPUT_BORDER },
  sheetTitle:   { fontSize: 18, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY },
  sheetSubtitle:{ fontSize: 13, color: ThemeColor.HOME_CARD_TEXT, marginTop: 2 },
  closeBtn:     { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeBtnText: { fontSize: 16, color: ThemeColor.TEXT_PRIMARY, fontWeight: '700' },
  chatStatus:   { fontSize: 11, color: ThemeColor.HOME_CHAT_MUTED, paddingHorizontal: 16, paddingVertical: 5, backgroundColor: '#f7f8fa' },
  // Messages area — flex:1 so it fills remaining space between header and composer
  chatWindow:        { flex: 1 },
  chatWindowContent: { padding: 16, gap: 12, flexGrow: 1 },
  messageBubble:     { borderRadius: 16, padding: 13, maxWidth: '86%' },
  bubbleUser:        { backgroundColor: ThemeColor.BRAND, alignSelf: 'flex-end' },
  bubbleAssistant:   { backgroundColor: '#e8edf7', alignSelf: 'flex-start' },
  messageText:           { fontSize: 15, lineHeight: 21 },
  messageTextUser:       { color: ThemeColor.WHITE },
  messageTextAssistant:  { color: ThemeColor.TEXT_PRIMARY },
  // Composer — fixed at bottom
  composer:  { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderTopWidth: 1, borderTopColor: ThemeColor.INPUT_BORDER, backgroundColor: ThemeColor.WHITE },
  chatInput: { flex: 1, backgroundColor: ThemeColor.INPUT_BG, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: ThemeColor.TEXT_PRIMARY, minHeight: 46, maxHeight: 120 },
  sendBtn:     { backgroundColor: ThemeColor.BRAND, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 18, minHeight: 46, justifyContent: 'center' },
  sendBtnText: { color: ThemeColor.WHITE, fontWeight: '800', fontSize: 15 },

  // Shared
  btnDisabled:   { opacity: 0.4 },
  btnPressed:    { opacity: 0.85 },
  topBtnPressed: { opacity: 0.82 },
});
