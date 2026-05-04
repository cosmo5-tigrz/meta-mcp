import { createMcpHandler } from "@vercel/mcp-adapter";
import { z } from "zod";

const handler = createMcpHandler(
  (server) => {
    server.tool(
      "health_check",
      "Check server health",
      {},
      async () => ({
        content: [{ type: "text", text: JSON.stringify({ status: "ok", timestamp: new Date().toISOString() }) }],
      })
    );
  },
  {},
  { basePath: "/api", maxDuration: 60 }
);

export default handler;
