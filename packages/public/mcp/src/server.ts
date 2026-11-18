// Web 版とローカル版で共通の MCP ツールを登録する。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { FunmaryData } from './data.ts';
import {
	failureMessage,
	TOOLS,
	type ToolContext,
	type ToolDefinition,
	type ToolOutput,
} from './tools.ts';

/** registerTool の型は、引数の形ごとに細かく分かれているので、ここで使う分だけの口にそろえる */
interface RegistrableServer {
	registerTool(
		name: string,
		config: { description: string; inputSchema?: unknown; annotations?: object },
		handler: (args: unknown) => Promise<unknown>,
	): unknown;
}

export interface RegisterToolsOptions {
	readonly data: FunmaryData;
	/** トークンに許された範囲。この範囲のツールだけを出す */
	readonly scopes: readonly string[];
	/** 範囲があっても、出さないツールを決める (例: バスの機能を使わないサーバーで、バスのツールを出さない) */
	readonly enabled?: (tool: ToolDefinition) => boolean;
	readonly now?: () => Date;
}

function toResult(output: ToolOutput) {
	if (output.kind === 'error') {
		return { isError: true, content: [{ type: 'text' as const, text: output.message }] };
	}
	// MCP の structuredContent はオブジェクトを要求する。ツールは配列をオブジェクトのプロパティとして返す
	return {
		content: [{ type: 'text' as const, text: JSON.stringify(output.value) }],
		structuredContent: output.value as Record<string, unknown>,
	};
}

/** 範囲に合うツールを、サーバーに登録する。登録したツールの名前を返す */
export function registerTools(server: McpServer, options: RegisterToolsOptions): string[] {
	const context: ToolContext = { data: options.data, now: options.now ?? (() => new Date()) };
	const registered: string[] = [];
	for (const tool of TOOLS) {
		if (!options.scopes.includes(tool.scope)) continue;
		if (options.enabled && !options.enabled(tool)) continue;
		(server as unknown as RegistrableServer).registerTool(
			tool.name,
			{
				description: tool.description,
				...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
				annotations: tool.annotations,
			},
			async (args) => {
				try {
					return toResult(await tool.run(context, (args ?? {}) as never));
				} catch (caught) {
					const message = failureMessage(caught);
					if (message === null) throw caught;
					return toResult({ kind: 'error', message });
				}
			},
		);
		registered.push(tool.name);
	}
	return registered;
}

export interface CreateMcpServerOptions extends RegisterToolsOptions {
	readonly name?: string;
	readonly version?: string;
	readonly icons?: readonly {
		src: string;
		mimeType?: string;
		sizes?: string[];
		theme?: 'light' | 'dark';
	}[];
}

/** ツールを登録した MCP サーバーを作る */
export function createFunmaryMcpServer(options: CreateMcpServerOptions): McpServer {
	const server = new McpServer({
		name: options.name ?? 'funmary',
		version: options.version ?? '1',
		...(options.icons ? { icons: [...options.icons] } : {}),
	});
	registerTools(server, options);
	return server;
}
