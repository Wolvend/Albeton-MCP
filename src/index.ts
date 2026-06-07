#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createAbletonMcpServer } from "./server.js";

const server = createAbletonMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);
