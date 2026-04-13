/**
 * Shared UI tokens. Plain JS has no `enum`; frozen objects give the same
 * fixed key set for imports across screens.
 */

const signInBackdrop = ['#FFFFFF', '#F7F8FA', '#F0F2F5'];
Object.freeze(signInBackdrop);

const primaryCta = ['#152a5c', '#1f3c88', '#1a3478'];
Object.freeze(primaryCta);

export const ThemeColor = Object.freeze({
  BRAND: '#1f3c88',
  INPUT_BG: '#F3F4F6',
  INPUT_BORDER: '#E5E7EB',
  TEXT_PRIMARY: '#111827',
  TEXT_MUTED: '#6B7280',
  PLACEHOLDER: '#9CA3AF',
  WHITE: '#ffffff',
  SHADOW_SLATE: '#0f172a',
  SCREEN_BG: '#f5f7fa',
  INPUT_BORDER_SOFT: '#d9deea',
  HOME_SUBTITLE: '#44557f',
  HOME_CHAT_MUTED: '#7a849c',
  HOME_CARD_TEXT: '#4f5a75',
  FOOTER_MUTED: 'rgba(107, 114, 128, 0.85)',
});

export const ThemeGradient = Object.freeze({
  SIGN_IN_BACKDROP: signInBackdrop,
  PRIMARY_CTA: primaryCta,
});

export const ThemeRadius = Object.freeze({
  SM: 10,
  MD: 12,
});
