import { stopMediaStream } from './media';

describe('stopMediaStream', () => {
  it('stops every track so readyState is ended', () => {
    const track = {
      stop: vi.fn(function (this: { readyState: string }) {
        this.readyState = 'ended';
      }),
      readyState: 'live',
    };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;

    stopMediaStream(stream);

    expect(track.stop).toHaveBeenCalledOnce();
    expect(track.readyState).toBe('ended');
  });
});
