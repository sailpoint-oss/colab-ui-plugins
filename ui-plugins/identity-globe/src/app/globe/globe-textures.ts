/** Images the globe can display. Startup downloads them alongside identity Search, then mounts the globe. */
export const EARTH_DAY_TEXTURE = 'assets/globe/earth-blue-marble.webp';
export const EARTH_TOPOLOGY_TEXTURE = 'assets/globe/earth-topology.webp';
export const NIGHT_SKY_TEXTURE = 'assets/globe/night-sky.webp';
export const NIGHT_SKY_MILKY_WAY_TEXTURE = 'assets/globe/night-sky-milky-way.webp';
export const EARTH_NIGHT_TEXTURE = 'assets/globe/earth-night.webp';
export const CLOUDS_TEXTURE = 'assets/globe/clouds.webp';
export const MOON_SURFACE_TEXTURE = 'assets/moon/lunar-surface.webp';
export const MOON_BUMP_TEXTURE = 'assets/moon/lunar-bumpmap.webp';

export const GLOBE_TEXTURE_PATHS = [
  EARTH_DAY_TEXTURE,
  EARTH_TOPOLOGY_TEXTURE,
  NIGHT_SKY_TEXTURE,
  NIGHT_SKY_MILKY_WAY_TEXTURE,
  EARTH_NIGHT_TEXTURE,
  CLOUDS_TEXTURE,
  MOON_SURFACE_TEXTURE,
  MOON_BUMP_TEXTURE,
] as const;

const ASSET_LOAD_ERROR = 'Required Identity Globe assets could not be loaded.';

/**
 * Download every globe image at once and hold each decoded bitmap in three.js's
 * image cache. TextureLoader looks that cache up under `image:${url}` and skips
 * the network when the image is already complete.
 *
 * `onProgress` runs as each image finishes, while the others are still loading.
 * Images are loaded from their own URLs. The plugin image policy allows 'self'
 * and rejects blob: URLs, so decoding through createObjectURL fails startup.
 */
export async function preloadGlobeTextures(
  assetUrl: (path: string) => string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const total = GLOBE_TEXTURE_PATHS.length;
  let loaded = 0;
  await Promise.all(
    GLOBE_TEXTURE_PATHS.map(async (path) => {
      await preloadTexture(assetUrl(path));
      loaded += 1;
      onProgress?.(loaded, total);
    }),
  );
}

async function preloadTexture(url: string): Promise<void> {
  if (!canDecodeImages()) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(ASSET_LOAD_ERROR);
    }
    await response.blob();
    return;
  }

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(ASSET_LOAD_ERROR));
    image.src = url;
  });
  const { Cache } = await import('three');
  Cache.enabled = true;
  Cache.add(`image:${url}`, image);
}

function canDecodeImages(): boolean {
  return document.createElement('canvas').getContext('2d') !== null;
}
