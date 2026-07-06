import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from 'react';
import {
  Animated,
  BackHandler,
  Easing,
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
import { useEventListener } from 'expo';
import { useAudioPlayer } from 'expo-audio';
import { VideoView, useVideoPlayer } from 'expo-video';
import { onAuthStateChanged, updateProfile } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { useLanguage } from '../context/LanguageContext';
import { ThemeColor, ThemeRadius } from '../theme/appTheme';
import { Ionicons } from '@expo/vector-icons';
import { recordCompletedSession } from '../utils/sessionTracking';
import SESSION_CAPTIONS from '../data/sessionCaptions';
import { getDailyQuote } from '../data/homeQuotes';

// ─── Session catalog ──────────────────────────────────────────────────────────

const sessionCatalog = [
  { id: 'caregiver-fatigue',  title: 'Caregiver Fatigue',         description: 'A compassion meditation to recharge when caring for others.', kind: 'video',       duration: '~5 min · 3 chapters' },
  { id: 'body-scan',          title: 'Body Scan',                 description: 'A guided check-in from head to toe.',                        kind: 'placeholder', duration: 'Coming soon' },
  { id: 'five-senses',        title: 'Five Senses Grounding',     description: 'A grounding exercise to reconnect with the present moment.',  kind: 'placeholder', duration: 'Coming soon' },
  { id: 'mindful-breathing',  title: 'Mindful Breathing',         description: 'A foundational breath awareness practice you can use anywhere.', kind: 'placeholder', duration: 'Coming soon' },
  { id: 'loving-kindness',    title: 'Loving Kindness',           description: 'A compassion-focused mindfulness practice.',                 kind: 'placeholder', duration: 'Coming soon' },
  { id: 'mindful-walking',    title: 'Mindful Walking',           description: 'A light movement practice with full attention on each step.', kind: 'placeholder', duration: 'Coming soon' },
  { id: 'seated-stretch',     title: 'Seated Stretch Reset',      description: 'Gentle seated stretches to release tension.',                kind: 'placeholder', duration: 'Coming soon' },
  { id: 'mindful-listening',  title: 'Mindful Listening',         description: 'A practice that centers attention through sound.',            kind: 'placeholder', duration: 'Coming soon' },
  { id: 'affirmation-breath', title: 'Affirmation Breath',        description: 'Pair a calming phrase with your breath.',                    kind: 'placeholder', duration: 'Coming soon' },
  { id: 'stress-release',     title: 'Stress Release Check-In',   description: 'Notice, name, and soften what you are carrying.',            kind: 'placeholder', duration: 'Coming soon' },
  { id: 'morning-intention',  title: 'Morning Intention',         description: 'A simple intention-setting practice for the day.',           kind: 'placeholder', duration: 'Coming soon' },
  { id: 'sleep-wind-down',    title: 'Sleep Wind Down',           description: 'A quiet practice to prepare your body for rest.',            kind: 'placeholder', duration: '' },
];

// ─── Session video timeline ───────────────────────────────────────────────────
// Each chapter is a pre-recorded, lip-synced video. `pauseDuration` (seconds)
// is the silent meditation break after the chapter finishes — the player stays
// mounted so the video freezes cleanly on its final closed-mouth frame.
// `pausePoints` are mid-video breaks: at `atTime` (seconds into the video) the
// player pauses on the current frame for `duration` seconds, then resumes.

// Slightly slower than natural — the narration was recorded a touch fast.
// Pitch is preserved so the voice doesn't get deeper.
const PLAYBACK_RATE = 0.94;

// `mediaSeconds` is each video's natural duration, used to estimate time left.
const CAREGIVER_FATIGUE_TIMELINE = [
  {
    key: 'chapter-1',
    title: 'Settling in',
    source: require('../../assets/videos/chapter_1.mp4'),
    mediaSeconds: 45.4,
    pauseDuration: 11,
    breakTitle: 'Take a few deep breaths',
    breakBody: 'Breathe in slowly through your nose… and let it go, gently, through your mouth.',
  },
  {
    key: 'chapter-2',
    title: 'Guided practice',
    source: require('../../assets/videos/chapter_2.mp4'),
    mediaSeconds: 105.2,
    pauseDuration: 17,
    breakTitle: 'Rest in silence',
    breakBody: 'There is nothing to do right now. Simply notice your breath moving on its own.',
  },
  {
    key: 'chapter-3',
    title: 'Closing',
    source: require('../../assets/videos/chapter_3.mp4'),
    mediaSeconds: 114.1,
    pauseDuration: 0,
    // Timestamps are in the video's own timeline (unaffected by playback rate):
    // "…hear the words in your mind as you count" ends at 13.1s;
    // "…happiness when eating your favorite fruit" ends at 38.9s.
    pausePoints: [
      {
        key: 'count-backwards',
        atTime: 13.2,
        duration: 15,
        title: 'Count backwards from ten',
        body: 'Slowly count down in your mind… noticing each number as it appears.',
      },
      {
        key: 'favorite-fruit',
        atTime: 39.0,
        duration: 12,
        title: 'Stay with the image',
        body: 'Hold the colors, texture, and taste of your fruit in your mind for a few more breaths.',
      },
    ],
  },
];

const SESSION_TIMELINES = {
  'caregiver-fatigue': CAREGIVER_FATIGUE_TIMELINE,
};

function getSessionTimeline(sessionId) {
  return SESSION_TIMELINES[sessionId] || [];
}

function formatChapterTime(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(totalSeconds) {
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts   = hours > 0 ? [hours, minutes, seconds] : [minutes, seconds];
  return parts.map((v) => String(v).padStart(2, '0')).join(':');
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

// ─── Breathing Break Overlay ──────────────────────────────────────────────────
// Shown over the frozen video during breathing/reflection pauses. A large
// circle slowly shrinks for the length of the break with a countdown in the
// middle, while a quiet looping breath sound plays.

const BREATHING_SOUND = require('../../assets/audio/breathing.mp3');

function BreathingBreakOverlay({ title, body, durationSeconds, onContinue }) {
  const scale = useRef(new Animated.Value(1)).current;
  const [secondsLeft, setSecondsLeft] = useState(durationSeconds);
  const breathSound = useAudioPlayer(BREATHING_SOUND);
  const onContinueRef = useRef(onContinue);
  onContinueRef.current = onContinue;

  const handleContinue = useCallback(() => {
    onContinueRef.current?.();
  }, []);

  useEffect(() => {
    scale.setValue(1);
    Animated.timing(scale, {
      toValue: 0.35,
      duration: durationSeconds * 1000,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    }).start();

    const startedAt = Date.now();
    setSecondsLeft(durationSeconds);
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSecondsLeft(Math.max(0, Math.ceil(durationSeconds - elapsed)));
    }, 250);

    breathSound.loop = true;
    breathSound.volume = 0.35;
    breathSound.play();

    return () => {
      clearInterval(interval);
      // On unmount the hook may have already released the native player,
      // which stops playback by itself — pausing then throws, so ignore it.
      try {
        breathSound.pause();
      } catch {
        // Player already released.
      }
    };
    // Runs once per overlay mount — the component is keyed per break.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.breakOverlay} pointerEvents="auto" collapsable={false}>
      <View style={styles.breakOverlayContent}>
        {secondsLeft > 0 ? (
          <View style={styles.breakCircleWrap} pointerEvents="none">
            <Animated.View style={[styles.breakCircle, { transform: [{ scale }] }]} />
            <Text style={styles.breakTimerText}>{secondsLeft}</Text>
          </View>
        ) : (
          <Text style={styles.breakReadyText}>
            Press Continue when you&apos;re ready to continue.
          </Text>
        )}
        {!!title && <Text style={styles.breakTitle}>{title}</Text>}
        {!!body && <Text style={styles.breakBody}>{body}</Text>}
        <Pressable
          style={({ pressed }) => [
            styles.breakContinueBtn,
            secondsLeft > 0 && styles.breakContinueBtnWaiting,
            pressed && styles.btnPressed,
          ]}
          onPress={handleContinue}
          disabled={secondsLeft > 0}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Continue to the next part"
          accessibilityState={{ disabled: secondsLeft > 0 }}
        >
          <Text style={styles.breakContinueBtnText}>Continue</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── Session Video Panel ──────────────────────────────────────────────────────
// Fills the space where the avatar WebView used to live. Shows the current
// chapter's video; while `isBreathingBreak` is true the video stays frozen on
// its final frame with a calm text overlay on top.

function SessionVideoPanel({
  chapter,
  sessionActive,
  isBreathingBreak,
  captionsEnabled,
  onToggleCaptions,
  onPlayToEnd,
  onMidBreakChange,
  onProgressTime,
  onSkipChapterBreak,
  onControlsReady,
  onBreakOverlayChange,
}) {
  // Mid-video pause point currently showing (null when narration is playing).
  const [activePausePoint, setActivePausePoint] = useState(null);
  const consumedPausePointsRef = useRef(new Set());
  // Ignore duplicate playToEnd events while the same chapter stays at the end.
  const chapterEndedRef = useRef(false);

  // Whether the video is actually playing (drives the pause/play button icon).
  const [isPlaying, setIsPlaying] = useState(false);

  // Closed captions — cue text for the current playback position.
  const [captionText, setCaptionText] = useState('');
  const captionTextRef = useRef('');

  // NOTE: don't set playbackRate here — on iOS, assigning a rate to a paused
  // player starts playback, which would autoplay the video as soon as the
  // session screen opens. The rate is applied right before play() instead.
  const player = useVideoPlayer(chapter?.source ?? null, (p) => {
    p.loop = false;
    p.preservesPitch = true;
    p.timeUpdateEventInterval = 0.25;
  });

  const clearMidPause = useCallback(() => {
    setActivePausePoint(null);
    onMidBreakChange?.(false);
  }, [onMidBreakChange]);

  // Start (or restart) playback whenever a session is running and the chapter
  // source changes. The setup callback only runs once per mount, so this
  // effect is what kicks off each chapter.
  useEffect(() => {
    consumedPausePointsRef.current = new Set();
    chapterEndedRef.current = false;
    captionTextRef.current = '';
    setCaptionText('');
    if (sessionActive && chapter) {
      player.playbackRate = PLAYBACK_RATE;
      player.preservesPitch = true;
      player.timeUpdateEventInterval = 0.25;
      player.play();
    } else {
      // Before Start Session is pressed the player just shows the first
      // frame as a preview — make sure it is paused and rewound.
      player.pause();
      player.currentTime = 0;
    }
  }, [player, sessionActive, chapter]);

  // If the session ends mid-pause (e.g. End Session pressed), cancel the pause UI.
  useEffect(() => {
    if (!sessionActive) clearMidPause();
  }, [sessionActive, clearMidPause]);

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    onProgressTime?.(currentTime);

    const cues = SESSION_CAPTIONS[chapter?.key] || [];
    const cue = cues.find((c) => currentTime >= c.start && currentTime <= c.end);
    const text = cue ? cue.text : '';
    if (text !== captionTextRef.current) {
      captionTextRef.current = text;
      setCaptionText(text);
    }

    if (!sessionActive || activePausePoint || isBreathingBreak) return;
    const points = chapter?.pausePoints;
    if (!points?.length) return;
    const due = points.find(
      (pt) => currentTime >= pt.atTime && !consumedPausePointsRef.current.has(pt.key),
    );
    if (!due) return;
    consumedPausePointsRef.current.add(due.key);
    player.pause();
    setActivePausePoint(due);
    onMidBreakChange?.(true);
  });

  useEventListener(player, 'playToEnd', () => {
    if (chapterEndedRef.current) return;
    chapterEndedRef.current = true;
    onPlayToEnd();
  });

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    setIsPlaying(playing);
  });

  // Resume narration after a mid-video pause — only when the user taps Continue.
  const skipMidPause = useCallback(() => {
    setActivePausePoint(null);
    onMidBreakChange?.(false);
    player.playbackRate = PLAYBACK_RATE;
    player.play();
  }, [player, onMidBreakChange]);

  const skipMidPauseRef = useRef(skipMidPause);
  skipMidPauseRef.current = skipMidPause;
  const onSkipChapterBreakRef = useRef(onSkipChapterBreak);
  onSkipChapterBreakRef.current = onSkipChapterBreak;

  const handleBreakContinue = useCallback(() => {
    if (activePausePoint) {
      skipMidPauseRef.current();
    } else {
      onSkipChapterBreakRef.current?.();
    }
  }, [activePausePoint]);

  const handleBreakContinueRef = useRef(handleBreakContinue);
  handleBreakContinueRef.current = handleBreakContinue;

  // ── Transport controls ──
  const seekBy = useCallback((seconds) => {
    player.seekBy(seconds);
  }, [player]);

  const togglePlayPause = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      player.playbackRate = PLAYBACK_RATE;
      player.play();
    }
  }, [player]);

  useEffect(() => {
    onControlsReady?.({ seekBy, togglePlayPause, isPlaying });
  }, [seekBy, togglePlayPause, isPlaying, onControlsReady]);

  const overlayTitle = activePausePoint ? activePausePoint.title : chapter?.breakTitle;
  const overlayBody = activePausePoint ? activePausePoint.body : chapter?.breakBody;
  const overlayDuration = activePausePoint
    ? activePausePoint.duration
    : chapter?.pauseDuration || 0;

  const inBreak = isBreathingBreak || !!activePausePoint;

  useEffect(() => {
    onBreakOverlayChange?.(inBreak ? {
      title: overlayTitle,
      body: overlayBody,
      durationSeconds: overlayDuration,
      onContinue: () => handleBreakContinueRef.current(),
      overlayKey: activePausePoint ? activePausePoint.key : `${chapter?.key}-break`,
    } : null);
  }, [
    inBreak,
    overlayTitle,
    overlayBody,
    overlayDuration,
    activePausePoint,
    chapter?.key,
    onBreakOverlayChange,
  ]);

  return (
    <View style={styles.sessionVideoPanel}>
      <View
        style={styles.sessionVideoFrame}
        pointerEvents={inBreak ? 'none' : 'box-none'}
      >
        <VideoView
          player={player}
          style={styles.sessionVideo}
          contentFit="cover"
          nativeControls={false}
        />

        {captionsEnabled && !!captionText && !inBreak && (
          <View style={styles.captionBar} pointerEvents="none">
            <Text style={styles.captionText}>{captionText}</Text>
          </View>
        )}

        {sessionActive && !inBreak && (
          <Pressable
            style={({ pressed }) => [
              styles.ccBtn,
              captionsEnabled && styles.ccBtnOn,
              pressed && styles.btnPressed,
            ]}
            onPress={onToggleCaptions}
            accessibilityRole="button"
            accessibilityLabel={captionsEnabled ? 'Turn captions off' : 'Turn captions on'}
          >
            <Text style={[styles.ccBtnText, captionsEnabled && styles.ccBtnTextOn]}>CC</Text>
          </Pressable>
        )}
      </View>
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
  const { t, locale } = useLanguage();

  // ── Screen ──
  const [screen, setScreen]                       = useState('home');
  const [selectedSessionId, setSelectedSessionId] = useState(sessionCatalog[0].id);

  // ── Session state ──
  const [sessionActive, setSessionActive]         = useState(false);
  const [sessionStartTime, setSessionStartTime]   = useState(null);

  // ── Video playlist state ──
  const [chapterIndex, setChapterIndex]           = useState(0);
  const [isBreathingBreak, setIsBreathingBreak]   = useState(false);
  const [isMidBreak, setIsMidBreak]               = useState(false);
  // Whole seconds into the current chapter's video (drives "minutes left").
  const [mediaTime, setMediaTime]                 = useState(0);
  // Closed captions — on by default for legibility.
  const [captionsOn, setCaptionsOn]               = useState(true);
  const [videoControls, setVideoControls]         = useState(null);
  const [breakOverlay, setBreakOverlay]           = useState(null);
  const chapterBreakPendingRef                    = useRef(false);
  const breakTimerRef                             = useRef(null);

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
  const sessionTimeline = getSessionTimeline(selectedSessionId);
  const currentChapter = sessionTimeline[chapterIndex] || sessionTimeline[0] || null;

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

  // Clear any pending break timer on unmount.
  useEffect(
    () => () => {
      if (breakTimerRef.current) clearTimeout(breakTimerRef.current);
    },
    [],
  );

  // ── Session logic ──
  const clearBreakTimer = useCallback(() => {
    if (breakTimerRef.current) {
      clearTimeout(breakTimerRef.current);
      breakTimerRef.current = null;
    }
  }, []);

  const openSession = useCallback((id) => {
    setSelectedSessionId(id);
    setScreen('session');
    // If switching to a different session while one is active, clear it silently
    if (sessionActive && selectedSessionId !== id) {
      clearBreakTimer();
      setSessionActive(false);
      setSessionStartTime(null);
      setChapterIndex(0);
      setIsBreathingBreak(false);
      chapterBreakPendingRef.current = false;
      setBreakOverlay(null);
    }
  }, [sessionActive, selectedSessionId, clearBreakTimer]);

  // Called when the user explicitly presses Start Session
  const startSession = useCallback(() => {
    setSummaryVisible(false);
    setSessionStartTime(Date.now());
    setSessionActive(true);
    setChapterIndex(0);
    setIsBreathingBreak(false);
    setMediaTime(0);
    chapterBreakPendingRef.current = false;
  }, []);

  const endSession = useCallback((completedOverride) => {
    if (!sessionActive) return;
    clearBreakTimer();
    const elapsed = Math.max(0, Math.floor((Date.now() - (sessionStartTime || Date.now())) / 1000));
    setSessionDuration(formatDuration(elapsed));
    const session = sessionCatalog.find((s) => s.id === selectedSessionId) || sessionCatalog[0];
    const timeline = getSessionTimeline(session.id);
    const completed =
      typeof completedOverride === 'boolean'
        ? completedOverride
        : timeline.length > 0 && chapterIndex >= timeline.length - 1;
    setSessionSummary(
      completed
        ? `You completed the full ${session.title} session.`
        : `You ended ${session.title} after chapter ${chapterIndex + 1} of ${timeline.length}.`,
    );
    void recordCompletedSession({
      sessionId: session.id,
      sessionTitle: session.title,
      durationSeconds: elapsed,
      completed,
      metadata: {
        kind: session.kind,
        chapters: timeline.length,
        chapterIndex,
      },
    }).catch((error) => {
      console.warn('Failed to record session tracking data', error);
    });
    setSummaryVisible(true);
    setSessionActive(false);
    setSessionStartTime(null);
    setChapterIndex(0);
    setIsBreathingBreak(false);
    chapterBreakPendingRef.current = false;
    setBreakOverlay(null);
  }, [sessionActive, sessionStartTime, selectedSessionId, chapterIndex, clearBreakTimer]);

  // ── Video playlist control ──
  const advanceChapter = useCallback(() => {
    const timeline = getSessionTimeline(selectedSessionId);
    if (chapterIndex >= timeline.length - 1) {
      endSession(true);
    } else {
      setChapterIndex(chapterIndex + 1);
      setMediaTime(0);
    }
  }, [selectedSessionId, chapterIndex, endSession]);

  // Fired by the video player when the current chapter finishes playing.
  const handleChapterPlayToEnd = useCallback(() => {
    if (!sessionActive || chapterBreakPendingRef.current || isBreathingBreak) return;
    const timeline = getSessionTimeline(selectedSessionId);
    const chapter = timeline[chapterIndex];
    if (!chapter) return;

    if (chapter.pauseDuration > 0) {
      chapterBreakPendingRef.current = true;
      setMediaTime(chapter.mediaSeconds);
      setIsBreathingBreak(true);
    } else {
      advanceChapter();
    }
  }, [sessionActive, selectedSessionId, chapterIndex, advanceChapter, isBreathingBreak]);

  // Continue button on a between-chapter breathing break — only way to advance.
  const skipChapterBreak = useCallback(() => {
    if (!chapterBreakPendingRef.current) return;
    chapterBreakPendingRef.current = false;
    setIsBreathingBreak(false);
    setBreakOverlay(null);
    advanceChapter();
  }, [advanceChapter]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header — greeting only; language & log out live on Profile tab ── */}
      {screen === 'home' && (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {t('homeTitle', {
            name: homeGreetingName || t('homeTitleFallbackName'),
          })}
        </Text>
      </View>
      )}

      {/* ══ HOME SCREEN — full scrollable ══ */}
      {screen === 'home' && (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
        >
          {sessionActive ? (
            <Pressable
              style={({ pressed }) => [styles.resumeHeroCard, pressed && styles.btnPressed]}
              onPress={() => setScreen('session')}
              accessibilityRole="button"
              accessibilityLabel={t('resumeSession')}
            >
              <Text style={styles.resumeHeroEyebrow}>{t('sessionInProgress')}</Text>
              <Text style={styles.resumeHeroTitle}>{selectedSession.title}</Text>
              <Text style={styles.resumeHeroBody}>
                {t('sessionStillActive', { title: selectedSession.title })}
              </Text>
              <Text style={styles.resumeHeroHint}>{t('resumeSessionHint')}</Text>
              <View style={styles.resumeHeroBtn}>
                <Text style={styles.resumeHeroBtnText}>{t('resumeSession')}</Text>
              </View>
            </Pressable>
          ) : (
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>{t('homeHeroEyebrow')}</Text>
              <Text style={styles.heroBody}>{t('homeHeroBody')}</Text>
            </View>
          )}

          <Text style={styles.sectionTitle}>{t('sessionSectionTitle')}</Text>
          <View style={styles.sessionGrid}>
            {(() => {
              let availableCount = 0;
              return sessionCatalog.map((s) => {
              const isAvailable = s.kind !== 'placeholder';
              const displayNumber = isAvailable
                ? String(++availableCount).padStart(2, '0')
                : null;
              const selected  = selectedSessionId === s.id;
              const inProgress = sessionActive && selectedSessionId === s.id;
              const completed = !inProgress && completedSessionIds.has(s.id);
              const disabled  = sessionActive && selectedSessionId !== s.id;
              const badgeLabel = inProgress
                ? t('sessionBadgeInProgress')
                : completed
                  ? t('sessionBadgeCompleted')
                  : isAvailable
                    ? t('sessionBadgeAvailable')
                    : t('sessionBadgeComingSoon');
              const metaLabel = isAvailable ? s.duration : null;
              return (
                <Pressable
                  key={s.id}
                  style={({ pressed }) => [
                    styles.sessionTile,
                    isAvailable ? styles.sessionTileGuided : styles.sessionTileLocked,
                    inProgress && styles.sessionTileInProgress,
                    completed && styles.sessionTileCompleted,
                    selected && !inProgress && styles.sessionTileSelected,
                    disabled && styles.btnDisabled,
                    pressed && !disabled && styles.btnPressed,
                  ]}
                  onPress={() => openSession(s.id)}
                  disabled={disabled}
                >
                  <View style={styles.sessionTileTop}>
                    {displayNumber ? (
                      <Text style={styles.sessionNumber}>{displayNumber}</Text>
                    ) : (
                      <View style={styles.sessionNumberSpacer} />
                    )}
                    <View
                      style={[
                        styles.pill,
                        inProgress
                          ? styles.pillInProgress
                          : completed
                            ? styles.pillCompleted
                            : isAvailable
                              ? styles.pillGuided
                              : styles.pillLocked,
                      ]}
                    >
                      {!isAvailable && (
                        <Ionicons name="lock-closed" size={11} color={ThemeColor.WHITE} style={styles.pillLockIcon} />
                      )}
                      <Text
                        style={[
                          styles.pillText,
                          inProgress
                            ? styles.pillTextInProgress
                            : completed
                              ? styles.pillTextCompleted
                              : isAvailable
                                ? styles.pillTextGuided
                                : styles.pillTextLocked,
                        ]}
                      >
                        {badgeLabel}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.sessionTileTitle}>{s.title}</Text>
                  {!!s.description && (
                    <Text style={[styles.sessionTileDesc, !isAvailable && styles.sessionTileDescLocked]}>
                      {s.description}
                    </Text>
                  )}
                  {metaLabel ? (
                    <Text style={styles.sessionTileMeta}>{metaLabel}</Text>
                  ) : null}
                </Pressable>
              );
            });
            })()}
          </View>

          <View style={styles.encouragementSection}>
            <Text style={styles.quoteLabel}>{t('homeQuoteLabel')}</Text>
            <Text style={styles.quoteText}>{getDailyQuote(locale)}</Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.supportBtn, pressed && styles.btnPressed]}
            onPress={() => navigation.navigate('Support')}
            accessibilityRole="button"
            accessibilityLabel={t('homeContactSupport')}
          >
            <Ionicons name="help-circle-outline" size={24} color={ThemeColor.WHITE} />
            <Text style={styles.supportBtnText}>{t('homeContactSupport')}</Text>
          </Pressable>
        </ScrollView>
      )}

      {/* ══ SESSION SCREEN — senior-friendly: large text, big targets, video-first ══ */}
      {screen === 'session' && (
        <View style={styles.v2Root}>
          <Pressable
            style={({ pressed }) => [styles.v2BackBtn, pressed && styles.btnPressed]}
            onPress={() => setScreen('home')}
            accessibilityRole="button"
            accessibilityLabel="Back to sessions list"
          >
            <Text style={styles.v2BackBtnText}>← Sessions</Text>
          </Pressable>

          {!sessionActive ? (
            <View style={styles.v2IntroCard}>
              <Text style={styles.v2Title}>{selectedSession.title}</Text>
              <Text style={styles.v2Description}>{selectedSession.description}</Text>
              {selectedSession.kind === 'video' ? (
                <Pressable
                  style={({ pressed }) => [styles.v2StartBtn, pressed && styles.btnPressed]}
                  onPress={startSession}
                  accessibilityRole="button"
                  accessibilityLabel="Start session"
                >
                  <Text style={styles.v2StartBtnText}>Start Session</Text>
                </Pressable>
              ) : (
                <View style={styles.v2ComingSoon}>
                  <Text style={styles.v2ComingSoonText}>{t('sessionDetailComingSoon')}</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.v2ActiveCard}>
              <Text style={styles.v2ActiveTitle}>Active Session: {selectedSession.title}</Text>
              <Text style={styles.v2ProgressLabel}>
                {isBreathingBreak || isMidBreak
                  ? 'Silent reflection'
                  : `Chapter ${chapterIndex + 1} of ${sessionTimeline.length}`}
                {!!sessionTimeline[chapterIndex]?.title && !(isBreathingBreak || isMidBreak) && (
                  ` · ${sessionTimeline[chapterIndex].title}`
                )}
              </Text>
              <View style={styles.chapterTimeRow}>
                <Text style={styles.chapterTimeLabel}>
                  {formatChapterTime(mediaTime)}
                </Text>
                <View style={styles.v2ProgressTrack}>
                  <View
                    style={[
                      styles.v2ProgressFill,
                      {
                        width: `${Math.min(
                          100,
                          Math.max(
                            0,
                            (mediaTime / (sessionTimeline[chapterIndex]?.mediaSeconds || 1)) * 100,
                          ),
                        )}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.chapterTimeLabel}>
                  {formatChapterTime(sessionTimeline[chapterIndex]?.mediaSeconds || 0)}
                </Text>
              </View>
            </View>
          )}

          {selectedSession.kind === 'video' && currentChapter ? (
            <View style={styles.videoSection}>
              {sessionActive && !isBreathingBreak && !isMidBreak && videoControls && (
                <View style={styles.transportBar}>
                  <Pressable
                    style={({ pressed }) => [styles.transportBtn, pressed && styles.btnPressed]}
                    onPress={() => videoControls.seekBy(-10)}
                    accessibilityRole="button"
                    accessibilityLabel="Go back 10 seconds"
                  >
                    <Text style={styles.transportBtnText}>↺ 10</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.transportBtn, pressed && styles.btnPressed]}
                    onPress={videoControls.togglePlayPause}
                    accessibilityRole="button"
                    accessibilityLabel={videoControls.isPlaying ? 'Pause' : 'Play'}
                  >
                    <Text style={styles.transportBtnText}>
                      {videoControls.isPlaying ? '❚❚' : '▶'}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.transportBtn, pressed && styles.btnPressed]}
                    onPress={() => videoControls.seekBy(10)}
                    accessibilityRole="button"
                    accessibilityLabel="Go forward 10 seconds"
                  >
                    <Text style={styles.transportBtnText}>↻ 10</Text>
                  </Pressable>
                </View>
              )}

              <SessionVideoPanel
                chapter={currentChapter}
                sessionActive={sessionActive}
                isBreathingBreak={isBreathingBreak}
                captionsEnabled={captionsOn}
                onToggleCaptions={() => setCaptionsOn((v) => !v)}
                onPlayToEnd={handleChapterPlayToEnd}
                onMidBreakChange={setIsMidBreak}
                onProgressTime={setMediaTime}
                onSkipChapterBreak={skipChapterBreak}
                onControlsReady={setVideoControls}
                onBreakOverlayChange={setBreakOverlay}
              />

              {breakOverlay && (
                <BreathingBreakOverlay
                  key={breakOverlay.overlayKey}
                  title={breakOverlay.title}
                  body={breakOverlay.body}
                  durationSeconds={breakOverlay.durationSeconds}
                  onContinue={breakOverlay.onContinue}
                />
              )}
            </View>
          ) : (
            <View style={styles.placeholderPanel}>
              <View style={styles.loadingOrb} />
              <Text style={styles.loadingText}>{t('sessionDetailComingSoon')}</Text>
            </View>
          )}

          {sessionActive && (
            <Pressable
              style={({ pressed }) => [styles.v2EndBtn, pressed && styles.btnPressed]}
              onPress={() => endSession()}
              accessibilityRole="button"
              accessibilityLabel="End session"
            >
              <Text style={styles.v2EndBtnText}>End Session</Text>
            </Pressable>
          )}
        </View>
      )}

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

  // Header
  header: {
    backgroundColor: ThemeColor.BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    color: ThemeColor.WHITE,
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },

  // Hero (no session in progress)
  hero:                { borderRadius: 16, backgroundColor: ThemeColor.BRAND, paddingHorizontal: 18, paddingVertical: 18, marginBottom: 12, gap: 8, alignItems: 'center' },
  heroEyebrow:         { color: ThemeColor.WHITE, fontSize: 22, fontWeight: '900', lineHeight: 28, textAlign: 'center' },
  heroBody:            { color: 'rgba(255,255,255,0.92)', fontSize: 17, lineHeight: 24, fontWeight: '600', textAlign: 'center' },

  // Resume hero (session in progress — primary home action)
  resumeHeroCard: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    gap: 8,
    borderWidth: 2,
    borderColor: ThemeColor.BRAND,
    ...cardShadow,
  },
  resumeHeroEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    color: ThemeColor.BRAND,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  resumeHeroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: ThemeColor.TEXT_PRIMARY,
    lineHeight: 30,
  },
  resumeHeroBody: {
    fontSize: 16,
    color: ThemeColor.HOME_CARD_TEXT,
    lineHeight: 23,
  },
  resumeHeroHint: {
    fontSize: 14,
    color: ThemeColor.HOME_SUBTITLE,
    lineHeight: 20,
    marginTop: 2,
  },
  resumeHeroBtn: {
    backgroundColor: ThemeColor.BRAND,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    width: '100%',
    marginTop: 10,
  },
  resumeHeroBtnText: {
    color: ThemeColor.WHITE,
    fontWeight: '800',
    fontSize: 18,
  },

  // ── Session video panel (fills remaining viewport, replaces avatar WebView) ──
  videoSection: {
    flex: 1,
    minHeight: 0,
    marginTop: 6,
    position: 'relative',
  },
  sessionVideoPanel: { flex: 1, minHeight: 0 },
  sessionVideoFrame: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0d1b36',
    ...cardShadow,
  },
  sessionVideo: { flex: 1, width: '100%', backgroundColor: '#0d1b36' },

  // Closed captions
  captionBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  captionText: {
    color: ThemeColor.WHITE,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 25,
    textAlign: 'center',
  },
  ccBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 40,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  ccBtnOn: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderColor: ThemeColor.WHITE,
  },
  ccBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontWeight: '900',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  ccBtnTextOn: {
    color: '#0d1b36',
  },

  // Breathing-break overlay (sits above the video frame, not clipped by it)
  breakOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,15,35,0.55)',
    borderRadius: 16,
    zIndex: 10,
    elevation: 24,
  },
  breakOverlayContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 10,
  },
  breakCircleWrap: {
    width: 130,
    height: 130,
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  breakTimerText: {
    color: ThemeColor.WHITE,
    fontSize: 44,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowRadius: 8,
  },
  breakReadyText: {
    color: ThemeColor.WHITE,
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
    textAlign: 'center',
    paddingHorizontal: 12,
    maxWidth: 280,
  },
  breakTitle: { color: ThemeColor.WHITE, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  breakBody:  { color: 'rgba(255,255,255,0.85)', fontSize: 14, lineHeight: 20, textAlign: 'center' },
  breakContinueBtn: {
    marginTop: 8,
    minHeight: 56,
    minWidth: 220,
    paddingHorizontal: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 2,
    borderColor: ThemeColor.WHITE,
  },
  breakContinueBtnWaiting: {
    opacity: 0.45,
  },
  breakContinueBtnText: {
    color: '#0d1b36',
    fontWeight: '800',
    fontSize: 17,
  },

  // Transport controls (above the video window)
  transportBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  transportBtn: {
    minWidth: 52,
    minHeight: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ThemeColor.WHITE,
    borderWidth: 1,
    borderColor: 'rgba(31,60,136,0.2)',
    paddingHorizontal: 8,
  },
  transportBtnText: {
    color: ThemeColor.BRAND,
    fontWeight: '800',
    fontSize: 13,
  },

  // Placeholder panel (coming-soon sessions)
  placeholderPanel: { flex: 1, minHeight: 0, borderRadius: 16, overflow: 'hidden', marginTop: 6, backgroundColor: '#0d1b36', alignItems: 'center', justifyContent: 'center', gap: 12, ...cardShadow },
  loadingOrb:  { width: 48, height: 48, borderRadius: 24, backgroundColor: ThemeColor.BRAND, opacity: 0.5 },
  loadingText: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' },

  // Session grid
  sectionTitle:           { fontSize: 20, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, marginBottom: 12, marginTop: 4 },
  sessionGrid:            { gap: 10, marginBottom: 20 },
  sessionTile:            { width: '100%', borderRadius: 14, padding: 16, gap: 8, borderWidth: 1.5 },
  sessionTileGuided:      { backgroundColor: '#e8edf7', borderColor: 'rgba(31,60,136,0.2)' },
  sessionTileLocked:      { backgroundColor: ThemeColor.WHITE, borderColor: 'rgba(31,60,136,0.25)' },
  sessionTileInProgress:  { borderColor: ThemeColor.BRAND, borderWidth: 2, backgroundColor: '#e8edf7' },
  sessionTileCompleted:   { backgroundColor: '#dcfce7', borderColor: '#16a34a' },
  sessionTileSelected:    { borderColor: ThemeColor.BRAND, borderWidth: 2 },
  sessionTileTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionNumber:          { fontSize: 20, fontWeight: '900', color: ThemeColor.BRAND },
  sessionNumberSpacer:      { width: 36 },
  sessionTileTitle:       { fontSize: 16, fontWeight: '800', color: ThemeColor.TEXT_PRIMARY, lineHeight: 22 },
  sessionTileDesc:        { fontSize: 14, color: ThemeColor.HOME_CARD_TEXT, lineHeight: 21 },
  sessionTileDescLocked:  { color: ThemeColor.HOME_CARD_TEXT },
  sessionTileMeta:        { fontSize: 13, color: ThemeColor.HOME_SUBTITLE, fontWeight: '600' },

  // Pills
  pill:              { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, gap: 4 },
  pillGuided:        { backgroundColor: ThemeColor.BRAND },
  pillInProgress:    { backgroundColor: '#2563eb' },
  pillLocked:        { backgroundColor: '#475569' },
  pillCompleted:     { backgroundColor: '#16a34a' },
  pillText:          { fontSize: 11, fontWeight: '800' },
  pillTextGuided:    { color: ThemeColor.WHITE },
  pillTextInProgress:{ color: ThemeColor.WHITE },
  pillTextLocked:    { color: ThemeColor.WHITE },
  pillTextCompleted: { color: ThemeColor.WHITE },
  pillLockIcon:      { marginRight: 1 },

  // Home encouragement footer
  encouragementSection: {
    marginTop: 8,
    marginBottom: 16,
    paddingVertical: 20,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(31,60,136,0.12)',
  },
  quoteLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: ThemeColor.HOME_SUBTITLE,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  quoteText: {
    fontSize: 20,
    fontWeight: '600',
    color: ThemeColor.TEXT_PRIMARY,
    lineHeight: 30,
    fontStyle: 'italic',
  },
  supportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: ThemeColor.BRAND,
    borderRadius: 14,
    minHeight: 56,
    paddingHorizontal: 20,
    paddingVertical: 14,
    marginBottom: 8,
    ...cardShadow,
  },
  supportBtnText: {
    color: ThemeColor.WHITE,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    flexShrink: 1,
  },

  // ── Session screen V2 (senior-friendly) ──
  v2Root: {
    flex: 1,
    backgroundColor: ThemeColor.SCREEN_BG,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 10,
  },
  v2BackBtn: {
    alignSelf: 'flex-start',
    minHeight: 56,
    minWidth: 160,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  v2BackBtnText: {
    color: ThemeColor.BRAND,
    fontWeight: '800',
    fontSize: 20,
  },
  v2IntroCard: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: 16,
    padding: 20,
    gap: 12,
    ...cardShadow,
  },
  v2Title: {
    fontSize: 26,
    fontWeight: '800',
    color: ThemeColor.TEXT_PRIMARY,
    lineHeight: 33,
  },
  v2Description: {
    fontSize: 18,
    fontWeight: '500',
    color: ThemeColor.HOME_CARD_TEXT,
    lineHeight: 27,
  },
  v2StartBtn: {
    backgroundColor: ThemeColor.BRAND,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    width: '100%',
    marginTop: 4,
  },
  v2StartBtnText: {
    color: ThemeColor.WHITE,
    fontWeight: '800',
    fontSize: 22,
    letterSpacing: 0.2,
  },
  v2ComingSoon: {
    backgroundColor: '#eef1f7',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 64,
    width: '100%',
    marginTop: 4,
    borderWidth: 1,
    borderColor: 'rgba(31,60,136,0.12)',
  },
  v2ComingSoonText: {
    color: ThemeColor.HOME_SUBTITLE,
    fontWeight: '800',
    fontSize: 20,
  },
  v2ActiveCard: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    ...cardShadow,
  },
  v2ActiveTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: ThemeColor.TEXT_PRIMARY,
    lineHeight: 26,
  },
  v2ProgressLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: ThemeColor.BRAND,
    lineHeight: 23,
  },
  chapterTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  chapterTimeLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: ThemeColor.TEXT_PRIMARY,
    fontVariant: ['tabular-nums'],
    minWidth: 40,
    textAlign: 'center',
  },
  v2ProgressTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(31,60,136,0.12)',
    overflow: 'hidden',
  },
  v2ProgressFill: {
    height: '100%',
    backgroundColor: ThemeColor.BRAND,
    borderRadius: 5,
  },
  v2EndBtn: {
    backgroundColor: ThemeColor.WHITE,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#c0392b',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 60,
    width: '100%',
  },
  v2EndBtnText: {
    color: '#c0392b',
    fontWeight: '800',
    fontSize: 20,
  },

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
});
