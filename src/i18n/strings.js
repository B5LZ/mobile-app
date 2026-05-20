/** @typedef {'en' | 'ko'} AppLocale */

/** @type {Record<AppLocale, Record<string, string>>} */
export const STRINGS = {
  en: {
    signUpHeader: 'Create account',
    createAccountTitle: 'Create account',
    fullName: 'Full name',
    firstName: 'First Name',
    lastName: 'Last Name',
    email: 'Email',
    password: 'Password',
    confirmPassword: 'Confirm Password',
    dateOfBirth: 'Date of Birth',
    
    languageLabel: 'Language preference',
    langEnglish: 'English',
    langKorean: 'Korean',
    
    createAccountButton: 'Create Account',
    alreadyHaveAccount: 'Already have an account? Sign in',
    
    errorTitle: 'Error',
    errorFillAll: 'Please fill in all fields.',
    signUpFailed: 'Sign Up Failed',
    emailInUse: 'That email address is already in use.',
    
    homeTitle: 'Hi, {name}!',
    homeSubtitle: 'Mindfulness Virtual Assistant',
    homeTodaysSession: "Today's session",
    homeSessionOfTheDay: 'Session of the day',
    homeAllSessions: 'All sessions',
    homeSession: 'Session',
    chatPlaceholder: '[ AI chatbot UI placeholder ]',
    cardAboutTitle: 'About the Assistant',
    cardAboutText:
      'Our AI is trained to guide you through mindfulness exercises.',
    cardUsageTitle: 'Usage Instructions',
    cardUsageText: 'Find a quiet space and follow the breathing prompts.',
    cardUpdatesTitle: 'Recent Updates',
    cardUpdatesText: 'Korean language handling was recently improved.',
    cardSettingsTitle: 'Quick Settings',
    cardSettingsText:
      'Customize your interface and accessibility options here.',
    languageHeading: 'Language',
    sessionTimeHeading: 'Your time',
    sessionTimeValue: 'Total session time',
    logOut: 'Log out',

    homeTab: 'Home',
    myStatsTab: 'My Stats',
    profileTab: 'Profile',

    
    signInWelcome: 'Welcome',
    signInSubtitle: 'Sign in to continue',
    signInButton: 'Sign In',
    signInErrorBothFields: 'Please enter both email and password.',
    signInFailedTitle: 'Sign In Failed',
    signInFailedBody:
      'Invalid email or password. Please try again.',
    
    signUpPrompt: 'Need an account? Sign up',
    signInFooter:
      'Internal preview — University of Massachusetts Boston. Not for public distribution.',
    
    profileTitle: 'Profile',
    personalInformation: 'Personal Information',
    personalInfoBack: 'Back',
    personalInfoSave: 'Save changes',
    personalInfoSaving: 'Saving…',
    personalInfoSavedTitle: 'Saved',
    personalInfoSavedBody: 'Your personal information was updated.',
    personalInfoSaveFailedTitle: 'Could not save',
    personalInfoSaveFailedBody: 'Something went wrong. Please try again.',
    personalInfoEmailNotUpdatedTitle: 'Email not changed',
    personalInfoEmailNotUpdatedBody:
      'Your profile was saved, but changing your sign-in email may require signing in again. Try signing out and back in, or contact support.',
    settings: 'Settings',
    support: 'Support',
    },
    
  ko: {
    signUpHeader: '계정 만들기',
    createAccountTitle: '계정 만들기',
    fullName: '이름',
    firstName: '이름',
    lastName: '성',
    email: '이메일',
    password: '비밀번호',
    confirmPassword: '비밀번호 확인',
    dateOfBirth: '생년월일',
    languageLabel: '언어 설정',
    langEnglish: 'English',
    langKorean: '한국어',
    createAccountButton: '계정 만들기',
    
    alreadyHaveAccount: '이미 계정이 있으신가요? 로그인',
    errorTitle: '오류',
    errorFillAll: '모든 항목을 입력해 주세요.',
    signUpFailed: '가입 실패',
    emailInUse: '이미 사용 중인 이메일입니다.',
    
    homeTitle: '안녕하세요, {name} 님!',
    homeSubtitle: '마음챙김 가상 도우미',
    homeTodaysSession: '오늘의 세션',
    homeSessionOfTheDay: '오늘의 추천 세션',
    homeAllSessions: '전체 세션',
    homeSession: '세션',
    chatPlaceholder: '[ AI 챗봇 UI 자리 ]',
    cardAboutTitle: '어시스턴트 소개',
    cardAboutText:
      'AI가 마음챙김 활동을 안내하도록 학습되었습니다.',
    cardUsageTitle: '이용 안내',
    cardUsageText: '조용한 공간에서 안내에 따라 호흡해보세요.',
    cardUpdatesTitle: '최근 업데이트',
    cardUpdatesText: '한국어 지원이 최근에 개선되었습니다.',
    cardSettingsTitle: '빠른 설정',
    cardSettingsText: '화면 및 접근성 옵션을 여기에서 조정할 수 있습니다.',
    
    languageHeading: '언어',
    sessionTimeHeading: '이용 시간',
    sessionTimeValue: '총 세션 시간',
    logOut: '로그아웃',
    
    signInWelcome: '환영합니다',
    signInSubtitle: '계속하려면 로그인하세요',
    signInButton: '로그인',
    signInErrorBothFields: '이메일과 비밀번호를 모두 입력해 주세요.',
    signInFailedTitle: '로그인 실패',
    signInFailedBody:
      '이메일 또는 비밀번호가 올바르지 않습니다. 다시 시도해 주세요.',
    
    signUpPrompt: '계정이 없으신가요? 가입하기',
    signInFooter:
      '내부 프리뷰 버전 - UMass Boston. 외부 배포 금지.',

    profileTitle: '프로필',
    personalInformation: '개인 정보',
    personalInfoBack: '뒤로',
    personalInfoSave: '변경 사항 저장',
    personalInfoSaving: '저장 중…',
    personalInfoSavedTitle: '저장됨',
    personalInfoSavedBody: '개인 정보가 업데이트되었습니다.',
    personalInfoSaveFailedTitle: '저장 실패',
    personalInfoSaveFailedBody: '문제가 발생했습니다. 다시 시도해 주세요.',
    personalInfoEmailNotUpdatedTitle: '이메일 변경 안 됨',
    personalInfoEmailNotUpdatedBody:
      '프로필은 저장되었지만 로그인 이메일 변경에는 다시 로그인해야 할 수 있습니다. 로그아웃 후 다시 로그인해 보세요.',
    settings: '설정',
    support: '지원',

    homeTab: '홈',
    myStatsTab: '내 통계',
    profileTab: '프로필',
  },
};
