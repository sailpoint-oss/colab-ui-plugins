/** Combining diacritical marks, stripped by {@link globeLabelText}. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * three-globe extrudes each label from a bundled typeface that carries only
 * Basic Latin and Greek glyphs, and three.js substitutes `?` for any character
 * the font is missing. Decomposing to NFD and dropping the combining marks
 * keeps accented city names legible on the globe; the tooltip still shows the
 * exact name. Letters that do not decompose (ø, ł, đ, ß) and non-Latin scripts
 * have no glyph either way and still render as `?`.
 */
export function globeLabelText(displayName: string): string {
  return displayName.normalize('NFD').replace(COMBINING_MARKS, '');
}
