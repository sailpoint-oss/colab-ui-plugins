import { globeLabelText } from './label-text';

describe('globeLabelText', () => {
  it('strips accents from the city names in the demo gazetteer', () => {
    expect(globeLabelText('San José')).toBe('San Jose');
    expect(globeLabelText('Montréal')).toBe('Montreal');
    expect(globeLabelText('Köln')).toBe('Koln');
    expect(globeLabelText('Bogotá')).toBe('Bogota');
    expect(globeLabelText('Brasília')).toBe('Brasilia');
    expect(globeLabelText('Santiago de Querétaro')).toBe('Santiago de Queretaro');
  });

  it('leaves unaccented names untouched', () => {
    expect(globeLabelText('Austin')).toBe('Austin');
    expect(globeLabelText('Salt Lake City')).toBe('Salt Lake City');
    expect(globeLabelText('Unknown')).toBe('Unknown');
  });

  it('emits only glyphs the bundled typeface can render for Latin names', () => {
    const names = ['San José', 'Montréal', 'Köln', 'Bogotá', 'Brasília', 'Santiago de Querétaro'];

    for (const name of names) {
      const outOfRange = [...globeLabelText(name)].filter((char) => char.codePointAt(0)! > 127);
      expect(outOfRange).toEqual([]);
    }
  });

  it('preserves case and interior punctuation', () => {
    expect(globeLabelText("Val-d'Or")).toBe("Val-d'Or");
    expect(globeLabelText('ÁÉÍÓÚ')).toBe('AEIOU');
  });
});
