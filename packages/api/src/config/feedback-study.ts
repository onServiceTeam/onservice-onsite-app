// The tester usability study (feedback version 2, Ken 2026-10-12).
//
// This is the single source of the study wording. The public /feedback page
// renders it, the API validates answers against it, and the admin labels
// answers with it. Change the wording -> bump STUDY_VERSION, so every saved
// answer stays tied to the exact text the tester saw.
//
// Method (docs/qa/ux-testing/FEEDBACK-V2-AUDIT-AND-PLAN-2026-10-12.md):
// realistic missions written in everyday words (never the app's button
// labels), the Single Ease Question after each mission, problem reports as
// "trying to do / happened / expected", and the System Usability Scale once
// at the end. Nothing asks about things a tester cannot do in the test build.

export const STUDY_VERSION = '2.0';

export type StudyRole = 'customer' | 'provider';

export interface StudyQuestion {
  key: string;
  label: string;
  hint?: string;
  required: boolean;
  maxLength: number;
}

export interface StudyMission {
  key: string;
  role: StudyRole;
  title: string;
  goal: string;
  stopAt: string;
  needsApprovedProvider: boolean;
}

export interface StudyScreen {
  key: string;
  side: 'start' | 'customer' | 'provider' | 'account';
  name: string;
}

export const MISSION_QUESTIONS: readonly StudyQuestion[] = [
  { key: 'why', label: 'Why did you give that score?', required: true, maxLength: 2000 },
  { key: 'expected', label: 'What did you expect to happen that did not?', hint: 'Write "nothing" if it all went as you expected.', required: false, maxLength: 2000 },
  { key: 'change', label: 'What is one thing you would change on these screens?', required: false, maxLength: 2000 },
];

export const MISSION_OUTCOMES = [
  { key: 'done', label: 'Yes, I did it' },
  { key: 'partly', label: 'Partly' },
  { key: 'no', label: 'No, I could not' },
  { key: 'gave_up', label: 'I gave up' },
] as const;

export const SEQ = {
  question: 'Overall, how difficult or easy was this mission?',
  low: 'Very difficult',
  high: 'Very easy',
} as const;

export const FIRST_IMPRESSION_QUESTIONS: readonly StudyQuestion[] = [
  { key: 'what_for', label: 'What do you think this app is for?', required: true, maxLength: 1000 },
  { key: 'who_for', label: 'Who do you think it is for?', required: false, maxLength: 1000 },
  { key: 'first_tap', label: 'What would you tap first, and why?', required: false, maxLength: 1000 },
  { key: 'feeling', label: 'What was your first feeling about it? Anything that looked off?', required: false, maxLength: 1000 },
];

export const PROBLEM_QUESTIONS: readonly StudyQuestion[] = [
  { key: 'trying', label: 'What were you trying to do?', required: true, maxLength: 2000 },
  { key: 'happened', label: 'What happened?', required: true, maxLength: 3000 },
  { key: 'expected', label: 'What did you expect to happen?', required: false, maxLength: 2000 },
];

export const SEVERITIES = [
  { key: 'stopped', label: 'It stopped me', hint: 'I could not continue.' },
  { key: 'slowed', label: 'It slowed me down', hint: 'I got there, but it took effort.' },
  { key: 'annoyed', label: 'It annoyed me', hint: 'It worked, but it bothered me.' },
  { key: 'looks_wrong', label: 'It just looks wrong', hint: 'Wording, layout, colours, a typo.' },
] as const;

export const HELP_METHODS = [
  { key: 'facebook', label: 'Facebook groups or Marketplace' },
  { key: 'referral', label: 'Someone a friend or neighbour recommends' },
  { key: 'company', label: 'A service company or shop' },
  { key: 'other_app', label: 'Another app' },
  { key: 'myself', label: 'I do it myself or with family' },
  { key: 'other', label: 'Something else' },
] as const;

