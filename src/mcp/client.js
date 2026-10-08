import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
import { AppError } from '../utils/core.js';
const tools = {
  launch_campaign: 'create_campaign',
  pause_campaign: 'pause_campaign',
  resume_campaign: 'resume_campaign',
  update_budget: 'update_budget',
  update_targeting: 'update_ad_set',
  replace_creative: 'update_ad',
};
export async function executeViaMcp(approval, config) {
  const client = new Client({ name: 'adpilot-api', version: '1.0.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('./server.js', import.meta.url))],
    env: {
      ...process.env,
      MCP_API_URL: `http://127.0.0.1:${config.port}`,
      MCP_SERVICE_KEY: config.serviceKey,
    },
    stderr: 'pipe',
  });
  try {
    await client.connect(transport);
    const result = await client.callTool(
      { name: tools[approval.action], arguments: { approvalId: approval.id } },
      undefined,
      { timeout: 180000 },
    );
    const value = JSON.parse(result.content.find((c) => c.type === 'text')?.text || '{}');
    if (result.isError)
      throw new AppError(
        value.status || 502,
        value.code || 'MCP_FAILED',
        value.message || 'MCP execution failed',
        value.details,
      );
    return value;
  } finally {
    await client.close();
    await transport.close();
  }
}
