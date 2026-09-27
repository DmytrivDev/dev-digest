/**
 * Test harness: a real MCP `Client` wired to `createServer` over
 * `InMemoryTransport.createLinkedPair()` — no stdio, no network (D8's W5 note).
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type ServerDeps } from '../src/server.js';

export async function connectedClient(deps: ServerDeps): Promise<{ client: Client; close: () => Promise<void> }> {
  const server = createServer(deps);
  const client = new Client({ name: 'test-client', version: '0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}