export const MISSIONS: readonly StudyMission[] = [
  {
    key: 'c_aircon', role: 'customer', title: 'Aircon cleaning',
    goal: 'Your aircon is dripping and not cooling well. Get someone to clean it this Saturday morning, and find out the total cost.',
    stopAt: 'Stop on the screen where you would choose how to pay. Nothing is charged. If the app says your area is not covered, use an address in Cebu City.',
    needsApprovedProvider: false,
  },
  {
    key: 'c_deep_clean', role: 'customer', title: 'Cleaning before visitors',
    goal: 'You want your 2-bedroom condo deep-cleaned before visitors arrive. Find out what the cleaning includes, how long it takes and what it costs.',
    stopAt: 'Stop when you have the answers. You do not need to book.',
    needsApprovedProvider: false,
  },
  {
    key: 'c_leak', role: 'customer', title: 'Leaking tap',
    goal: 'A tap in your kitchen keeps leaking and you are not sure what kind of service that is. Find the right service for it.',
    stopAt: 'Stop when you think you have found it.',
    needsApprovedProvider: false,
  },
  {
    key: 'c_cancel', role: 'customer', title: 'Changing your mind',
    goal: 'Imagine you booked a cleaning for tomorrow at 9 AM, and tonight you find out you have to cancel. Find out how much of what you paid you would get back.',
    stopAt: 'Stop when you have an answer, or when you decide you cannot find one.',
    needsApprovedProvider: false,
  },
  {
    key: 'c_address', role: 'customer', title: 'Your home address',
    goal: 'Save your home address so you do not have to type it every time.',
    stopAt: 'Stop when it is saved. A nearby landmark is fine instead of your real address.',
    needsApprovedProvider: false,
  },
  {
    key: 'c_trust', role: 'customer', title: 'Trusting a worker',
    goal: 'Before letting a worker into your home, you want to know you can trust them. Find out what onService does to check its workers.',
    stopAt: 'Stop when you have decided whether that would be enough for you.',
    needsApprovedProvider: false,
  },
  {
    key: 'c_help', role: 'customer', title: 'Getting help',
    goal: 'Something went wrong with a job. Find how you would get help from onService.',
    stopAt: 'Stop when you know how you would contact them. Do not send anything.',
    needsApprovedProvider: false,
  },
  {
    key: 'p_signup', role: 'provider', title: 'Signing up as a worker',
    goal: 'You clean aircons for a living. Sign up to get jobs through onService and go as far as you can.',
    stopAt: 'Stop when it asks for a document you do not have. If the app says your location is outside its area, stop there and tell us in your answer.',
    needsApprovedProvider: false,
  },
  {
    key: 'p_hours', role: 'provider', title: 'Your working hours',
    goal: 'Set your working hours: weekdays 8 AM to 5 PM, and Saturdays 8 AM to 12 noon.',
    stopAt: 'Stop when they are saved.',
    needsApprovedProvider: true,
  },
  {
    key: 'p_service', role: 'provider', title: 'Your services and prices',
    goal: 'Add a service you would offer, and find out what customers would pay for it.',
    stopAt: 'Stop when it is saved.',
    needsApprovedProvider: true,
  },
  {
    key: 'p_take_home', role: 'provider', title: 'What you take home',
    goal: 'Find out how much you would actually take home from a ₱1,000 job.',
    stopAt: 'Stop when you have a number, or when you decide you cannot find one.',
    needsApprovedProvider: true,
  },
  {
    key: 'p_jobs', role: 'provider', title: 'Getting job requests',
    goal: 'Find where new work from customers would appear, and what you have to switch on or set up to start getting it.',
    stopAt: 'Stop when you know. You will not receive real jobs in this test.',
    needsApprovedProvider: true,
  },
  {
    key: 'p_cash_out', role: 'provider', title: 'Getting paid',
    goal: 'Find out how you would move your earnings to GCash.',
    stopAt: 'Stop before you send anything.',
    needsApprovedProvider: true,
  },
  {
    key: 'p_help', role: 'provider', title: 'A difficult customer',
    goal: 'A customer was rude and will not confirm that the job is done. Find how you would get help from onService.',
    stopAt: 'Stop when you know how you would contact them. Do not send anything.',
    needsApprovedProvider: true,
  },
];

