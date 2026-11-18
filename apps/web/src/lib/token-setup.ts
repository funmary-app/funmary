// 発行したトークンを、手元の MCP とコマンドで使うための、設定の例。接続先の既定値は、npm のパッケージが持たないので、ここで、この Funmary の URL とトークンを埋めて、コピーできる形で出す。

/** 手元の MCP (@funmary/mcp、stdio) の設定。Claude Desktop などの mcpServers に、そのまま貼れる形 */
export function buildMcpConfig(origin: string, token: string): string {
	return JSON.stringify(
		{
			mcpServers: {
				funmary: {
					command: 'npx',
					args: ['-y', '@funmary/mcp'],
					env: { FUNMARY_URL: origin, FUNMARY_TOKEN: token },
				},
			},
		},
		null,
		'\t',
	);
}

/** コマンド (funmary) のログイン。トークンは、コマンドが入力を表示せずに尋ねるので、ここには含めない */
export function buildLoginCommand(origin: string): string {
	return `npx funmary login --url ${origin}`;
}
