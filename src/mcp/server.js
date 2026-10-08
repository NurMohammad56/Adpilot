import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
const api = process.env.MCP_API_URL || 'http://127.0.0.1:4000';
const key = process.env.MCP_SERVICE_KEY;
if (!key) {
  process.stderr.write(
    'MCP_SERVICE_KEY is required. Launch through the API or configure a trusted MCP client.\n',
  );
  process.exit(1);
}
const server = new McpServer({ name: 'adpilot-meta', version: '1.0.0' });
async function call(endpoint, body) {
  try {
    const response = await fetch(`${api}/api/internal/mcp/${endpoint}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(175000),
    });
    const data = await response.json();
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.ok ? data : { ...data.error, status: response.status }),
        },
      ],
      isError: !response.ok,
    };
  } catch {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            code: 'MCP_UNAVAILABLE',
            message:
              'The action service is unavailable. Check the approval execution status before retrying.',
          }),
        },
      ],
      isError: true,
    };
  }
}
for (const name of [
  'create_campaign',
  'pause_campaign',
  'resume_campaign',
  'update_budget',
  'update_ad_set',
  'update_ad',
]) {
  server.registerTool(
    name,
    {
      description:
        name === 'create_campaign'
          ? 'Execute the exact human-approved campaign plan, including paused ad sets and creatives, then activate. No arbitrary parameters accepted.'
          : 'Execute one exact human-approved Meta action. Budget and authorization checks run again.',
      inputSchema: { approvalId: z.string().uuid() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    (args) => call('action', { ...args, toolName: name }),
  );
}
for (const [name, level] of [
  ['get_campaign_insights', 'campaign'],
  ['get_ad_set_insights', 'adset'],
  ['get_ad_insights', 'ad'],
]) {
  server.registerTool(
    name,
    {
      description: `Retrieve previously synchronized ${level} performance. No advertising changes.`,
      inputSchema: { campaignId: z.string().uuid() },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    (args) => call('insights', { ...args, level }),
  );
}
await server.connect(new StdioServerTransport());