// The System Usability Scale (Brooke, 1996), with "cumbersome" replaced by
// "awkward" for non-native English readers (Finstad, 2006). Odd items are
// positive, even items negative; never reorder or reword without a new
// STUDY_VERSION, or scores stop being comparable.
export const SUS_ITEMS: readonly string[] = [
  'I think that I would like to use this app often.',
  'I found the app more complicated than it needs to be.',
  'I thought the app was easy to use.',
  'I think I would need help from a technical person to be able to use this app.',
  'I found the different parts of this app worked well together.',
  'I thought there were too many things in this app that did not match each other.',
  'I would imagine that most people would learn to use this app very quickly.',
  'I found the app very awkward to use.',
  'I felt very confident using the app.',
  'I needed to learn a lot of things before I could get going with this app.',
];
export const SUS_SCALE = { low: 'Strongly disagree', high: 'Strongly agree' } as const;

export function susScore(answers: readonly number[]): number {
  if (answers.length !== 10) throw new Error('SUS needs exactly 10 answers.');
  const sum = answers.reduce((total, value, index) => total + (index % 2 === 0 ? value - 1 : 5 - value), 0);
  return sum * 2.5;
}

export const WRAPUP_QUESTIONS: readonly (StudyQuestion & { roles?: StudyRole[] })[] = [
  { key: 'change_1', label: 'The first thing you would change', required: true, maxLength: 2000 },
  { key: 'change_2', label: 'The second thing', required: true, maxLength: 2000 },
  { key: 'change_3', label: 'The third thing', required: true, maxLength: 2000 },
  { key: 'remove', label: 'What would you remove or make simpler?', required: false, maxLength: 2000 },
  { key: 'words', label: 'Was any word or button name unclear? Which one, and what would you call it?', required: false, maxLength: 2000 },
  { key: 'would_use', label: 'Would you use this instead of how you get help today? Why or why not?', required: true, maxLength: 2000, roles: ['customer'] },
  { key: 'trust_home', label: 'What would you need to see before letting a worker from this app into your home?', required: false, maxLength: 2000, roles: ['customer'] },
  { key: 'would_rely', label: 'Would you rely on this app for income? What would have to change first?', required: true, maxLength: 2000, roles: ['provider'] },
  { key: 'anything_else', label: 'Anything else you want us to know?', required: false, maxLength: 4000 },
];

// Van Westendorp price questions for two services only, checked to rise.
export const PRICE_SERVICES = [
  { key: 'aircon_clean', name: 'Cleaning one split-type aircon' },
  { key: 'home_clean', name: 'General cleaning of a 2-bedroom home, about 3 hours' },
] as const;
export const PRICE_POINTS = [
  { key: 'too_cheap', label: 'So cheap you would doubt the quality' },
  { key: 'bargain', label: 'A good deal' },
  { key: 'expensive', label: 'Starting to feel expensive' },
  { key: 'too_expensive', label: 'Too expensive, you would not book it' },
] as const;

