import type { Material, Mesh, Object3D } from 'three';

/** Dark rim behind a hovered city's name. Shows on ocean and on clouds. */
export const LABEL_OUTLINE_COLOR = '#07141c';

/** The name's rim is this fraction of the letter height. */
export const TEXT_OUTLINE_WIDTH = 0.09;

const TEXT_OUTLINE = 'city-text-outline';

/**
 * A scaled copy of a whole word drifts off the letters at each end, so the
 * name is ringed by copies nudged in eight directions instead.
 */
const TEXT_DIRECTIONS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * A hair toward the globe, in the label's local space. Zero leaves the rim
 * coplanar with the name, and the depth fight shows up as stripes along the
 * limb. The hover scale multiplies this, so it stays much smaller than the
 * old gap that let neighboring cities cut through the rim.
 */
const OUTLINE_Z = -0.008;

/**
 * Moon names sit on a bright surface, and the Earth gap leaves the rim
 * blending into the letters. Hover on the Moon barely scales the label, so
 * this larger gap stays behind the name.
 */
export const MOON_LANDMARK_OUTLINE_Z = -0.07;

/**
 * Add or refresh the dark copies behind one city's name. Geometry is shared
 * with globe.gl's text mesh, which owns and disposes it.
 */
export function syncLabelOutline(
  group: Object3D,
  material: Material,
  visible: boolean,
  outlineZ = OUTLINE_Z,
): void {
  const text = meshChild(group, 1);
  if (!text?.geometry) {
    return;
  }

  let rims = outlines(text);
  if (!rims.length) {
    rims = TEXT_DIRECTIONS.map(() => outlineMesh(text, material, outlineZ));
  }
  for (const rim of rims) {
    rim.visible = visible;
  }

  const geometry = text.geometry;
  if (text.userData[TEXT_OUTLINE] === geometry) {
    return;
  }
  text.userData[TEXT_OUTLINE] = geometry;
  geometry.boundingBox ?? geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const height = box ? box.max.y - box.min.y : 0;
  const width = height * TEXT_OUTLINE_WIDTH;
  rims.forEach((rim, index) => {
    const [x, y] = TEXT_DIRECTIONS[index];
    rim.geometry = geometry;
    rim.position.set(x * width, y * width, outlineZ);
  });
}

/** Show or hide an existing rim without rebuilding it. */
export function setLabelOutlineVisible(group: Object3D, visible: boolean): void {
  const text = meshChild(group, 1);
  for (const rim of text ? outlines(text) : []) {
    rim.visible = visible;
  }
}

/** Detach the rim meshes. Their geometry is globe.gl's, so it is not disposed here. */
export function disposeLabelOutline(group: Object3D): void {
  const text = meshChild(group, 1);
  if (!text) {
    return;
  }
  for (const rim of outlines(text)) {
    text.remove(rim);
  }
  delete text.userData[TEXT_OUTLINE];
}

function outlineMesh(parent: Mesh, material: Material, outlineZ: number): Mesh {
  const rim = parent.clone(false);
  rim.geometry = parent.geometry;
  rim.material = material;
  rim.name = TEXT_OUTLINE;
  rim.position.z = outlineZ;
  parent.add(rim);
  return rim;
}

function meshChild(group: Object3D, index: number): Mesh | null {
  const child = group.children[index] as Mesh | undefined;
  return child?.isMesh ? child : null;
}

function outlines(parent: Object3D): Mesh[] {
  return parent.children.filter((child): child is Mesh => child.name === TEXT_OUTLINE && (child as Mesh).isMesh);
}
