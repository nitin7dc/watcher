import { decideLease } from './leader';

describe('decideLease', () => {
  const now = 10_000;

  it('takes the lease when nobody holds it', () => {
    expect(decideLease(null, 'me', now, 5_000)).toEqual({ leader: true, write: { id: 'me', until: 15_000 } });
  });

  it('renews its own lease', () => {
    expect(decideLease({ id: 'me', until: now + 1 }, 'me', now, 5_000).write?.until).toBe(15_000);
  });

  it('defers to another live tab', () => {
    expect(decideLease({ id: 'other', until: now + 1 }, 'me', now, 5_000)).toEqual({ leader: false });
  });

  it('takes over when the other tab stopped renewing', () => {
    expect(decideLease({ id: 'other', until: now }, 'me', now, 5_000).leader).toBe(true);
  });
});
