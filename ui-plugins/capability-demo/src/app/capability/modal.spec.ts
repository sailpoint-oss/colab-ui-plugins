import { callModal, MODAL_SHOWN_MS } from './modal';

describe('callModal', () => {
  it('treats an immediate return as a blocked dialog', () => {
    let time = 0;
    const result = callModal(() => {
      time += 1;
      return false;
    }, () => time);

    expect(result.shown).toBe(false);
    expect(result.value).toBe(false);
  });

  it('treats a call that waits for the user as a shown dialog', () => {
    let time = 0;
    const result = callModal(() => {
      time += MODAL_SHOWN_MS;
      return true;
    }, () => time);

    expect(result.shown).toBe(true);
    expect(result.value).toBe(true);
  });
});
