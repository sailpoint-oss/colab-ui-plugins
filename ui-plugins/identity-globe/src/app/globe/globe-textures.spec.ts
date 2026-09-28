import { GLOBE_TEXTURE_PATHS, preloadGlobeTextures } from './globe-textures';

describe('preloadGlobeTextures', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches every globe image before resolving', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
    });
    vi.stubGlobal('fetch', fetchMock);

    await preloadGlobeTextures((path) => `https://plugin.test/${path}`);

    expect(fetchMock).toHaveBeenCalledTimes(GLOBE_TEXTURE_PATHS.length);
    for (const path of GLOBE_TEXTURE_PATHS) {
      expect(fetchMock).toHaveBeenCalledWith(`https://plugin.test/${path}`);
    }
  });

  it('starts every image together and reports each one as it finishes', async () => {
    let release: (blob: Blob) => void = () => undefined;
    const gate = new Promise<Blob>((resolve) => {
      release = resolve;
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      blob: () => gate,
    });
    vi.stubGlobal('fetch', fetchMock);
    const finished: number[] = [];

    const pending = preloadGlobeTextures(
      (path) => path,
      (loaded, total) => {
        expect(total).toBe(GLOBE_TEXTURE_PATHS.length);
        finished.push(loaded);
      },
    );

    expect(fetchMock).toHaveBeenCalledTimes(GLOBE_TEXTURE_PATHS.length);
    expect(finished).toEqual([]);

    release(new Blob());
    await pending;
    expect(finished).toEqual(GLOBE_TEXTURE_PATHS.map((_, index) => index + 1));
  });

  it('rejects when an image cannot be downloaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        blob: () => Promise.resolve(new Blob()),
      }),
    );

    await expect(preloadGlobeTextures((path) => path)).rejects.toThrow(
      'Required Identity Globe assets could not be loaded.',
    );
  });
});
