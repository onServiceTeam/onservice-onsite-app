/**
 * Tester feedback page, version 2 (legal/feedback.html), loaded for real into
 * JSDOM with its inline script running. fetch is mocked with the real study
 * definition from config/feedback-study.ts (publicStudy()), so every label the
 * tests look for is the wording the live API serves.
 *
 * The page is a single static file served by nginx at /feedback; this is the
 * only jest runner in the repo that can load it (see the v2 plan, section 6.3).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { publicStudy } from '../src/config/feedback-study';

/* eslint-disable @typescript-eslint/no-explicit-any */

const HTML = readFileSync(path.resolve(__dirname, '../../..', 'legal', 'feedback.html'), 'utf8');
const STUDY = JSON.parse(JSON.stringify(publicStudy()));
type Doc = JSDOM['window']['document'];
const API = '/api/v1/feedback/v2';
const SID = '11111111-2222-4333-8444-555555555555';
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz0123456789';
const SHOT_NAME = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png';

interface Call { url: string; init: any }
type Reply = { status: number; body: unknown } | Promise<{ status: number; body: unknown }>;
type Handler = (url: string, init: any) => Reply | undefined;

function reply(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const METHODS_URL = '/api/v1/auth/methods';
function methodsBody(emailOn: boolean) {
  // Same shape as GET /api/v1/auth/methods in src/routes/auth.routes.ts.
  return {
    success: true,
    data: {
      phoneOtp: { supported: true, enabled: false },
      emailCode: { enabled: emailOn, codeLength: 6, validForMs: 600000, resendCooldownMs: 60000 },
    },
  };
}

function defaultReply(url: string, init: any, role: string, emailCodes: boolean | undefined): Reply {
  const method = (init && init.method) || 'GET';
  if (url === METHODS_URL && emailCodes !== undefined) return { status: 200, body: methodsBody(emailCodes) };
  if (url === `${API}/study`) return { status: 200, body: { success: true, data: STUDY } };
  if (url === `${API}/sessions` && method === 'POST') {
    return { status: 201, body: { success: true, data: { sessionId: SID, token: TOKEN, studyVersion: STUDY.version } } };
  }
  if (url === `${API}/sessions/${SID}/progress`) {
    return { status: 200, body: { success: true, data: { role, studyVersion: STUDY.version, saved: [], problems: 0 } } };
  }
  if (url === `${API}/sessions/${SID}/entries`) return { status: 201, body: { success: true, data: { entryId: 'e1' } } };
  if (url === `${API}/sessions/${SID}/uploads`) return { status: 201, body: { success: true, data: { filename: SHOT_NAME } } };
  return { status: 404, body: { success: false, error: { message: 'Not found', statusCode: 404 } } };
}

const open: JSDOM[] = [];
afterEach(() => {
  while (open.length) open.pop()!.window.close();
});

function boot(options: {
  url?: string; storage?: Record<string, string>; handler?: Handler; role?: string; blockStorage?: boolean;
  /** What GET /api/v1/auth/methods says about email codes. Left out: that call gets a 404. */
  emailCodes?: boolean;
} = {}) {
  const calls: Call[] = [];
  const role = options.role ?? 'customer';
  let blobCount = 0;
  const revoke = jest.fn();
  const fetchMock = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init: init || {} });
    const custom = options.handler ? options.handler(url, init || {}) : undefined;
    const r = await (custom ?? defaultReply(url, init || {}, role, options.emailCodes));
    return reply(r.status, r.body);
  });
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously',
    url: options.url ?? 'https://app.onservice.ph/feedback',
    beforeParse(window: any) {
      Object.defineProperty(window, 'fetch', { value: fetchMock, configurable: true });
      Object.defineProperty(window.URL, 'createObjectURL', {
        value: jest.fn(() => { blobCount += 1; return `blob:preview-${blobCount}`; }), configurable: true,
      });
      Object.defineProperty(window.URL, 'revokeObjectURL', { value: revoke, configurable: true });
      Object.defineProperty(window, 'scrollTo', { value: jest.fn(), configurable: true });
      if (options.blockStorage) {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() { throw new window.DOMException('The operation is insecure.', 'SecurityError'); },
        });
      } else {
        for (const [k, v] of Object.entries(options.storage ?? {})) window.localStorage.setItem(k, v);
      }
    },
  });
  open.push(dom);
  const win = dom.window as any;
  const doc = win.document as Doc;
  return { dom, win, doc, calls, fetchMock, revoke };
}

