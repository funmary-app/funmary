// テスト用の、小さな OpenID Connect のサーバー。Google の代わりに、単体テストと E2E テストで使う。
// 本番のコードからは読み込まない (index.ts から公開しない)。
// 実際に RS256 で署名した ID トークンを返すので、openid-client の署名、state、nonce、PKCE の検証を本物のまま確かめられる。
import {
	createHash,
	createPrivateKey,
	createPublicKey,
	createSign,
	generateKeyPairSync,
	randomBytes,
	type KeyObject,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server } from 'node:http';

export interface MockIdentity {
	sub: string;
	email: string;
	email_verified?: boolean;
	hd?: string;
	name?: string;
}

export interface MockOidcOptions {
	clientId: string;
	clientSecret: string;
	/** 0 なら空いているポートを使う */
	port?: number;
	/**
	 * 署名の鍵を保存するファイル。あれば読み、なければ作って保存する。
	 * アプリは公開鍵を覚えて使い回す (同じ kid なら取り直さない) ので、テストのやり直しでサーバーを立て直すときも、同じ鍵にする
	 */
	keyFile?: string;
}

export type TamperMode = 'none' | 'wrong-key' | 'wrong-audience' | 'expired' | 'wrong-nonce';

/**
 * 認可のリクエストの x-e2e-worker ヘッダーの値ごとに、ログインする人と ID トークンの壊し方を分ける。
 * E2E のワーカー (別のプロセス) が 1 つのサーバーを共有するので、ワーカーは POST /__mock/identity と
 * POST /__mock/tamper ({ client, identity } と { client, mode }) で、自分の分を決める
 */
export const CLIENT_HEADER = 'x-e2e-worker';

export interface MockOidcServer {
	/** issuer の URL (末尾の / なし) */
	readonly issuer: string;
	/** 次にログインする人 (x-e2e-worker のないリクエストの分)。認可のリクエストが来ると、この人でログインしたことにする */
	setIdentity(identity: MockIdentity): void;
	/** 次に返す ID トークンを、わざと壊す (x-e2e-worker のないリクエストの分) */
	tamper(mode: TamperMode): void;
	close(): Promise<void>;
}

const b64url = (input: Buffer | string) => Buffer.from(input).toString('base64url');

function readBody(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		request.on('data', (chunk: Buffer) => chunks.push(chunk));
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		request.on('error', reject);
	});
}

function signJwt(payload: object, privateKey: KeyObject, kid: string): string {
	const header = { alg: 'RS256', typ: 'JWT', kid };
	const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
	const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
	return `${signingInput}.${b64url(signature)}`;
}

function loadOrCreateKeys(keyFile: string | undefined): {
	privateKey: KeyObject;
	publicKey: KeyObject;
} {
	if (keyFile && existsSync(keyFile)) {
		const privateKey = createPrivateKey(readFileSync(keyFile, 'utf8'));
		return { privateKey, publicKey: createPublicKey(privateKey) };
	}
	const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
	if (keyFile) {
		writeFileSync(keyFile, keys.privateKey.export({ format: 'pem', type: 'pkcs8' }), {
			mode: 0o600,
		});
	}
	return keys;
}

