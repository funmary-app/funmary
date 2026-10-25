import { describe, expect, it } from 'vitest';
import { parseConfig } from './config.ts';

/** 開発で必須の値だけをそろえた環境変数。値は形だけ合わせた架空のもの */
function developmentEnv(): Record<string, string | undefined> {
	return {
		SESSION_SECRET: 'x'.repeat(43),
		ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
		VAPID_PUBLIC_KEY: 'B' + 'A'.repeat(86),
		VAPID_PRIVATE_KEY: 'A'.repeat(43),
		VAPID_SUBJECT: 'mailto:admin@funmary.example.com',
		GOOGLE_CLIENT_ID: '1234567890-abc.apps.googleusercontent.com',
		GOOGLE_CLIENT_SECRET: 'GOCSPX-example',
	};
}

describe('parseConfig', () => {
	it('開発で必須の値がそろえば、残りは既定値で補う', () => {
		const result = parseConfig(developmentEnv());
		expect(result).toMatchObject({
			ok: true,
			config: {
				mode: 'development',
				host: '127.0.0.1',
				port: 28461,
				dataDir: './data',
				allowedEmailDomains: ['fun.ac.jp'],
				invitesPerUser: 0,
				adminEmails: [],
				sourcesDisabled: [],
				notifyDryRun: true,
				logLevel: 'debug',
				logFormat: 'text',
			},
		});
	});

	it('書いた値を読み、空の値は書かなかったのと同じに扱う', () => {
		const withValues = parseConfig({
			...developmentEnv(),
			HOST: '0.0.0.0',
			PORT: '8080',
			LOG_LEVEL: 'warn',
		});
		const withEmpty = parseConfig({
			...developmentEnv(),
			HOST: '',
			PORT: '',
			LOG_LEVEL: '',
		});
		expect(withValues).toMatchObject({
			ok: true,
			config: { host: '0.0.0.0', port: 8080, logLevel: 'warn' },
		});
		expect(withEmpty).toMatchObject({
			ok: true,
			config: { host: '127.0.0.1', port: 28461, logLevel: 'debug' },
		});
	});

	it('Discord の Bot は、トークンとギルドの ID がそろったときだけ使い、片方だけなら誤りにする', () => {
		const token = 'dummy-bot-token-' + 'x'.repeat(30);
		expect(parseConfig(developmentEnv())).toMatchObject({
			ok: true,
			config: { discordBot: undefined },
		});
		expect(
			parseConfig({
				...developmentEnv(),
				DISCORD_BOT_TOKEN: token,
				DISCORD_GUILD_ID: '1234567890',
			}),
		).toMatchObject({
			ok: true,
			config: { discordBot: { token, guildId: '1234567890' } },
		});
		expect(parseConfig({ ...developmentEnv(), DISCORD_BOT_TOKEN: token })).toMatchObject({
			ok: false,
			issues: [{ name: 'DISCORD_GUILD_ID' }],
		});
		expect(parseConfig({ ...developmentEnv(), DISCORD_GUILD_ID: '1234567890' })).toMatchObject({
			ok: false,
			issues: [{ name: 'DISCORD_BOT_TOKEN' }],
		});
	});

	it('利用者の Discord 連携の OAuth は、Client ID と Secret がそろったときだけ使う (#163)', () => {
		expect(parseConfig(developmentEnv())).toMatchObject({
			ok: true,
			config: { discordOAuth: undefined },
		});
		expect(
			parseConfig({
				...developmentEnv(),
				DISCORD_CLIENT_ID: '1234567890',
				DISCORD_CLIENT_SECRET: 'dummy-client-secret',
			}),
		).toMatchObject({
			ok: true,
			config: { discordOAuth: { clientId: '1234567890', clientSecret: 'dummy-client-secret' } },
		});
		expect(parseConfig({ ...developmentEnv(), DISCORD_CLIENT_ID: '1234567890' })).toMatchObject({
			ok: false,
			issues: [{ name: 'DISCORD_CLIENT_SECRET' }],
		});
		expect(
			parseConfig({ ...developmentEnv(), DISCORD_CLIENT_SECRET: 'dummy-client-secret' }),
		).toMatchObject({
			ok: false,
			issues: [{ name: 'DISCORD_CLIENT_ID' }],
		});
	});

	it('ロゴとアイコンを差し替えるディレクトリ (BRAND_DIR) は、書いたときだけ使う', () => {
		expect(parseConfig(developmentEnv())).toMatchObject({
			ok: true,
			config: { brandDir: undefined },
		});
		expect(parseConfig({ ...developmentEnv(), BRAND_DIR: '/etc/funmary/brand' })).toMatchObject({
			ok: true,
			config: { brandDir: '/etc/funmary/brand' },
		});
	});

	it('問い合わせ先のメールアドレス (CONTACT_EMAIL) は、メールアドレスの形のときだけ受け付ける', () => {
		expect(
			parseConfig({ ...developmentEnv(), CONTACT_EMAIL: 'contact@funmary.example.com' }),
		).toMatchObject({ ok: true, config: { contactEmail: 'contact@funmary.example.com' } });
		expect(parseConfig({ ...developmentEnv(), CONTACT_EMAIL: 'not-an-address' })).toMatchObject({
			ok: false,
			issues: [{ name: 'CONTACT_EMAIL' }],
		});
	});

	it('セルフホストの運営者の情報は、名前と URL がそろったときだけ使う (Issue #109)', () => {
		expect(parseConfig(developmentEnv())).toMatchObject({
			ok: true,
			config: { operator: undefined },
		});
		expect(
			parseConfig({
				...developmentEnv(),
				OPERATOR_NAME: '架空の運営',
				OPERATOR_URL: 'https://example.com',
			}),
		).toMatchObject({
			ok: true,
			config: { operator: { name: '架空の運営', url: 'https://example.com' } },
		});
		expect(parseConfig({ ...developmentEnv(), OPERATOR_NAME: '架空の運営' })).toMatchObject({
			ok: false,
			issues: [{ name: 'OPERATOR_URL' }],
		});
		expect(parseConfig({ ...developmentEnv(), OPERATOR_URL: 'https://example.com' })).toMatchObject(
			{
				ok: false,
				issues: [{ name: 'OPERATOR_NAME' }],
			},
		);
		expect(
			parseConfig({
				...developmentEnv(),
				OPERATOR_NAME: '架空の運営',
				OPERATOR_URL: 'http://example.com',
			}),
		).toMatchObject({ ok: false });
	});

	it('DB の置き場所は DATA_DIR、systemd の STATE_DIRECTORY、./data の順に、値のあるものを使う', () => {
		const stateDirectory = '/var/lib/funmary';
		const dataDirOf = (extra: Record<string, string>) => {
			const result = parseConfig({ ...developmentEnv(), ...extra });
			return result.ok ? result.config.dataDir : undefined;
		};
		expect(dataDirOf({ DATA_DIR: '/srv/funmary', STATE_DIRECTORY: stateDirectory })).toBe(
			'/srv/funmary',
		);
		expect(dataDirOf({ DATA_DIR: '', STATE_DIRECTORY: stateDirectory })).toBe(stateDirectory);
		expect(dataDirOf({ DATA_DIR: '' })).toBe('./data');
	});

	it('必須の値が足りなければ、足りない変数をすべてまとめて返す', () => {
		const result = parseConfig({ SESSION_SECRET: '', GOOGLE_CLIENT_ID: '' });
		expect(result.ok).toBe(false);
		expect(result.ok ? [] : result.issues.map((issue) => issue.name).toSorted()).toEqual([
			'ENCRYPTION_KEY',
			'GOOGLE_CLIENT_ID',
			'GOOGLE_CLIENT_SECRET',
			'SESSION_SECRET',
			'VAPID_PRIVATE_KEY',
			'VAPID_PUBLIC_KEY',
		]);
	});

	it('OIDC_ISSUER は、書かなければ Google を使い、書けば http の URL も受け付ける (テスト用のサーバーに向けるため)', () => {
		const issuerOf = (extra: Record<string, string>) => {
			const result = parseConfig({ ...developmentEnv(), ...extra });
			return result.ok ? result.config.google.issuer : 'error';
		};
		expect(issuerOf({})).toBeUndefined();
		expect(issuerOf({ OIDC_ISSUER: 'http://localhost:4174' })).toBe('http://localhost:4174');
		expect(issuerOf({ OIDC_ISSUER: 'ftp://example.com' })).toBe('error');
	});

	it('プッシュ通知の連絡先 (VAPID_SUBJECT) が空なら公開 URL を使い、どちらもなければ連絡先なしにする', () => {
		const subjectOf = (extra: Record<string, string>) => {
			const result = parseConfig({ ...developmentEnv(), VAPID_SUBJECT: '', ...extra });
			return result.ok ? result.config.vapid.subject : 'error';
		};
		expect(subjectOf({ VAPID_SUBJECT: 'mailto:admin@funmary.example.com' })).toBe(
			'mailto:admin@funmary.example.com',
		);
		expect(subjectOf({ ORIGIN: 'https://funmary.example.com' })).toBe(
			'https://funmary.example.com',
		);
		expect(subjectOf({})).toBeUndefined();
	});

	it('足りない変数には、どう直すかを日本語で添える', () => {
		const result = parseConfig({ ...developmentEnv(), GOOGLE_CLIENT_ID: undefined });
		expect(result).toEqual({
			ok: false,
			issues: [
				{
					name: 'GOOGLE_CLIENT_ID',
					message: expect.stringContaining('Google Cloud Console') as string,
				},
			],
		});
	});

	it('本番の公開 URL は https:// に限る。手元で本番の形を試す localhost だけは http:// も許す', () => {
		const originIssues = (origin: string) => {
			const result = parseConfig({
				...developmentEnv(),
				NODE_ENV: 'production',
				ORIGIN: origin,
				PORTAL_USER_ID: 'student',
				PORTAL_PASSWORD: 'password',
			});
			return result.ok ? [] : result.issues.map((issue) => issue.name);
		};
		expect(originIssues('http://funmary.example.com')).toEqual(['ORIGIN']);
		expect(originIssues('http://localhost:4173')).toEqual([]);
		expect(originIssues('http://127.0.0.1:4173')).toEqual([]);
	});

	it('公開 URL とポータルのアカウントは、本番でだけ求める', () => {
		const production = parseConfig({ ...developmentEnv(), NODE_ENV: 'production' });
		expect(production.ok ? [] : production.issues.map((issue) => issue.name).toSorted()).toEqual([
			'ORIGIN',
			'PORTAL_PASSWORD',
			'PORTAL_USER_ID',
		]);

		const complete = parseConfig({
			...developmentEnv(),
			NODE_ENV: 'production',
			ORIGIN: 'https://funmary.example.com',
			PORTAL_USER_ID: 'student',
			PORTAL_PASSWORD: 'password',
		});
		expect(complete).toMatchObject({
			ok: true,
			config: {
				mode: 'production',
				origin: 'https://funmary.example.com',
				portal: { userId: 'student', password: 'password' },
				notifyDryRun: false,
				logLevel: 'info',
			},
		});
	});

	it.each([
		['ORIGIN', 'https://funmary.example.com/', '末尾に / がある'],
		['ORIGIN', 'https://funmary.example.com/app', 'パスがある'],
		['ORIGIN', 'funmary.example.com', 'https:// がない'],
		['PORT', '0', '範囲の外'],
		['PORT', '70000', '範囲の外'],
		['PORT', '80a', '数でない'],
		['ENCRYPTION_KEY', Buffer.alloc(16).toString('base64'), '32 バイトでない'],
		['VAPID_SUBJECT', 'admin@funmary.example.com', 'mailto: がない'],
		['INVITES_PER_USER', '-1', '負の数'],
		['ADMIN_EMAILS', 'admin', 'メールアドレスでない'],
		['ADMIN_DISCORD_WEBHOOK_URL', 'https://example.com/hook', 'Discord の Webhook でない'],
		['HEARTBEAT_URL', 'ftp://hc-ping.com/abc', 'http でない'],
		['BUS_API_BASE_URL', 'ftp://bus.example.com', 'http でない'],
		['CAMPUS_IP_RANGES', '203.0.113.0/24, bad', 'IPv4 の範囲でない'],
		['NOTIFY_DRY_RUN', 'yes', 'true か false でない'],
		['XFF_DEPTH', '0', '1 以上でない'],
	])('%s に %s と書くと (%s)、その変数の誤りとして返す', (name, value) => {
		const result = parseConfig({ ...developmentEnv(), [name]: value });
		expect(result.ok ? [] : result.issues.map((issue) => issue.name)).toEqual([name]);
	});

	it('BUS_API_BASE_URL は、書かなければバスの機能を無効にし、書けば URL として読む', () => {
		const busUrlOf = (extra: Record<string, string>) => {
			const result = parseConfig({ ...developmentEnv(), ...extra });
			return result.ok ? result.config.busApiBaseUrl : 'error';
		};
		expect(busUrlOf({})).toBeUndefined();
		expect(busUrlOf({ BUS_API_BASE_URL: '' })).toBeUndefined();
		expect(busUrlOf({ BUS_API_BASE_URL: 'https://bus.example.com' })).toBe(
			'https://bus.example.com',
		);
	});

	it('CAMPUS_IP_RANGES は、書かなければ空で、書けばカンマで区切って読む', () => {
		const rangesOf = (extra: Record<string, string>) => {
			const result = parseConfig({ ...developmentEnv(), ...extra });
			return result.ok ? result.config.campusIpRanges : 'error';
		};
		expect(rangesOf({})).toEqual([]);
		expect(rangesOf({ CAMPUS_IP_RANGES: '203.0.113.0/24, 198.51.100.7' })).toEqual([
			'203.0.113.0/24',
			'198.51.100.7',
		]);
	});

	it('カンマ区切りの値は、前後の空白を除き、空の要素を捨てる', () => {
		const result = parseConfig({
			...developmentEnv(),
			ADMIN_EMAILS: ' taro@fun.ac.jp , ,hanako@fun.ac.jp,',
			SOURCES_DISABLED: 'portal, hope',
		});
		expect(result).toMatchObject({
			ok: true,
			config: {
				adminEmails: ['taro@fun.ac.jp', 'hanako@fun.ac.jp'],
				sourcesDisabled: ['portal', 'hope'],
			},
		});
	});

	it('誤りの説明に、書かれていた値を載せない', () => {
		const secrets = {
			ENCRYPTION_KEY: 'short-secret-key',
			SESSION_SECRET: 'tiny-secret',
			ADMIN_DISCORD_WEBHOOK_URL: 'https://example.com/secret-hook',
			PORTAL_PASSWORD: 'p@ss',
		};
		const result = parseConfig({ ...developmentEnv(), ...secrets, PORT: 'secret-port' });
		expect(result.ok).toBe(false);
		const text = JSON.stringify(result);
		for (const secret of [...Object.values(secrets), 'secret-port']) {
			expect(text).not.toContain(secret);
		}
	});
});
