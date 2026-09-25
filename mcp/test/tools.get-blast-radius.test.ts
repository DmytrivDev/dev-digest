import { describe, expect, it } from 'vitest';
import { connectedClient } from './harness.js';
import { emptyState, FakeDevDigestApi } from './fake-api.js';
import { FakeClock } from './fake-clock.js';

const WEB_URL = 'http://localhost:3000';

describe('get_blast_radius', () => {
  it('always returns an error saying it is not implemented yet', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'acme/widgets', pr: 7 } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toContain('not implemented yet');
    await close();
  });

  it('invalid args are rejected', async () => {
    const api = new FakeDevDigestApi(emptyState());
    const { client, close } = await connectedClient({
      api,
      clock: new FakeClock(),
      config: { webUrl: WEB_URL, runDeadlineMs: 120_000 },
    });
    const result = await client.callTool({ name: 'get_blast_radius', arguments: { repo: 'no-slash', pr: 7 } });
    expect(result.isError).toBe(true);
    await close();
  });
});
