import { buildInteractiveProcessUrl } from './interactive-process-link';

describe('buildInteractiveProcessUrl', () => {
  const route = 'https://acme.identitynow.com/ui/plugin/workflow-launcher-demo';

  it('builds a Launchpad interactive process URL from the page route origin', () => {
    expect(buildInteractiveProcessUrl(route, '01M28MF4E05GCY7CW20HAAV681')).toBe(
      'https://acme.identitynow.com/ui/d/launchpad/interactive-processes/01M28MF4E05GCY7CW20HAAV681',
    );
  });

  it('returns null when the context or process id is missing', () => {
    expect(buildInteractiveProcessUrl(null, '01M28MF4E05GCY7CW20HAAV681')).toBeNull();
    expect(buildInteractiveProcessUrl(route, '')).toBeNull();
  });

  it('returns null when the page route is not a URL', () => {
    expect(buildInteractiveProcessUrl('/ui/plugin/demo', 'abc')).toBeNull();
  });
});