async function waitFor<T>(check: () => T, what: string, timeoutMs = 2000): Promise<NonNullable<T>> {
  const started = Date.now();
  for (;;) {
    const value = check();
    if (value) return value as NonNullable<T>;
    if (Date.now() - started > timeoutMs) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}
const tick = () => new Promise(resolve => setTimeout(resolve, 20));

function heading(doc: Doc) { return doc.querySelector('h1')?.textContent ?? ''; }
/** What the tester sees. Not body.textContent: that also holds the inline script's source. */
function shown(doc: Doc) {
  return `${doc.getElementById('app')?.textContent ?? ''} ${doc.getElementById('reportBar')?.textContent ?? ''}`;
}
async function waitForHeading(doc: Doc, text: string) {
  await waitFor(() => heading(doc) === text, `heading "${text}" (now "${heading(doc)}")`);
}
function fieldByLabel(doc: Doc, labelStart: string): HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement {
  const label = Array.from(doc.querySelectorAll('label[for]'))
    .find(l => (l.textContent ?? '').trim().startsWith(labelStart));
  if (!label) throw new Error(`No label starting "${labelStart}"`);
  const el = doc.getElementById(label.getAttribute('for')!);
  if (!el) throw new Error(`Label "${labelStart}" points at nothing`);
  return el as any;
}
function choiceInput(doc: Doc, name: string, text: string): HTMLInputElement {
  const input = Array.from(doc.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`))
    .find(i => (i.closest('label')?.querySelector('.ct')?.textContent ?? '') === text);
  if (!input) throw new Error(`No ${name} choice "${text}"`);
  return input;
}
function type(win: any, el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  el.value = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function button(doc: Doc, text: string): HTMLButtonElement {
  const found = Array.from(doc.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => (b.textContent ?? '').trim() === text);
  if (!found) throw new Error(`No button "${text}"`);
  return found;
}
function saveButton(doc: Doc): HTMLButtonElement {
  return doc.querySelector<HTMLButtonElement>('main form button[type="submit"]')!;
}
function entryCalls(calls: Call[]) {
  return calls.filter(c => c.url === `${API}/sessions/${SID}/entries`);
}
function lastEntryBody(calls: Call[]) {
  const list = entryCalls(calls);
  return JSON.parse(list[list.length - 1]!.init.body);
}
function sessionStorageSeed(role = 'customer') {
  return { 'osfb2:session': JSON.stringify({ id: SID, token: TOKEN, role }) };
}
function alertText(doc: Doc) {
  return Array.from(doc.querySelectorAll('main .err')).map(e => e.textContent ?? '').join(' ').trim();
}
function pasteImage(win: any, target: any, file: any) {
  const event = new win.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: {
      items: [{ kind: 'file', type: file.type, getAsFile: () => file }],
      files: [],
      getData: () => '',
    },
  });
  target.dispatchEvent(event);
  return event;
}
async function goToTask(doc: Doc, title: string) {
  const link = await waitFor(() => Array.from(doc.querySelectorAll<any>('a.task'))
    .find(a => a.querySelector('.task-title')?.textContent === title), `task "${title}"`);
  link.click();
  await waitForHeading(doc, title);
}

describe('tester feedback page v2 (legal/feedback.html)', () => {
  it('requires the consent tick before a tester can continue, and creates no session without it', async () => {
    const { doc, calls, win } = boot();
    await waitForHeading(doc, 'Help us test the onService app');
    expect(shown(doc)).toContain('We are testing the app, not you.');
    expect(shown(doc)).toContain('No money is charged and no worker will come to your house.');

    button(doc, 'Next').click();
    expect(alertText(doc)).toBe('Please agree to the privacy notice to start.');
    expect(doc.querySelector('main .err')?.getAttribute('aria-live')).toBe('assertive');
    expect(heading(doc)).toBe('Help us test the onService app');
    expect(calls.some(c => c.url === `${API}/sessions`)).toBe(false);

    const consent = fieldByLabel(doc, 'I have read this') as HTMLInputElement;
    consent.click();
    expect(consent.checked).toBe(true);
    button(doc, 'Next').click();
    await waitForHeading(doc, 'About you');
    // Help methods come from the study, not from the page.
    for (const method of STUDY.helpMethods) expect(choiceInput(doc, 'helpMethods', method.label).value).toBe(method.key);
    expect(win.document.querySelector('input[name="website"]')).not.toBeNull();
  });

  it('creates the session with the honeypot empty, then lists only the missions for the chosen side', async () => {
    const { doc, calls, win } = boot();
    await waitForHeading(doc, 'Help us test the onService app');
    (fieldByLabel(doc, 'I have read this') as HTMLInputElement).click();
    button(doc, 'Next').click();
    await waitForHeading(doc, 'About you');

    button(doc, 'Start the test').click();
    expect(alertText(doc)).toBe('Please choose which side you will test.');
    expect(calls.some(c => c.url === `${API}/sessions`)).toBe(false);

    choiceInput(doc, 'role', 'Customer').click();
    choiceInput(doc, 'helpMethods', STUDY.helpMethods[0].label).click();
    choiceInput(doc, 'helpMethods', STUDY.helpMethods[1].label).click();
    type(win, fieldByLabel(doc, 'Your name') as HTMLInputElement, '  Maria  ');
    button(doc, 'Start the test').click();

    await waitForHeading(doc, 'Your test');
    const create = calls.find(c => c.url === `${API}/sessions`)!;
    expect(create.init.method).toBe('POST');
    const body = JSON.parse(create.init.body);
    expect(body).toEqual(expect.objectContaining({
      consent: true,
      role: 'customer',
      deviceKind: 'computer',
      appSurface: 'browser',
      helpMethods: [STUDY.helpMethods[0].key, STUDY.helpMethods[1].key],
      testerName: 'Maria',
      website: '',
    }));
    expect(typeof body.platformDetail).toBe('string');
    expect(body.testerContact).toBeUndefined();
    expect(JSON.parse(win.localStorage.getItem('osfb2:session'))).toEqual({ id: SID, token: TOKEN, role: 'customer' });

    const titles = Array.from(doc.querySelectorAll('.task-title')).map(t => t.textContent);
    for (const m of STUDY.missions) {
      if (m.role === 'customer') expect(titles).toContain(m.title);
      else expect(titles).not.toContain(m.title);
    }
    expect(titles).toEqual(expect.arrayContaining(['First impression', 'Wrap-up']));
    expect(doc.getElementById('reportBar')!.hidden).toBe(false);
  });

  it('saves a mission with exactly the body the API expects, and marks it done', async () => {
    const { doc, calls, win } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    const mission = STUDY.missions.find((m: any) => m.key === 'c_aircon');
    await goToTask(doc, mission.title);
    expect(shown(doc)).toContain(mission.goal);
    expect(shown(doc)).toContain(mission.stopAt);
    expect(shown(doc)).toContain(STUDY.seq.question);
    expect(shown(doc)).toContain(`1 = ${STUDY.seq.low}`);
    expect(shown(doc)).toContain(`7 = ${STUDY.seq.high}`);
    expect(doc.querySelectorAll('input[name="seq"]')).toHaveLength(7);

    choiceInput(doc, 'outcome', STUDY.missionOutcomes[1].label).click();
    doc.querySelector<HTMLInputElement>('input[name="seq"][value="5"]')!.click();
    type(win, fieldByLabel(doc, STUDY.missionQuestions[0].label), 'The price only showed at the end.');
    type(win, fieldByLabel(doc, STUDY.missionQuestions[2].label), '   ');
    saveButton(doc).click();

    await waitForHeading(doc, 'Your test');
    const call = entryCalls(calls)[0]!;
    expect(call.init.method).toBe('POST');
    expect(call.init.headers['x-feedback-session']).toBe(TOKEN);
    expect(JSON.parse(call.init.body)).toEqual({
      kind: 'mission',
      missionKey: 'c_aircon',
      outcome: STUDY.missionOutcomes[1].key,
      seq: 5,
      answers: { why: 'The price only showed at the end.' },
      screenshots: [],
    });
    expect(doc.querySelector('.flash')?.textContent).toBe(`Saved: ${mission.title}. Thank you!`);
    const row = Array.from(doc.querySelectorAll('a.task')).find(a => a.querySelector('.task-title')?.textContent === mission.title)!;
    expect(row.querySelector('.pill')?.textContent).toBe('Done');
  });

  it("shows the server's error message on a failed save and keeps what the tester typed", async () => {
    const serverMessage = `Please answer: ${STUDY.missionQuestions[0].label}`;
    const { doc, win } = boot({
      storage: sessionStorageSeed(),
      handler: url => (url.endsWith('/entries')
        ? { status: 400, body: { success: false, error: { message: serverMessage, statusCode: 400 } } }
        : undefined),
    });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Aircon cleaning');
    choiceInput(doc, 'outcome', STUDY.missionOutcomes[0].label).click();
    type(win, fieldByLabel(doc, STUDY.missionQuestions[1].label), 'I expected a total price.');
    saveButton(doc).click();
    await waitFor(() => alertText(doc) === serverMessage, 'server error shown');
    expect(doc.querySelector('main .err')?.getAttribute('role')).toBe('alert');
    expect(heading(doc)).toBe('Aircon cleaning');
    expect((fieldByLabel(doc, STUDY.missionQuestions[1].label) as HTMLTextAreaElement).value).toBe('I expected a total price.');
    expect(saveButton(doc).disabled).toBe(false);
    expect(saveButton(doc).textContent).toBe('Save');
    // The form was locked during the save and is open again after the error.
    expect((fieldByLabel(doc, STUDY.missionQuestions[1].label) as HTMLTextAreaElement).disabled).toBe(false);
    expect(choiceInput(doc, 'outcome', STUDY.missionOutcomes[0].label).disabled).toBe(false);
  });

  it('resumes from localStorage: progress from the server, drafts from the phone', async () => {
    const draftText = 'Half-written answer from yesterday';
    const { doc, calls, win } = boot({
      storage: {
        ...sessionStorageSeed(),
        'osfb2:draft:mission:c_leak': JSON.stringify({ fields: { 'a:why': draftText, outcome: 'no' }, shots: [] }),
      },
      handler: url => (url.endsWith('/progress')
        ? { status: 200, body: { success: true, data: {
          role: 'customer', studyVersion: STUDY.version, problems: 2,
          saved: [{ kind: 'first_impression', itemKey: 'first_impression', updatedAt: '2026-10-12T00:00:00.000Z' },
            { kind: 'mission', itemKey: 'c_aircon', updatedAt: '2026-10-12T00:00:00.000Z' }],
        } } }
        : undefined),
    });
    await waitForHeading(doc, 'Your test');
    const progress = calls.find(c => c.url === `${API}/sessions/${SID}/progress`)!;
    expect(progress.init.headers['x-feedback-session']).toBe(TOKEN);
    const pill = (title: string) => Array.from(doc.querySelectorAll('a.task'))
      .find(a => a.querySelector('.task-title')?.textContent === title)!.querySelector('.pill')!.textContent;
    expect(pill('First impression')).toBe('Done');
    expect(pill('Aircon cleaning')).toBe('Done');
    expect(pill('Leaking tap')).toBe('Not done');
    expect(shown(doc)).toContain('Problems you reported so far: 2.');
    expect(calls.some(c => c.url === `${API}/sessions`)).toBe(false);

    await goToTask(doc, 'Leaking tap');
    const why = fieldByLabel(doc, STUDY.missionQuestions[0].label) as HTMLTextAreaElement;
    expect(why.value).toBe(draftText);
    expect(choiceInput(doc, 'outcome', STUDY.missionOutcomes[2].label).checked).toBe(true);

    // Autosave on every keystroke.
    type(win, why, 'Changed my answer');
    expect(JSON.parse(win.localStorage.getItem('osfb2:draft:mission:c_leak')).fields['a:why']).toBe('Changed my answer');
  });

  it('offers to start again when the saved session is no longer accepted (401)', async () => {
    const message = 'Your feedback session was not found. Please start again from the feedback page.';
    const { doc, win } = boot({
      storage: sessionStorageSeed(),
      handler: url => (url.endsWith('/progress')
        ? { status: 401, body: { success: false, error: { message, statusCode: 401 } } }
        : undefined),
    });
    await waitForHeading(doc, 'We could not open your saved test');
    expect(shown(doc)).toContain(message);
    button(doc, 'Start again').click();
    await waitForHeading(doc, 'Help us test the onService app');
    expect(win.localStorage.getItem('osfb2:session')).toBeNull();
  });

  it('still works with storage blocked by the browser', async () => {
    const { doc } = boot({ blockStorage: true });
    await waitForHeading(doc, 'Help us test the onService app');
    (fieldByLabel(doc, 'I have read this') as HTMLInputElement).click();
    button(doc, 'Next').click();
    await waitForHeading(doc, 'About you');
    choiceInput(doc, 'role', 'Provider').click();
    button(doc, 'Start the test').click();
    await waitForHeading(doc, 'Your test');
    const titles = Array.from(doc.querySelectorAll('.task-title')).map(t => t.textContent);
    expect(titles).toContain('Your working hours');
    expect(titles).not.toContain('Aircon cleaning');
    expect(shown(doc)).toContain('Opens after Ken approves your worker account.');
  });

  it('uploads a pasted image at once, and Save waits until the upload finishes', async () => {
    let finishUpload: (r: { status: number; body: unknown }) => void = () => undefined;
    const { doc, calls, win } = boot({
      storage: sessionStorageSeed(),
      handler: url => (url.endsWith('/uploads')
        ? new Promise(resolve => { finishUpload = resolve; })
        : undefined),
    });
    await waitForHeading(doc, 'Your test');
    doc.getElementById('reportBtn')!.click();
    await waitForHeading(doc, 'Report a problem');
    expect(doc.getElementById('reportBar')!.hidden).toBe(true);

    type(win, fieldByLabel(doc, STUDY.problemQuestions[0].label), 'Book an aircon cleaning');
    type(win, fieldByLabel(doc, STUDY.problemQuestions[1].label), 'The Next button did nothing');
    choiceInput(doc, 'severity', STUDY.severities[0].label).click();
    expect(shown(doc)).toContain(STUDY.severities[0].hint);

    const file = new win.File(['png bytes'], 'image.png', { type: 'image/png' });
    const event = pasteImage(win, fieldByLabel(doc, STUDY.problemQuestions[1].label), file);
    expect(event.defaultPrevented).toBe(true);

    const upload = await waitFor(() => calls.find(c => c.url === `${API}/sessions/${SID}/uploads`), 'upload call');
    expect(upload.init.method).toBe('POST');
    expect(upload.init.headers['x-feedback-session']).toBe(TOKEN);
    expect(upload.init.body).toBeInstanceOf(win.FormData);
    const sent = upload.init.body.get('file');
    expect(sent.name).toBe('screenshot.png');
    expect(sent.type).toBe('image/png');

    const chip = doc.querySelector('.chip')!;
    expect(chip.querySelector('.chip-text')?.textContent).toBe('Uploading...');
    expect(chip.querySelector('img')?.getAttribute('src')).toBe('blob:preview-1');
    expect(saveButton(doc).disabled).toBe(true);
    expect(saveButton(doc).textContent).toBe('Waiting for 1 screenshot to finish');
    saveButton(doc).click();
    await tick();
    expect(entryCalls(calls)).toHaveLength(0);

    finishUpload({ status: 201, body: { success: true, data: { filename: SHOT_NAME } } });
    await waitFor(() => !saveButton(doc).disabled, 'save enabled');
    expect(saveButton(doc).textContent).toBe('Save');
    expect(doc.querySelector('.chip .chip-text')?.textContent).toBe('Screenshot 1 added');
    // The draft remembers when the screenshot was uploaded (the server drops unsaved ones after a day).
    const draftShots = JSON.parse(win.localStorage.getItem('osfb2:draft:problem')).shots;
    expect(draftShots).toEqual([{ filename: SHOT_NAME, at: expect.any(Number) }]);
    expect(Math.abs(Date.now() - draftShots[0].at)).toBeLessThan(60_000);

    saveButton(doc).click();
    await waitForHeading(doc, 'Saved. Thank you!');
    expect(lastEntryBody(calls)).toEqual({
      kind: 'problem',
      answers: { trying: 'Book an aircon cleaning', happened: 'The Next button did nothing' },
      severity: STUDY.severities[0].key,
      screenshots: [SHOT_NAME],
    });
    expect(button(doc, 'Report another')).toBeTruthy();
    expect(button(doc, 'Back to missions')).toBeTruthy();
    button(doc, 'Report another').click();
    await waitForHeading(doc, 'Report a problem');
    expect((fieldByLabel(doc, STUDY.problemQuestions[0].label) as HTMLTextAreaElement).value).toBe('');
    expect(doc.querySelectorAll('.chip')).toHaveLength(0);
  });

  it('shows a failed upload as visible text with a Remove button, and Remove clears it', async () => {
    const serverMessage = 'This session has reached its limit of 60 screenshots.';
    const { doc, calls, win, revoke } = boot({
      storage: sessionStorageSeed(),
      handler: url => (url.endsWith('/uploads')
        ? { status: 400, body: { success: false, error: { message: serverMessage, statusCode: 400 } } }
        : undefined),
    });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Aircon cleaning');
    const input = doc.querySelector<HTMLInputElement>('main input[type="file"]')!;
    expect(input.getAttribute('accept')).toBe('image/*');
    expect(input.hasAttribute('multiple')).toBe(true);
    const file = new win.File(['jpg bytes'], 'photo.jpg', { type: 'image/jpeg' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new win.Event('change', { bubbles: true }));

    await waitFor(() => doc.querySelector('.chip.failed'), 'failed chip');
    const chip = doc.querySelector('.chip.failed')!;
    expect(chip.querySelector('.chip-text')?.textContent).toBe(`Upload failed: ${serverMessage}`);
    expect(chip.getAttribute('title')).toBeNull();
    expect(saveButton(doc).disabled).toBe(false);
    expect(calls.filter(c => c.url.endsWith('/uploads'))).toHaveLength(1);

    const remove = chip.querySelector('button')!;
    expect(remove.textContent).toBe('Remove');
    remove.click();
    expect(doc.querySelectorAll('.chip')).toHaveLength(0);
    expect(revoke).toHaveBeenCalledWith('blob:preview-1');
  });

  it('?report=1&screen= from the app: onboarding, then the problem form with the screen pre-filled', async () => {
    const route = '/customer/bookings/abc123';
    const { doc, calls, win } = boot({
      url: `https://app.onservice.ph/feedback?report=1&screen=${encodeURIComponent(route)}&app=1.0.2&surface=apk`,
    });
    await waitForHeading(doc, 'Help us test the onService app');
    (fieldByLabel(doc, 'I have read this') as HTMLInputElement).click();
    button(doc, 'Next').click();
    await waitForHeading(doc, 'About you');
    expect((fieldByLabel(doc, 'Are you testing the app') as HTMLSelectElement).value).toBe('apk');
    choiceInput(doc, 'role', 'Both').click();
    button(doc, 'Start the test').click();

    await waitForHeading(doc, 'Report a problem');
    const created = JSON.parse(calls.find(c => c.url === `${API}/sessions`)!.init.body);
    expect(created.appVersion).toBe('1.0.2');
    expect(created.appSurface).toBe('apk');
    const noted = doc.querySelector('[data-noted-route]')!;
    expect(noted.textContent).toBe(`We noted the screen you were on: ${route}`);
    expect(win.location.search).toBe('');

    // The screen picker comes from the study.
    const picker = fieldByLabel(doc, 'Which screen was it?') as HTMLSelectElement;
    const options = Array.from(picker.querySelectorAll('option')).map(o => o.value).filter(Boolean);
    expect(options).toEqual(STUDY.screens.map((s: any) => s.key));

    type(win, fieldByLabel(doc, STUDY.problemQuestions[0].label), 'Check my booking');
    type(win, fieldByLabel(doc, STUDY.problemQuestions[1].label), 'Blank screen');
    choiceInput(doc, 'severity', STUDY.severities[3].label).click();
    saveButton(doc).click();
    await waitForHeading(doc, 'Saved. Thank you!');
    expect(lastEntryBody(calls)).toEqual(expect.objectContaining({
      kind: 'problem', screenRoute: route, severity: STUDY.severities[3].key, appVersion: '1.0.2',
    }));
  });

  it('?report=1 with a saved session goes straight to the problem form', async () => {
    const { doc } = boot({
      url: 'https://app.onservice.ph/feedback?report=1&screen=%2Fprovider%2Fjobs',
      storage: sessionStorageSeed('provider'),
    });
    await waitForHeading(doc, 'Report a problem');
    expect(doc.querySelector('[data-noted-route] .route')?.textContent).toBe('/provider/jobs');
  });

  it('wrap-up: falling prices show the message and block Save; a full wrap-up saves the right body', async () => {
    const { doc, calls, win } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Wrap-up');

    // Role filter: customer sees the customer question, not the provider one.
    const labels = Array.from(doc.querySelectorAll('label[for]')).map(l => (l.textContent ?? '').trim());
    const customerQ = STUDY.wrapup.find((q: any) => q.key === 'would_use');
    const providerQ = STUDY.wrapup.find((q: any) => q.key === 'would_rely');
    expect(labels.some(l => l.startsWith(customerQ.label))).toBe(true);
    expect(labels.some(l => l.startsWith(providerQ.label))).toBe(false);
    expect(doc.querySelectorAll('main fieldset .scale')).toHaveLength(STUDY.sus.items.length);
    expect(shown(doc)).toContain(`1. ${STUDY.sus.items[0]}`);

    const aircon = STUDY.prices.services[0];
    const message = `For "${aircon.name}", each price should be the same or higher than the one before it.`;
    const priceInput = (serviceKey: string, pointKey: string) =>
      doc.querySelector<HTMLInputElement>(`input[name="p:${serviceKey}:${pointKey}"]`)!;
    type(win, priceInput(aircon.key, 'too_cheap'), '500');
    type(win, priceInput(aircon.key, 'bargain'), '300');
    expect(doc.querySelector(`[data-price-error="${aircon.key}"]`)?.textContent).toBe(message);

    STUDY.sus.items.forEach((_: string, i: number) => {
      doc.querySelector<HTMLInputElement>(`input[name="sus${i}"][value="${(i % 5) + 1}"]`)!.click();
    });
    for (const q of STUDY.wrapup.filter((w: any) => w.required && (!w.roles || w.roles.includes('customer')))) {
      type(win, fieldByLabel(doc, q.label), `Answer to ${q.key}`);
    }
    saveButton(doc).click();
    await tick();
    expect(alertText(doc)).toContain(message);
    expect(entryCalls(calls)).toHaveLength(0);

    type(win, priceInput(aircon.key, 'bargain'), '800');
    type(win, priceInput(aircon.key, 'too_expensive'), '1,500');
    expect(doc.querySelector(`[data-price-error="${aircon.key}"]`)?.textContent).toBe('');
    saveButton(doc).click();
    await waitForHeading(doc, 'Thank you!');

    const body = lastEntryBody(calls);
    expect(body.kind).toBe('wrapup');
    expect(body.sus).toEqual([1, 2, 3, 4, 5, 1, 2, 3, 4, 5]);
    expect(body.answers).toEqual({
      change_1: 'Answer to change_1', change_2: 'Answer to change_2', change_3: 'Answer to change_3',
      would_use: 'Answer to would_use',
    });
    expect(body.prices).toEqual({ [aircon.key]: { too_cheap: 500, bargain: 800, too_expensive: 1500 } });
    expect(body.screenshots).toEqual([]);
    const customerMissions = STUDY.missions.filter((m: any) => m.role === 'customer').length;
    expect(shown(doc)).toContain(`You finished 0 of ${customerMissions} missions and sent 0 problem reports.`);
    expect(shown(doc)).toContain('You can come back to this page any time and add more.');
    expect(doc.querySelector('[data-remembered]')?.getAttribute('data-remembered')).toBe('yes');
  });

  it('shows a retry when the study cannot be loaded, and recovers on retry', async () => {
    let failStudy = true;
    const { doc, calls } = boot({
      handler: url => {
        if (url !== `${API}/study`) return undefined;
        return failStudy ? { status: 200, body: { success: true, data: { missions: 'broken' } } } : undefined;
      },
    });
    await waitForHeading(doc, 'Something went wrong');
    expect(shown(doc)).toContain('We could not load the test.');
    failStudy = false;
    button(doc, 'Try again').click();
    await waitForHeading(doc, 'Help us test the onService app');
    expect(calls.filter(c => c.url === `${API}/study`)).toHaveLength(2);
  });

  it('wrap-up refuses to send until all SUS statements are answered', async () => {
    const { doc, calls } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Wrap-up');
    doc.querySelector<HTMLInputElement>('input[name="sus0"][value="4"]')!.click();
    saveButton(doc).click();
    await tick();
    expect(alertText(doc)).toBe('Please answer all 10 statements.');
    expect(entryCalls(calls)).toHaveLength(0);
  });
});

