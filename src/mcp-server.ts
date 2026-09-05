import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

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

  // 2. Register the 10 MCP Tool Schemas
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        { name: 'create_post', description: 'Create a new blog draft', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['title', 'content'] } },
        { name: 'update_post', description: 'Update an existing post', inputSchema: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, content: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['id'] } },
        { name: 'delete_post', description: 'Delete a post', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
        { name: 'list_posts', description: 'List posts by status', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'published', 'scheduled'] }, limit: { type: 'number' } }, required: ['status'] } },
        { name: 'get_post', description: 'Get full content of a post', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
        { name: 'publish_post', description: 'Publish a draft', inputSchema: { type: 'object', properties: { id: { type: 'string' }, confirm_publish: { type: 'boolean' } }, required: ['id', 'confirm_publish'] } },
        { name: 'schedule_post', description: 'Schedule a post for the future', inputSchema: { type: 'object', properties: { id: { type: 'string' }, publish_at: { type: 'string' } }, required: ['id', 'publish_at'] } },
        { name: 'unpublish_post', description: 'Revert a post to draft', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
        { name: 'manage_seo', description: 'Manage SEO meta tags', inputSchema: { type: 'object', properties: { id: { type: 'string' }, meta_title: { type: 'string' }, meta_description: { type: 'string' }, slug: { type: 'string' } }, required: ['id'] } },
        { name: 'get_analytics', description: 'Get view analytics', inputSchema: { type: 'object', properties: { post_id: { type: 'string' }, range: { type: 'string', enum: ['7d', '30d', 'all'] } }, required: ['range'] } }
      ]
    };
  });

  // 3. Register Tool Execution Handlers (with publish safety check)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const typedArgs = args as Record<string, any>;

    // PRD Safety Rule: Explicit confirmation before publishing live
    if (name === 'publish_post') {
      if (typedArgs.confirm_publish !== true) {
        return {
          content: [{ 
            type: "text", 
            text: `SAFETY WARNING: You are about to publish post ID ${typedArgs.id} to the live public web. To proceed, call this tool again with 'confirm_publish: true'.` 
          }]
        };
      }
    }

    // Generic handler response for all other tool calls (to be connected with Person 1's logic later)
    return {
      content: [
        {
          type: "text",
          text: `Tool '${name}' executed successfully for user ${user.id}!`
        }
      ]
    };
  });

  const transport = new SSEServerTransport('/mcp/messages', res);
  await server.connect(transport);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});

export { app };
