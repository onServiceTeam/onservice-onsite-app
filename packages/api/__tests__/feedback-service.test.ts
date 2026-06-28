// Real behavioral tests for the feedback service's pure logic: input
// validation/normalization and the Markdown/CSV export formatters. No DB is
// touched — the db module is mocked so importing the service is side-effect free.

jest.mock('../src/config/database.config', () => ({
  pool: { query: jest.fn() },
}));

import {
  validateAndNormalize,
  toMarkdown,
  toCsv,
  type FeedbackRow,
} from '../src/services/feedback.service';

function ok(body: unknown) {
  const r = validateAndNormalize(body);
  if (!r.ok) throw new Error('expected ok result, got ' + JSON.stringify(r));
  return r.value;
}

describe('validateAndNormalize', () => {
  it('treats a filled honeypot as spam and signals fake-success', () => {
    const r = validateAndNormalize({ _hp: 'http://spam', ideas: 'real text' });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.spam).toBe(true);
  });

  it('rejects a completely empty submission with a reason', () => {
    const r = validateAndNormalize({ ratings: {}, answers: {}, items: [] });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.spam).toBe(false);
    if (r.ok === false && !r.spam) expect(r.reason).toMatch(/at least one/i);
  });

  it('retains many answers without dropping (cap is above the live page field count)', () => {
    // The feedback page ships 70+ answer fields. Regression guard for the bug
    // where the answers map reused the 60-key ratings cap and silently dropped
    // overflow. 80 answers must all survive.
    const answers = Object.fromEntries(
      Array.from({ length: 80 }, (_, i) => ['k' + i, 'value ' + i]),
    );
    const r = validateAndNormalize({ answers });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const stored = (r.value.payload as { answers: Record<string, string> }).answers;
      expect(Object.keys(stored).length).toBe(80);
    }
  });

  it('accepts a minimal submission with a single answer', () => {
    const v = ok({ answers: { 'customer:best': 'the booking flow was smooth' } });
    expect((v.payload.answers as Record<string, string>)['customer:best']).toBe('the booking flow was smooth');
    expect(v.summary).toMatch(/booking flow/);
  });

  it('clamps NPS into 0..10 and rounds, or null when absent', () => {
    expect(ok({ nps: 99, ideas: 'x' }).nps).toBe(10);
    expect(ok({ nps: -5, ideas: 'x' }).nps).toBe(0);
    expect(ok({ nps: '7', ideas: 'x' }).nps).toBe(7);
    expect(ok({ ideas: 'x' }).nps).toBeNull();
  });

  it('keeps only whitelisted areas', () => {
    const v = ok({ areas: ['customer', 'hacker', 'admin'], ideas: 'x' });
    expect(v.areas).toEqual(['customer', 'admin']);
  });

  it('caps very long free text', () => {
    const huge = 'a'.repeat(50_000);
    const v = ok({ ideas: huge });
    expect((v.payload.ideas as string).length).toBe(10_000);
  });

  it('normalizes items: drops empty rows, maps unknown type to other, counts', () => {
    const v = ok({
      items: [
        { what: '', where: '', expected: '' }, // empty -> dropped
        { type: 'BUG', severity: 'Major', where: 'price screen', what: 'fee unclear' },
        { type: 'weird', what: 'odd thing' }, // unknown type preserved (lowercased)
        { what: 'no type given' }, // empty type -> 'other'
      ],
    });
    const items = v.payload.items as Array<Record<string, string>>;
    expect(items).toHaveLength(3);
    expect(v.itemCount).toBe(3);
    expect(items[0].type).toBe('bug');
    expect(items[0].severity).toBe('major');
    expect(items[1].type).toBe('weird');
    expect(items[2].type).toBe('other');
  });

  it('limits the number of items to 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => ({ what: 'item ' + i }));
    const v = ok({ items: many });
    expect(v.itemCount).toBe(50);
  });

  it('keeps only whitelisted /uploads/feedback screenshot URLs', () => {
    const v = ok({
      screenshots: [
        'https://app.onservice.ph/uploads/feedback/abc.jpg', // ok (our host)
        '/uploads/feedback/def.png', // ok (relative)
        'javascript:alert(1)', // rejected
        'https://evil.com/uploads/feedback/x.jpg', // rejected (external host)
        'https://app.onservice.ph/uploads/other/x.jpg', // rejected (not feedback)
      ],
    });
    expect(v.payload.screenshots).toEqual([
      'https://app.onservice.ph/uploads/feedback/abc.jpg',
      '/uploads/feedback/def.png',
    ]);
  });

  it('keeps per-item screenshots and counts an item that only has a screenshot', () => {
    const v = ok({
      items: [{ screenshots: ['/uploads/feedback/shot.png'] }],
    });
    expect(v.itemCount).toBe(1);
    const items = v.payload.items as Array<Record<string, unknown>>;
    expect(items[0].screenshots).toEqual(['/uploads/feedback/shot.png']);
  });

  it('summary prefers a blocker/major item over other content', () => {
    const v = ok({
      answers: { 'customer:best': 'liked it' },
      items: [{ type: 'bug', severity: 'blocker', what: 'cannot pay at checkout' }],
    });
    expect(v.summary).toMatch(/cannot pay at checkout/);
    expect(v.summary?.toLowerCase()).toContain('blocker');
  });
});

