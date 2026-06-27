#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { compile, version as purusVersion } from "purus";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import { execFileSync } from "child_process";

const server = new Server(
  { name: "purus-mcp", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "compile",
        description: "Purus コードを JavaScript にコンパイルします",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "コンパイルする Purus ソースコード",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "run",
        description: "Purus コードをコンパイルして実行し、出力を返します",
        inputSchema: {
          type: "object",
          properties: {
            code: {
              type: "string",
              description: "実行する Purus ソースコード",
            },
            timeout: {
              type: "number",
              description: "タイムアウト（ミリ秒）。デフォルト: 5000",
            },
          },
          required: ["code"],
        },
      },
      {
        name: "version",
        description: "Purus のバージョンを返します",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === "compile") {
    const code = args?.code as string;
    try {
      const js = compile(code, { header: false });
      return {
        content: [{ type: "text", text: js }],
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    }
  }

  if (name === "run") {
    const code = args?.code as string;
    const timeout = Math.min(
      typeof args?.timeout === "number" ? args.timeout : 5000,
      10000
    );
    const tmpFile = path.join(os.tmpdir(), `purus-run-${Date.now()}.js`);
    try {
      const js = compile(code, { header: false, type: "commonjs" });
      fs.writeFileSync(tmpFile, js, "utf-8");
      const output = execFileSync(process.execPath, [tmpFile], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
        timeout,
      });
      return {
        content: [{ type: "text", text: output }],
      };
    } catch (e) {
      let message: string;
      if (e instanceof Error) {
        const execError = e as NodeJS.ErrnoException & { stderr?: string };
        message = execError.stderr
          ? `${e.message}\n${execError.stderr}`
          : e.message;
      } else {
        message = String(e);
      }
      return {
        content: [{ type: "text", text: message }],
        isError: true,
      };
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // 無視
      }
    }
  }

  if (name === "version") {
    return {
      content: [{ type: "text", text: `purus v${purusVersion}` }],
    };
  }

  return {
    content: [{ type: "text", text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("purus-mcp server started");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
