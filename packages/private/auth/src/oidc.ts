// Google の OpenID Connect との通信。手順は openid-client に任せ、
// PKCE、state、nonce、ID トークンの署名の検証を正しく行う。要求するスコープは openid、email、profile だけにする。
import { createRemoteJWKSet, jwtVerify } from 'jose';
import * as client from 'openid-client';
import type { OidcAuthorization, OidcClient } from './service.ts';
import type { GoogleClaims } from './sign-in-policy.ts';

export const GOOGLE_ISSUER = 'https://accounts.google.com';

export interface OidcOptions {
	readonly clientId: string;
	readonly clientSecret: string;
	/** Google に登録した、コールバックの URL */
	readonly redirectUri: string;
	/** 認可のリクエストに付ける hd。大学のアカウントが選ばれやすくなる (画面上のヒントにすぎない) */
	readonly hostedDomain: string;
	/** 既定は Google。テスト用のサーバーに向けるときだけ変える */
	readonly issuer?: string;
}

/** 本番の Google は https。テスト用のサーバー (自分の PC の http) にだけ、http を許す */
function isLocalhostHttp(issuer: URL): boolean {
	return (
		issuer.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(issuer.hostname)
	);
}

export function createGoogleOidcClient(options: OidcOptions): OidcClient {
	const issuer = new URL(options.issuer ?? GOOGLE_ISSUER);
	let configuration: Promise<client.Configuration> | undefined;
	/** ID トークンの署名を検証する鍵。取得と、鍵の入れ替わりへの追従は jose が行う */
	let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;

	/** 設定の取得 (discovery) は 1 回だけ。失敗したら、次のときにやり直す */
	const getConfiguration = () => {
		configuration ??= client
			.discovery(
				issuer,
				options.clientId,
				options.clientSecret,
				undefined,
				isLocalhostHttp(issuer) ? { execute: [client.allowInsecureRequests] } : undefined,
			)
			.catch((error: unknown) => {
				configuration = undefined;
				throw error;
			});
		return configuration;
	};

	return {
		async createAuthorization(authorizationOptions = {}): Promise<OidcAuthorization> {
			const config = await getConfiguration();
			const codeVerifier = client.randomPKCECodeVerifier();
			const state = client.randomState();
			const nonce = client.randomNonce();
			const url = client.buildAuthorizationUrl(config, {
				redirect_uri: options.redirectUri,
				scope: 'openid email profile',
				code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
				code_challenge_method: 'S256',
				state,
				nonce,
				// 付けないと、Google は前回のアカウントで自動で進む。ログアウトしても Google のログインは残るので、
				// 別のアカウント (テストアカウントなど) に替えられるよう、選択画面を毎回出させる
				prompt: 'select_account',
				...(authorizationOptions.hostedDomainHint !== false && { hd: options.hostedDomain }),
			});
			return { url: url.toString(), state, nonce, codeVerifier };
		},

		async exchange(callbackUrl, expected): Promise<GoogleClaims> {
			const config = await getConfiguration();
			// state の照合、PKCE、コードの交換、ID トークンの署名、iss、aud、exp、nonce の検証は、ここで行われる
			const tokens = await client.authorizationCodeGrant(config, callbackUrl, {
				pkceCodeVerifier: expected.codeVerifier,
				expectedState: expected.state,
				expectedNonce: expected.nonce,
				idTokenExpected: true,
			});
			// openid-client は、ID トークンをトークンエンドポイントから直接受け取るとき、OIDC の規格 (Core 3.1.3.7) に沿って
			// 署名を検証しない (TLS で直接受け取るので、代わりになる)。ID トークンの署名は検証したいので、JWKS で検証する
			if (!tokens.id_token) throw new Error('ID トークンがありません');
			const metadata = config.serverMetadata();
			if (!metadata.jwks_uri) throw new Error('issuer が jwks_uri を公開していません');
			jwks ??= createRemoteJWKSet(new URL(metadata.jwks_uri));
			await jwtVerify(tokens.id_token, jwks, {
				issuer: metadata.issuer,
				audience: options.clientId,
				algorithms: ['RS256'],
			});
			const claims = tokens.claims();
			if (!claims) throw new Error('ID トークンがありません');
			if (typeof claims['email'] !== 'string')
				throw new Error('ID トークンにメールアドレスがありません');
			return {
				sub: claims.sub,
				email: claims['email'],
				// email_verified は、真偽値でなければ、確認されていないものとして扱う
				emailVerified: claims['email_verified'] === true,
				...(typeof claims['hd'] === 'string' && { hd: claims['hd'] }),
				...(typeof claims['name'] === 'string' && { name: claims['name'] }),
			};
		},
	};
}