describe('toMarkdown', () => {
  const row: FeedbackRow = {
    id: 'id-1',
    createdAt: '2026-06-16T00:00:00.000Z',
    testerName: 'Maria',
    testerContact: 'maria@example.com',
    role: 'customer',
    device: 'Phone',
    areas: ['customer'],
    nps: 9,
    summary: 'fee unclear on price screen',
    itemCount: 1,
    status: 'new',
    payload: {
      ratings: { 'customer:price': '3' },
      answers: { 'customer:worst': 'the service fee confused me' },
      prices: { 'cleaning:deal': '500' },
      ideas: 'add pest control',
      items: [
        { area: 'customer', type: 'friction', severity: 'major', where: 'price screen', what: 'fee unclear', expected: 'a tooltip', repro: '', screenshot: 'fee.png' },
      ],
    },
  };

  it('renders submission details, ratings, answers, ideas, and items', () => {
    const md = toMarkdown([row]);
    expect(md).toContain('Total submissions: **1**');
    expect(md).toContain('Maria');
    expect(md).toContain('fee unclear on price screen');
    expect(md).toContain('customer:price=3');
    expect(md).toContain('the service fee confused me');
    expect(md).toContain('add pest control');
    expect(md).toContain('Where: price screen');
    expect(md).toContain('Screenshot (note): fee.png');
  });

  it('handles an empty inbox', () => {
    const md = toMarkdown([]);
    expect(md).toContain('Total submissions: **0**');
    expect(md).toContain('No submissions yet');
  });
});

describe('toCsv', () => {
  it('emits a header and escapes commas, quotes, and newlines', () => {
    const row: FeedbackRow = {
      id: 'id-2',
      createdAt: '2026-06-16T00:00:00.000Z',
      testerName: 'Jo, the "tester"',
      testerContact: null,
      role: 'provider',
      device: 'Laptop',
      areas: ['provider', 'admin'],
      nps: 7,
      summary: 'line one\nline two',
      itemCount: 0,
      status: 'new',
      payload: { ideas: 'gardening, laundry' },
    };
    const csv = toCsv([row]);
    // Assert against the whole string: the summary field itself contains a
    // newline, so splitting on '\n' would tear the quoted field apart.
    expect(csv.startsWith('id,created_at,tester_name,role,device,areas,nps,item_count,status,summary,ideas\n')).toBe(true);
    expect(csv).toContain('"Jo, the ""tester"""');
    expect(csv).toContain('provider|admin');
    expect(csv).toContain('"line one\nline two"');
    expect(csv).toContain('"gardening, laundry"');
  });
});