// From the app's real routes (screen map, 2026-10-12). Names are what a tester
// recognises, not route names.
export const SCREENS: readonly StudyScreen[] = [
  { key: 'start', side: 'start', name: 'Opening screen or welcome slides' },
  { key: 'login', side: 'start', name: 'Log in' },
  { key: 'signup', side: 'start', name: 'Sign up' },
  { key: 'email_code', side: 'start', name: 'Entering the email code' },
  { key: 'create_account', side: 'start', name: 'Your name and mobile number' },
  { key: 'role_select', side: 'start', name: 'Customer or worker? (choice after sign-up)' },
  { key: 'legal', side: 'start', name: 'Terms and privacy' },
  { key: 'home', side: 'customer', name: 'Home' },
  { key: 'search', side: 'customer', name: 'Search' },
  { key: 'category', side: 'customer', name: 'List of services in a category' },
  { key: 'service_details', side: 'customer', name: 'Service details pop-up' },
  { key: 'booking_extras', side: 'customer', name: 'Extras and price (Customize your service)' },
  { key: 'quote_request', side: 'customer', name: 'Describing a job to get quotes' },
  { key: 'booking_form', side: 'customer', name: 'Choosing address, date and time' },
  { key: 'address_picker', side: 'customer', name: 'Picking the address or map pin' },
  { key: 'checkout', side: 'customer', name: 'Checkout (choosing how to pay)' },
  { key: 'bookings', side: 'customer', name: 'My bookings' },
  { key: 'booking_details', side: 'customer', name: 'Booking details' },
  { key: 'tracker', side: 'customer', name: 'Tracking the worker' },
  { key: 'quotes', side: 'customer', name: 'Comparing quotes' },
  { key: 'after_job', side: 'customer', name: 'After the job (review, tip, photos, complete)' },
  { key: 'disputes', side: 'customer', name: 'Complaints (disputes)' },
  { key: 'chat', side: 'customer', name: 'Chat' },
  { key: 'worker_profile', side: 'customer', name: "A worker's profile" },
  { key: 'wallet', side: 'customer', name: 'Wallet' },
  { key: 'profile', side: 'customer', name: 'My profile and settings menu' },
  { key: 'addresses', side: 'customer', name: 'Saved addresses' },
  { key: 'payment_methods', side: 'customer', name: 'Payment methods' },
  { key: 'notifications', side: 'customer', name: 'Notifications' },
  { key: 'help', side: 'customer', name: 'Help and FAQ' },
  { key: 'support', side: 'customer', name: 'Messages with onService support' },
  { key: 'safety', side: 'customer', name: 'Safety information' },
  { key: 'account_data', side: 'customer', name: 'Account and data (delete account)' },
  { key: 'suki', side: 'customer', name: 'Suki Pros (favourite workers)' },
  { key: 'projects', side: 'customer', name: 'Projects' },
  { key: 'recurring', side: 'customer', name: 'Repeat bookings' },
  { key: 'ob_services', side: 'provider', name: 'Worker sign-up: business and services (1 of 6)' },
  { key: 'ob_area', side: 'provider', name: 'Worker sign-up: where you work (2 of 6)' },
  { key: 'ob_experience', side: 'provider', name: 'Worker sign-up: experience (3 of 6)' },
  { key: 'ob_documents', side: 'provider', name: 'Worker sign-up: ID and NBI (4 of 6)' },
  { key: 'ob_selfie', side: 'provider', name: 'Worker sign-up: selfie (5 of 6)' },
  { key: 'ob_agreement', side: 'provider', name: 'Worker sign-up: agreement (6 of 6)' },
  { key: 'ob_status', side: 'provider', name: 'Application status' },
  { key: 'p_dashboard', side: 'provider', name: 'Worker home (online switch)' },
  { key: 'p_requests', side: 'provider', name: 'New job requests' },
  { key: 'p_jobs', side: 'provider', name: 'My jobs' },
  { key: 'p_job', side: 'provider', name: 'Job details and doing the job' },
  { key: 'p_earnings', side: 'provider', name: 'Earnings' },
  { key: 'p_withdraw', side: 'provider', name: 'Cash out and payout accounts' },
  { key: 'p_profile', side: 'provider', name: 'Worker profile and menu' },
  { key: 'p_settings', side: 'provider', name: 'Worker settings' },
  { key: 'p_schedule', side: 'provider', name: 'Working hours and calendar' },
  { key: 'p_services', side: 'provider', name: 'Services I offer' },
  { key: 'p_level', side: 'provider', name: 'My level and commission' },
  { key: 'p_help', side: 'provider', name: 'Worker help' },
  { key: 'p_reviews', side: 'provider', name: 'My reviews' },
  { key: 'p_other', side: 'provider', name: 'Other worker tools' },
  { key: 'other', side: 'account', name: 'Somewhere else, or not sure' },
];

export function missionsFor(role: 'customer' | 'provider' | 'both'): StudyMission[] {
  return MISSIONS.filter(mission => role === 'both' || mission.role === role);
}

export function publicStudy() {
  return {
    version: STUDY_VERSION,
    missions: MISSIONS,
    missionQuestions: MISSION_QUESTIONS,
    missionOutcomes: MISSION_OUTCOMES,
    seq: SEQ,
    firstImpression: FIRST_IMPRESSION_QUESTIONS,
    problemQuestions: PROBLEM_QUESTIONS,
    severities: SEVERITIES,
    helpMethods: HELP_METHODS,
    sus: { items: SUS_ITEMS, scale: SUS_SCALE },
    wrapup: WRAPUP_QUESTIONS,
    prices: { services: PRICE_SERVICES, points: PRICE_POINTS },
    screens: SCREENS,
  };
}
