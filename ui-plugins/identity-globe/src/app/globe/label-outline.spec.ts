import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial } from 'three';

import {
  MOON_LANDMARK_OUTLINE_Z,
  TEXT_OUTLINE_WIDTH,
  disposeLabelOutline,
  setLabelOutlineVisible,
  syncLabelOutline,
} from './label-outline';

function letters(height: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 4, 0, 0, 0, height, 0], 3));
  return geometry;
}

function cityLabel(): { group: Group; dot: Mesh; text: Mesh } {
  const fill = new MeshLambertMaterial();
  const dot = new Mesh(new BufferGeometry(), fill);
  const text = new Mesh(letters(2), fill);
  text.add(new Mesh());
  const group = new Group();
  group.add(dot);
  group.add(text);
  return { group, dot, text };
}

function rims(parent: Mesh): Mesh[] {
  return parent.children.filter((child) => child.name === 'city-text-outline') as Mesh[];
}

describe('syncLabelOutline', () => {
  it('rings the name with nudged copies of the same letters behind it, and leaves the dot alone', () => {
    const { group, dot, text } = cityLabel();

    syncLabelOutline(group, new MeshLambertMaterial(), true);

    expect(dot.children).toHaveLength(0);
    const copies = rims(text);
    expect(copies).toHaveLength(8);
    const width = 2 * TEXT_OUTLINE_WIDTH;
    for (const copy of copies) {
      expect(copy.geometry).toBe(text.geometry);
      expect(copy.visible).toBe(true);
      expect(Math.hypot(copy.position.x, copy.position.y)).toBeCloseTo(width);
      expect(copy.position.z).toBeLessThan(0);
      expect(copy.position.z).toBeGreaterThan(-0.02);
    }
  });

  it('drops the rim further behind a landing name that does not grow', () => {
    const { group, text } = cityLabel();

    syncLabelOutline(group, new MeshLambertMaterial(), true, MOON_LANDMARK_OUTLINE_Z);

    expect(rims(text).every((copy) => copy.position.z === MOON_LANDMARK_OUTLINE_Z)).toBe(true);
  });

  it('builds the rim hidden for a city that is not hovered', () => {
    const { group, text } = cityLabel();

    syncLabelOutline(group, new MeshLambertMaterial(), false);

    expect(rims(text).every((copy) => !copy.visible)).toBe(true);
  });

  it('follows the letters when globe.gl rebuilds them', () => {
    const { group, text } = cityLabel();
    const material = new MeshLambertMaterial();
    syncLabelOutline(group, material, false);

    text.geometry = letters(4);
    syncLabelOutline(group, material, false);

    const copies = rims(text);
    expect(copies).toHaveLength(8);
    expect(copies.every((copy) => copy.geometry === text.geometry)).toBe(true);
    expect(Math.hypot(copies[0].position.x, copies[0].position.y)).toBeCloseTo(4 * TEXT_OUTLINE_WIDTH);
  });

  it('leaves a label alone until it has a name', () => {
    const group = new Group();
    group.add(new Mesh());
    expect(() => syncLabelOutline(group, new MeshLambertMaterial(), true)).not.toThrow();
    expect(group.children[0].children).toHaveLength(0);
  });
});

describe('setLabelOutlineVisible', () => {
  it('shows and hides the rim on hover', () => {
    const { group, text } = cityLabel();
    syncLabelOutline(group, new MeshLambertMaterial(), false);

    setLabelOutlineVisible(group, true);
    expect(rims(text).every((copy) => copy.visible)).toBe(true);

    setLabelOutlineVisible(group, false);
    expect(rims(text).every((copy) => !copy.visible)).toBe(true);
  });
});

describe('disposeLabelOutline', () => {
  it('removes the rim without disposing globe.gl geometry', () => {
    const { group, text } = cityLabel();
    syncLabelOutline(group, new MeshLambertMaterial(), true);
    const disposeLetters = vi.spyOn(text.geometry, 'dispose');

    disposeLabelOutline(group);

    expect(rims(text)).toHaveLength(0);
    expect(text.children).toHaveLength(1);
    expect(disposeLetters).not.toHaveBeenCalled();
  });
});