export async function startMockOidcServer(options: MockOidcOptions): Promise<MockOidcServer> {
	const keys = loadOrCreateKeys(options.keyFile);
	const otherKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
	const kid = 'mock-key-1';
	const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' };

	const defaultIdentity: MockIdentity = {
		sub: 'mock-sub',
		email: 'mock@fun.ac.jp',
		hd: 'fun.ac.jp',
	};
	/** x-e2e-worker の値 (ないときは '') → ログインする人と、ID トークンの壊し方 */
	const clients = new Map<string, { identity: MockIdentity; tamper: TamperMode }>();
	const clientOf = (key: string) => {
		let client = clients.get(key);
		if (!client) {
			client = { identity: defaultIdentity, tamper: 'none' };
			clients.set(key, client);
		}
		return client;
	};
	/** 認可のコード → 認可のときに受け取った値 */
	const codes = new Map<
		string,
		{ nonce: string; challenge: string; identity: MockIdentity; tamper: TamperMode }
	>();
	let issuer = '';

	const server: Server = createServer((request, response) => {
		void (async () => {
			const url = new URL(request.url ?? '/', issuer || 'http://localhost');
			const json = (status: number, body: unknown) => {
				response.writeHead(status, { 'content-type': 'application/json' });
				response.end(JSON.stringify(body));
			};

			if (url.pathname === '/.well-known/openid-configuration') {
				return json(200, {
					issuer,
					authorization_endpoint: `${issuer}/authorize`,
					token_endpoint: `${issuer}/token`,
					jwks_uri: `${issuer}/jwks`,
					response_types_supported: ['code'],
					subject_types_supported: ['public'],
					id_token_signing_alg_values_supported: ['RS256'],
					code_challenge_methods_supported: ['S256'],
					token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
				});
			}
			if (url.pathname === '/jwks') return json(200, { keys: [jwk] });

			if (url.pathname === '/__mock/identity' && request.method === 'POST') {
				const body = JSON.parse(await readBody(request)) as {
					client: string;
					identity: MockIdentity;
				};
				clientOf(body.client).identity = body.identity;
				return json(200, {});
			}
			if (url.pathname === '/__mock/tamper' && request.method === 'POST') {
				const body = JSON.parse(await readBody(request)) as { client: string; mode: TamperMode };
				clientOf(body.client).tamper = body.mode;
				return json(200, {});
			}

			if (url.pathname === '/authorize') {
				const redirectUri = url.searchParams.get('redirect_uri');
				const state = url.searchParams.get('state');
				const challenge = url.searchParams.get('code_challenge');
				if (
					url.searchParams.get('client_id') !== options.clientId ||
					!redirectUri ||
					!state ||
					!challenge ||
					url.searchParams.get('code_challenge_method') !== 'S256'
				) {
					return json(400, { error: 'invalid_request' });
				}
				const code = randomBytes(16).toString('hex');
				const header = request.headers[CLIENT_HEADER];
				const client = clientOf(typeof header === 'string' ? header : '');
				codes.set(code, {
					nonce: url.searchParams.get('nonce') ?? '',
					challenge,
					identity: client.identity,
					tamper: client.tamper,
				});
				const back = new URL(redirectUri);
				back.searchParams.set('code', code);
				back.searchParams.set('state', state);
				response.writeHead(302, { location: back.toString() });
				return response.end();
			}

			if (url.pathname === '/token' && request.method === 'POST') {
				const form = new URLSearchParams(await readBody(request));
				const basic = request.headers.authorization?.startsWith('Basic ')
					? Buffer.from(request.headers.authorization.slice(6), 'base64').toString('utf8')
					: undefined;
				const [basicId, basicSecret] = basic ? basic.split(':') : [];
				const clientId = form.get('client_id') ?? basicId;
				const clientSecret = form.get('client_secret') ?? basicSecret;
				if (clientId !== options.clientId || clientSecret !== options.clientSecret) {
					return json(401, { error: 'invalid_client' });
				}
				const entry = codes.get(form.get('code') ?? '');
				codes.delete(form.get('code') ?? '');
				const verifier = form.get('code_verifier') ?? '';
				const challenge = createHash('sha256').update(verifier).digest('base64url');
				if (
					form.get('grant_type') !== 'authorization_code' ||
					!entry ||
					challenge !== entry.challenge
				) {
					return json(400, { error: 'invalid_grant' });
				}

				const { tamper } = entry;
				const now = Math.floor(Date.now() / 1000);
				const claims = {
					iss: issuer,
					aud: tamper === 'wrong-audience' ? 'someone-else' : options.clientId,
					sub: entry.identity.sub,
					email: entry.identity.email,
					email_verified: entry.identity.email_verified ?? true,
					...(entry.identity.hd !== undefined && { hd: entry.identity.hd }),
					...(entry.identity.name !== undefined && { name: entry.identity.name }),
					nonce: tamper === 'wrong-nonce' ? 'not-the-nonce' : entry.nonce,
					iat: now,
					exp: tamper === 'expired' ? now - 3600 : now + 3600,
				};
				const signer = tamper === 'wrong-key' ? otherKeys.privateKey : keys.privateKey;
				return json(200, {
					access_token: randomBytes(16).toString('hex'),
					token_type: 'Bearer',
					expires_in: 3600,
					id_token: signJwt(claims, signer, kid),
				});
			}
			json(404, { error: 'not_found' });
		})().catch(() => {
			response.writeHead(500).end();
		});
	});

	await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
	const address = server.address();
	if (address === null || typeof address === 'string') throw new Error('ポートを取得できません');
	issuer = `http://127.0.0.1:${address.port}`;

	return {
		issuer,
		setIdentity(next) {
			clientOf('').identity = next;
		},
		tamper(mode) {
			clientOf('').tamper = mode;
		},
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => (error ? reject(error) : resolve()));
				server.closeAllConnections();
			}),
	};
}
