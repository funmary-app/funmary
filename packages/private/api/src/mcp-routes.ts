// 公開 API と同じ認証を使い、アクセストークンのスコープに応じた MCP ツールを公開する。
import { hasAcceptedTerms } from '@funmary/core';
import { createFunmaryMcpServer } from '@funmary/mcp';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SUPPORTED_PROTOCOL_VERSIONS } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPTransport } from '@hono/mcp';
import { Hono } from 'hono';
import { createServerData, type McpWriteOwner } from './mcp-data.ts';
import { termsRequiredMessage } from './terms-gate.ts';
import type { V1RoutesDeps } from './v1/routes.ts';

/** v1/routes.ts の V1RoutesDeps と同じ形。公開 API と MCP で、同じ依存の組み立てを使い回せるようにする */
export interface McpRoutesDeps extends V1RoutesDeps {
	/** 401 で知らせる、保護されたリソースの情報の URL。OAuth で認証するクライアントが、ここから認可サーバーを見つける */
	readonly resourceMetadataUrl?: string;
	/** 公開するオリジン。あれば、サーバーの情報にアイコン (/brand/ の画像) を載せる */
	readonly origin?: string;
}

/** クライアントが一覧に出すアイコン。ブラウザのタブと同じ画像で、ダークの画面向けのものも添える */
function serverIcons(origin: string) {
	const base = `${origin.replace(/\/$/, '')}/brand`;
	return [
		{ src: `${base}/icon-512.png`, mimeType: 'image/png', sizes: ['512x512'] },
		{ src: `${base}/icon.svg`, mimeType: 'image/svg+xml', sizes: ['any'], theme: 'light' as const },
		{
			src: `${base}/icon-dark.svg`,
			mimeType: 'image/svg+xml',
			sizes: ['any'],
			theme: 'dark' as const,
		},
	];
}

/** アクセストークンに許可された MCP ツールを登録する */
export function buildMcpServer(deps: McpRoutesDeps, owner: McpWriteOwner) {
	return createFunmaryMcpServer({
		data: createServerData(deps, owner),
		scopes: owner.scopes,
		// バスの機能を使わない設定では、範囲があっても、バスのツールを出さない
		enabled: (tool) => tool.scope !== 'read:transit' || deps.bus !== null,
		...(deps.origin ? { icons: serverIcons(deps.origin) } : {}),
	});
}

/**
 * 未同意の利用者には、同意が必要な理由と同意画面の URL を案内する MCP ツールだけを公開する。
 * HTTP のエラーにしないのは、MCP のクライアントが、接続の失敗としか表示しないことが多いため
 */
export function buildTermsRequiredMcpServer(consentUrl: string, origin?: string) {
	const message = termsRequiredMessage(consentUrl);
	const server = new McpServer(
		{
			name: 'funmary',
			version: '1',
			...(origin ? { icons: serverIcons(origin) } : {}),
		},
		{ instructions: message },
	);
	server.registerTool(
		'terms_acceptance_required',
		{ description: message, annotations: { readOnlyHint: true } },
		() => ({ isError: true, content: [{ type: 'text' as const, text: message }] }),
	);
	return server;
}

export function createMcpRoutes(deps: McpRoutesDeps): Hono {
	const app = new Hono();
	const BEARER = /^Bearer\s+(\S+)$/;
	app.all('/mcp', async (c) => {
		const match = BEARER.exec(c.req.header('Authorization') ?? '');
		const token = match?.[1];
		const now = new Date();
		const found = token ? deps.accessTokens.findOwner(token, now) : null;
		if (!found) {
			if (deps.resourceMetadataUrl) {
				c.header('WWW-Authenticate', `Bearer resource_metadata="${deps.resourceMetadataUrl}"`);
			}
			return c.json(
				{ error: 'unauthorized', message: 'Authorization: Bearer <token> が要ります' },
				401,
			);
		}
		// トランスポートは、対応していない版に 404 の例外を投げる。仕様の 400 で、対応する版を知らせて断る
		const requested = c.req.header('mcp-protocol-version');
		if (requested !== undefined && !SUPPORTED_PROTOCOL_VERSIONS.includes(requested)) {
			return c.json(
				{
					jsonrpc: '2.0',
					error: {
						code: -32000,
						message: `Bad Request: Unsupported protocol version (supported versions: ${SUPPORTED_PROTOCOL_VERSIONS.join(', ')})`,
					},
					id: null,
				},
				400,
			);
		}
		deps.accessTokens.markUsed(found.id, now);
		const waitingForTerms =
			deps.termsGate !== undefined &&
			!hasAcceptedTerms(found.termsAcceptedVersion, deps.termsGate.version);
		const server =
			waitingForTerms && deps.termsGate
				? buildTermsRequiredMcpServer(deps.termsGate.consentUrl, deps.origin)
				: buildMcpServer(deps, {
						userId: found.userId,
						scopes: found.scopes,
						tokenId: found.id,
						tokenName: found.name,
					});
		const transport = new StreamableHTTPTransport();
		await server.connect(transport);
		return transport.handleRequest(c);
	});
	return app;
}