// ---------- Fixes from the adversarial review (2026-10-12) ----------

const SIGN_IN_EMAIL = 'Sign up in the app with your own email address. The app sends a 6-digit code to that email. If it does not arrive within a minute, check your Spam or Promotions folder.';
const SIGN_IN_ASK_KEN = 'Sign in the way Ken told you, or ask him for your sign-in details.';

async function onboard(doc: Doc, roleLabel: string, before?: () => void) {
  await waitForHeading(doc, 'Help us test the onService app');
  (fieldByLabel(doc, 'I have read this') as HTMLInputElement).click();
  button(doc, 'Next').click();
  await waitForHeading(doc, 'About you');
  choiceInput(doc, 'role', roleLabel).click();
  if (before) before();
  button(doc, 'Start the test').click();
}
async function openProblemForm(doc: Doc) {
  doc.getElementById('reportBtn')!.click();
  await waitForHeading(doc, 'Report a problem');
}
function fillProblem(doc: Doc, win: any) {
  type(win, fieldByLabel(doc, STUDY.problemQuestions[0].label), 'Pay for a booking');
  type(win, fieldByLabel(doc, STUDY.problemQuestions[1].label), 'The Pay button spun forever');
  choiceInput(doc, 'severity', STUDY.severities[0].label).click();
}
function fillWrapup(doc: Doc, win: any, role = 'customer') {
  STUDY.sus.items.forEach((_: string, i: number) => {
    doc.querySelector<HTMLInputElement>(`input[name="sus${i}"][value="3"]`)!.click();
  });
  for (const q of STUDY.wrapup.filter((w: any) => w.required && (!w.roles || w.roles.includes(role)))) {
    type(win, fieldByLabel(doc, q.label), `Answer to ${q.key}`);
  }
}
function sessionWithVersion(version: string) {
  return { 'osfb2:session': JSON.stringify({ id: SID, token: TOKEN, role: 'customer', appVersion: version }) };
}

