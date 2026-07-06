/** @typedef {import('../i18n/strings').AppLocale} AppLocale */

/** @type {Record<AppLocale, string[]>} */
export const HOME_QUOTES = {
  en: [
    'Take a slow breath. You are exactly where you need to be.',
    'Small moments of calm add up. You are doing enough.',
    'Kindness toward yourself is never wasted.',
    'Rest is part of caring well for others.',
    'Notice one good thing around you right now.',
    'You do not have to carry everything at once.',
    'A gentle pause can refresh your whole day.',
  ],
  ko: [
    '천천히 숨을 쉬어 보세요. 지금 여기 계신 것만으로 충분합니다.',
    '작은 평온의 순간들이 모여 큰 힘이 됩니다. 이미 잘하고 계세요.',
    '자신에게 베푸는 친절은 결코 헛되지 않습니다.',
    '쉬어 가는 것도 돌봄의 중요한 부분입니다.',
    '지금 주변에서 좋은 것 하나를 떠올려 보세요.',
    '모든 것을 한 번에 짊어질 필요는 없습니다.',
    '잠깐의 멈춤이 하루 전체를 새롭게 할 수 있습니다.',
  ],
};

/** @param {AppLocale} locale */
export function getDailyQuote(locale) {
  const quotes = HOME_QUOTES[locale] ?? HOME_QUOTES.en;
  const dayIndex = Math.floor(Date.now() / 86400000) % quotes.length;
  return quotes[dayIndex];
}
