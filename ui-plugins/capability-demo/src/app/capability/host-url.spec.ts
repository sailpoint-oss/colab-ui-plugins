import { buildMySailPointUrl } from './host-url';

describe('buildMySailPointUrl', () => {
  it('returns origin plus MySailPoint path for a valid https route', () => {
    expect(buildMySailPointUrl('https://acme.identitynow.com/plugins/example?x=1')).toBe(
      'https://acme.identitynow.com/ui/d/mysailpoint',
    );
  });

  it('returns null for missing or invalid routes', () => {
    expect(buildMySailPointUrl(null)).toBeNull();
    expect(buildMySailPointUrl(undefined)).toBeNull();
    expect(buildMySailPointUrl('')).toBeNull();
    expect(buildMySailPointUrl('not-a-url')).toBeNull();
  });

  it('returns null for non-https origins', () => {
    expect(buildMySailPointUrl('http://localhost:4200/')).toBeNull();
  });
});
