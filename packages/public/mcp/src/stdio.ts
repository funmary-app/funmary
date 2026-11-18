// 手元で動く MCP サーバー (stdio)。Claude Desktop などが、子のプロセスとして起動する。
// 公開 API の URL と個人用のアクセストークンから、トークンの範囲に合うツールだけを出す。
import { createFunmaryClient, FunmaryApiError } from '@funmary/client';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createClientData } from './client-data.ts';
import { createFunmaryMcpServer } from './server.ts';

export interface StdioOptions {
	/** Funmary のサーバーの URL (既定値は持たない) */
	readonly baseURL: string;
	/** 設定画面で発行した、個人用のアクセストークン */
	readonly token: string;
	readonly version?: string;
}

/** サーバーを起動して、標準入出力に結ぶ。トークンが使えなければ、理由の分かる文で、例外にする */
export async function runStdioServer(options: StdioOptions): Promise<void> {
	const client = createFunmaryClient({ baseURL: options.baseURL, token: options.token });
	let scopes: readonly string[];
	try {
		scopes = (await client.me()).scopes;
	} catch (error) {
		if (error instanceof FunmaryApiError && error.status === 401) {
			throw new Error('アクセストークンが使えません。設定画面で発行し直してください', {
				cause: error,
			});
		}
		throw error;
	}
	const server = createFunmaryMcpServer({
		data: createClientData(client),
		scopes,
		...(options.version ? { version: options.version } : {}),
	});
	await server.connect(new StdioServerTransport());
}