describe('tester feedback page v2: review fixes', () => {
  it('promises an emailed 6-digit code only when GET /api/v1/auth/methods says email codes are on', async () => {
    const welcome = boot({ emailCodes: true });
    await waitForHeading(welcome.doc, 'Help us test the onService app');
    expect(welcome.calls.some(c => c.url === METHODS_URL)).toBe(true);
    expect(welcome.doc.querySelector('main [data-sign-in]')?.textContent).toBe(SIGN_IN_EMAIL);
    expect(shown(welcome.doc)).not.toContain(SIGN_IN_ASK_KEN);

    const home = boot({ emailCodes: true, storage: sessionStorageSeed() });
    await waitForHeading(home.doc, 'Your test');
    expect(home.doc.querySelector('main [data-sign-in]')?.textContent)
      .toBe('To sign in to the app, sign up with your own email address. Check Spam or Promotions if the code does not arrive.');
  });

  it('tells testers to sign in the way Ken told them when email codes are off', async () => {
    const welcome = boot({ emailCodes: false });
    await waitForHeading(welcome.doc, 'Help us test the onService app');
    expect(welcome.doc.querySelector('main [data-sign-in]')?.textContent).toBe(SIGN_IN_ASK_KEN);
    expect(shown(welcome.doc)).not.toContain('6-digit');

    const home = boot({ emailCodes: false, storage: sessionStorageSeed() });
    await waitForHeading(home.doc, 'Your test');
    expect(home.doc.querySelector('main [data-sign-in]')?.textContent).toBe(SIGN_IN_ASK_KEN);
    expect(shown(home.doc)).not.toContain('code does not arrive');
  });

  it('uses the ask-Ken wording when the sign-in check fails (network error or server error)', async () => {
    const offline = boot({
      handler: url => (url === METHODS_URL ? Promise.reject(new TypeError('Failed to fetch')) : undefined),
    });
    await waitForHeading(offline.doc, 'Help us test the onService app');
    expect(offline.doc.querySelector('main [data-sign-in]')?.textContent).toBe(SIGN_IN_ASK_KEN);

    const broken = boot({
      handler: url => (url === METHODS_URL ? { status: 500, body: { success: false, error: { message: 'boom' } } } : undefined),
    });
    await waitForHeading(broken.doc, 'Help us test the onService app');
    expect(broken.doc.querySelector('main [data-sign-in]')?.textContent).toBe(SIGN_IN_ASK_KEN);
    expect(shown(broken.doc)).not.toContain('6-digit');
  });

  it('tells provider and Both testers about the one-time "I provide services" choice, on About you and on Home', async () => {
    const { doc } = boot();
    await waitForHeading(doc, 'Help us test the onService app');
    (fieldByLabel(doc, 'I have read this') as HTMLInputElement).click();
    button(doc, 'Next').click();
    await waitForHeading(doc, 'About you');
    const note = () => doc.querySelector<HTMLElement>('main [data-provider-note="about"]')!;
    expect(note().hidden).toBe(true);
    choiceInput(doc, 'role', 'Provider').click();
    expect(note().hidden).toBe(false);
    expect(note().textContent).toContain('Choose "I provide services".');
    expect(note().textContent).toContain('This choice appears only once');
    choiceInput(doc, 'role', 'Customer').click();
    expect(note().hidden).toBe(true);
    choiceInput(doc, 'role', 'Both').click();
    expect(note().hidden).toBe(false);

    for (const r of ['provider', 'both']) {
      const home = boot({ storage: sessionStorageSeed(r), role: r });
      await waitForHeading(home.doc, 'Your test');
      expect(home.doc.querySelector('main [data-provider-note="home"]')?.textContent).toContain('Choose "I provide services".');
    }
    const customer = boot({ storage: sessionStorageSeed('customer') });
    await waitForHeading(customer.doc, 'Your test');
    expect(customer.doc.querySelector('main [data-provider-note]')).toBeNull();
  });

  it('privacy notice says what is collected, who reads it (including AI tools), no public use, full deletion, and retention to come', async () => {
    const { doc } = boot();
    await waitForHeading(doc, 'Help us test the onService app');
    const notice = Array.from(doc.querySelectorAll('main [data-privacy="notice"] li')).map(li => li.textContent).join(' ');
    expect(notice).toContain('your answers, your screenshots, and the name and contact details you choose to give us');
    expect(notice).toContain('(phone model, system and browser versions, screen size)');
    expect(notice).toContain('We use the connection address only to stop abuse.');
    expect(notice).toContain('the onService team. AI tools working for onService help us sort and summarise what you send.');
    expect(notice).toContain('Nothing you send is shown publicly or sold.');
    expect(notice).toContain('ask the person who invited you to have everything you sent deleted. It will be deleted completely.');
    expect(notice).toContain('We will tell you how long we keep it before the full test starts.');
    expect(notice).not.toContain('Only the onService team');
  });

  it('sends the app version from ?app= with a problem report, and remembers it as the session version', async () => {
    const { doc, calls, win } = boot({
      url: 'https://app.onservice.ph/feedback?report=1&screen=%2Fcustomer%2Fhome&app=1.0.2',
      storage: sessionWithVersion('1.0.1'),
    });
    await waitForHeading(doc, 'Report a problem');
    fillProblem(doc, win);
    saveButton(doc).click();
    await waitForHeading(doc, 'Saved. Thank you!');
    expect(lastEntryBody(calls)).toEqual(expect.objectContaining({ kind: 'problem', appVersion: '1.0.2', screenRoute: '/customer/home' }));
    expect(JSON.parse(win.localStorage.getItem('osfb2:session')).appVersion).toBe('1.0.2');
  });

  it("sends the session's app version with a problem report when the page is opened without ?app=", async () => {
    const { doc, calls, win } = boot({ storage: sessionWithVersion('1.0.1') });
    await waitForHeading(doc, 'Your test');
    await openProblemForm(doc);
    fillProblem(doc, win);
    saveButton(doc).click();
    await waitForHeading(doc, 'Saved. Thank you!');
    expect(lastEntryBody(calls).appVersion).toBe('1.0.1');
  });

  it('locks the form while a save is on its way: a screenshot pasted then is refused, not silently lost', async () => {
    let finishSave: (r: { status: number; body: unknown }) => void = () => undefined;
    const { doc, calls, win } = boot({
      storage: sessionStorageSeed(),
      handler: url => (url.endsWith('/entries') ? new Promise(resolve => { finishSave = resolve; }) : undefined),
    });
    await waitForHeading(doc, 'Your test');
    await openProblemForm(doc);
    fillProblem(doc, win);
    saveButton(doc).click();
    await waitFor(() => entryCalls(calls).length === 1, 'save sent');

    const happened = fieldByLabel(doc, STUDY.problemQuestions[1].label) as HTMLTextAreaElement;
    expect(happened.disabled).toBe(true);
    expect(choiceInput(doc, 'severity', STUDY.severities[1].label).disabled).toBe(true);
    expect(doc.querySelector<HTMLInputElement>('main input[type="file"]')!.disabled).toBe(true);
    expect((fieldByLabel(doc, 'Which screen was it?') as HTMLSelectElement).disabled).toBe(true);
    expect(saveButton(doc).textContent).toBe('Saving...');

    pasteImage(win, doc.body, new win.File(['png bytes'], 'late.png', { type: 'image/png' }));
    await tick();
    expect(calls.filter(c => c.url.endsWith('/uploads'))).toHaveLength(0);
    expect(doc.querySelectorAll('.chip')).toHaveLength(0);
    expect(doc.querySelector('main .shot-note')?.textContent)
      .toBe('Please wait until saving has finished, then add that screenshot again.');

    finishSave({ status: 201, body: { success: true, data: { entryId: 'e1' } } });
    await waitForHeading(doc, 'Saved. Thank you!');
    expect(lastEntryBody(calls).screenshots).toEqual([]);
    expect(win.localStorage.getItem('osfb2:draft:problem')).toBeNull();
  });

  it('flags restored screenshots older than 23 hours as "Please add this again" and leaves them out of the save', async () => {
    const OLD = '0ld00000-bbbb-4ccc-8ddd-eeeeeeeeeeee.png';
    const LEGACY = '1e9ac000-bbbb-4ccc-8ddd-eeeeeeeeeeee.png';
    const now = Date.now();
    const { doc, calls } = boot({
      storage: {
        ...sessionStorageSeed(),
        'osfb2:draft:mission:c_aircon': JSON.stringify({
          fields: { outcome: STUDY.missionOutcomes[0].key, seq: '6' },
          shots: [
            { filename: OLD, at: now - 24 * 60 * 60 * 1000 },
            { filename: SHOT_NAME, at: now - 60 * 60 * 1000 },
            LEGACY, // no upload time known: treated as expired
          ],
        }),
      },
    });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Aircon cleaning');
    const chips = Array.from(doc.querySelectorAll('main .chip'));
    expect(chips).toHaveLength(3);
    expect(chips[0]!.classList.contains('failed')).toBe(true);
    expect(chips[0]!.getAttribute('data-status')).toBe('expired');
    expect(chips[0]!.querySelector('.chip-text')?.textContent).toContain('Please add this again');
    expect(chips[1]!.querySelector('.chip-text')?.textContent).toBe('Screenshot 2 added');
    expect(chips[1]!.classList.contains('failed')).toBe(false);
    expect(chips[2]!.querySelector('.chip-text')?.textContent).toContain('Please add this again');

    saveButton(doc).click();
    await waitForHeading(doc, 'Your test');
    expect(lastEntryBody(calls).screenshots).toEqual([SHOT_NAME]);
  });

  it('never expires a screenshot that was already saved with a mission, so saving the mission again keeps it', async () => {
    const now = Date.now();
    const { doc, calls, win } = boot({
      storage: {
        ...sessionStorageSeed(),
        'osfb2:draft:mission:c_aircon': JSON.stringify({
          fields: { outcome: STUDY.missionOutcomes[0].key, seq: '6' },
          shots: [{ filename: SHOT_NAME, at: now - 60 * 60 * 1000 }],
        }),
      },
    });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Aircon cleaning');
    saveButton(doc).click();
    await waitForHeading(doc, 'Your test');
    expect(lastEntryBody(calls).screenshots).toEqual([SHOT_NAME]);
    // The saved draft now records that the screenshot is kept by the server.
    const draft = JSON.parse(win.localStorage.getItem('osfb2:draft:mission:c_aircon') ?? '{}');
    expect(draft.shots).toEqual([{ filename: SHOT_NAME, at: now - 60 * 60 * 1000, saved: true }]);

    // A day and more later, the tester reopens the mission to change an answer.
    win.localStorage.setItem('osfb2:draft:mission:c_aircon', JSON.stringify({
      ...draft, shots: [{ filename: SHOT_NAME, at: now - 30 * 60 * 60 * 1000, saved: true }],
    }));
    const stored: Record<string, string> = {};
    for (let i = 0; i < win.localStorage.length; i += 1) {
      const key = win.localStorage.key(i)!;
      stored[key] = win.localStorage.getItem(key)!;
    }
    const later = boot({ storage: stored });
    await waitForHeading(later.doc, 'Your test');
    await goToTask(later.doc, 'Aircon cleaning');
    const chip = later.doc.querySelector('main .chip')!;
    expect(chip.querySelector('.chip-text')?.textContent).toBe('Screenshot 1 added');
    expect(chip.classList.contains('failed')).toBe(false);
    saveButton(later.doc).click();
    await waitForHeading(later.doc, 'Your test');
    expect(lastEntryBody(later.calls).screenshots).toEqual([SHOT_NAME]);
  });

  it('always marks the screen picker as optional, even without a screen noted from the app', async () => {
    const { doc } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    await openProblemForm(doc);
    expect(doc.querySelector('[data-noted-route]')).toBeNull();
    const label = Array.from(doc.querySelectorAll('main label[for]'))
      .find(l => (l.textContent ?? '').startsWith('Which screen was it?'))!;
    expect(label.textContent).toBe('Which screen was it? (optional)');
  });

  it('forgets the About-you draft (name and contact) once the session is created', async () => {
    const { doc, win } = boot();
    await onboard(doc, 'Customer', () => {
      type(win, fieldByLabel(doc, 'Your name') as HTMLInputElement, 'Maria');
      type(win, fieldByLabel(doc, 'Email or mobile number') as HTMLInputElement, 'maria@example.com');
      expect(JSON.parse(win.localStorage.getItem('osfb2:draft:about')).fields.testerContact).toBe('maria@example.com');
    });
    await waitForHeading(doc, 'Your test');
    expect(win.localStorage.getItem('osfb2:draft:about')).toBeNull();
  });

  it('draws no focus outline on headings the script focuses, but keeps it on controls', async () => {
    const { doc, win } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    const h1 = doc.querySelector('main h1')!;
    expect(doc.activeElement).toBe(h1);
    expect(win.getComputedStyle(h1).outline).not.toContain('3px');
    const link = doc.querySelector('main a.task') as any;
    link.focus();
    expect(win.getComputedStyle(link).outline).toContain('3px solid');
  });

  it('spaces choices, the 1-7 scale and task pills with margins, so old Chrome without flex gap keeps the spacing', async () => {
    const { doc, win } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    expect(win.getComputedStyle(doc.querySelector('main .task .pill')!).marginLeft).toBe('12px');
    await goToTask(doc, 'Aircon cleaning');
    const scaleChoices = doc.querySelectorAll('main .scale .choice');
    expect(win.getComputedStyle(scaleChoices[0]!).marginLeft).toBe('0px');
    expect(win.getComputedStyle(scaleChoices[1]!).marginLeft).toBe('6px');
    const outcomeInput = choiceInput(doc, 'outcome', STUDY.missionOutcomes[0].label);
    expect(win.getComputedStyle(outcomeInput).marginRight).toBe('10px');
  });

  it('price message is a polite live region, rewritten only when the message changes', async () => {
    const { doc, win } = boot({ storage: sessionStorageSeed() });
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Wrap-up');
    const aircon = STUDY.prices.services[0];
    const message = `For "${aircon.name}", each price should be the same or higher than the one before it.`;
    const errEl = doc.querySelector(`[data-price-error="${aircon.key}"]`)!;
    expect(errEl.getAttribute('role')).toBeNull();
    expect(errEl.getAttribute('aria-live')).toBe('polite');
    const priceInput = (pointKey: string) => doc.querySelector<HTMLInputElement>(`input[name="p:${aircon.key}:${pointKey}"]`)!;
    type(win, priceInput('too_cheap'), '500');
    type(win, priceInput('bargain'), '300');
    expect(errEl.textContent).toBe(message);

    const changes: unknown[] = [];
    const observer = new win.MutationObserver((list: unknown[]) => { changes.push(...list); });
    observer.observe(errEl, { childList: true, characterData: true, subtree: true });
    type(win, priceInput('bargain'), '30'); // still lower than 500: same message
    type(win, priceInput('bargain'), '3');
    await tick();
    expect(changes).toHaveLength(0);
    expect(errEl.textContent).toBe(message);
    type(win, priceInput('bargain'), '600');
    await tick();
    expect(changes.length).toBeGreaterThan(0);
    expect(errEl.textContent).toBe('');
    observer.disconnect();
  });

  it('does not claim to remember the tester when the browser blocks storage', async () => {
    const { doc, win } = boot({ blockStorage: true });
    await onboard(doc, 'Customer');
    await waitForHeading(doc, 'Your test');
    await goToTask(doc, 'Wrap-up');
    fillWrapup(doc, win);
    saveButton(doc).click();
    await waitForHeading(doc, 'Thank you!');
    expect(doc.querySelector('[data-remembered]')?.getAttribute('data-remembered')).toBe('no');
    expect(shown(doc)).not.toContain('It remembers you on this phone or computer.');
    expect(shown(doc)).toContain('if you close it you will start a new test');
  });
});
