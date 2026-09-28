import { truncateClipboardText } from './clipboard';

describe('truncateClipboardText', () => {
  it('leaves short strings unchanged', () => {
    expect(truncateClipboardText('hello')).toBe('hello');
  });

  it('truncates strings longer than 2000 characters', () => {
    const input = 'a'.repeat(2500);
    const truncated = truncateClipboardText(input);
    expect(truncated.length).toBe(2000);
    expect(truncated).toBe('a'.repeat(2000));
  });
});
