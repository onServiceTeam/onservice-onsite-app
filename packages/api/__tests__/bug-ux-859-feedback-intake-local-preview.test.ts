import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';

it('Bug UX-859 — public feedback intake previews the local File without loading its private storage identifier', async () => {
  const html = readFileSync(path.resolve(__dirname, '../../..', 'legal', 'feedback.html'), 'utf8');
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ success: true, url: '/uploads/feedback/evidence.png' }),
  });
  const createObjectUrlMock = jest.fn().mockReturnValue('blob:local-selected-file');
  const revokeObjectUrlMock = jest.fn();
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    url: 'https://app.onservice.ph/feedback',
    beforeParse(window) {
      Object.defineProperty(window, 'fetch', { value: fetchMock, configurable: true });
      Object.defineProperty(window.URL, 'createObjectURL', { value: createObjectUrlMock, configurable: true });
      Object.defineProperty(window.URL, 'revokeObjectURL', { value: revokeObjectUrlMock, configurable: true });
      Object.defineProperty(window, 'scrollTo', { value: jest.fn(), configurable: true });
    },
  });

  try {
    const input = dom.window.document.querySelector<HTMLInputElement>('#issues .issue input[type="file"]');
    expect(input).not.toBeNull();
    const file = new dom.window.File(['image bytes'], 'screen.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input!.dispatchEvent(new dom.window.Event('change', { bubbles: true }));

    await new Promise((resolve) => setTimeout(resolve, 0));
    const chip = dom.window.document.querySelector<HTMLElement>('.shot[data-url]');
    const image = chip?.querySelector('img');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/feedback/upload',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(chip?.getAttribute('data-url')).toBe('/uploads/feedback/evidence.png');
    expect(image?.getAttribute('src')).toBe('blob:local-selected-file');
    expect(image?.getAttribute('src')).not.toBe('/uploads/feedback/evidence.png');

    chip?.querySelector<HTMLButtonElement>('button[aria-label="Remove"]')?.click();
    expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:local-selected-file');
  } finally {
    dom.window.close();
  }
});
