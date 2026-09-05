import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';

const app = express();
app.use(express.json());

// Temporary mock function for Person 1's DB check (until Person 1 pushes their code)
async function mockGetUserByApiKey(apiKey: string) {
  if (apiKey === 'test-key-123') {
    return { id: 'user-uuid-1', email: 'mehak@example.com' };
  }
  return null;
}

// 1. SSE Connection Endpoint with API Key in URL
app.get('/mcp/:apiKey/sse', async (req, res) => {
  const { apiKey } = req.params;

  // Validate API key using Person 1's backend logic layer
  const user = await mockGetUserByApiKey(apiKey);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API Key' });
  }

  console.log(`User authenticated: ${user.email}`);

  // Initialize MCP Server instance for this session
  const server = new Server(
    { name: 'quill-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  const transport = new SSEServerTransport('/mcp/messages', res);
  await server.connect(transport);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});

export { app };
