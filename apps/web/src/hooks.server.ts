import type { Handle, ServerInit } from '@sveltejs/kit/hooks';

// サーバーの起動と、リクエストの振り分け。
// 起動時に設定を検証して DB を開き、機械向けのパスだけを Hono に渡す。
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dev } from '$app/env';
import { createApi, SESSION_COOKIE_MAX_AGE_S, sessionCookieName } from '@funmary/api';
import { hasAcceptedTerms } from '@funmary/core';
import { createAuthService, createGoogleOidcClient, type AuthService } from '@funmary/auth';
import {
	checkHealth,
	createAcademicCalendarStore,
	createAccessGrantStore,
	createAccessTokenStore,
	createAccountStore,
	createTestAccountStore,
	createAuditLogStore,
	createAuthStore,
	createChannelStore,
	createDeliveryStore,
	createDiscordLinkStore,
	createSecretBox,
	createSettingsStore,
	createUserEventStore,
	createClassChangeStore,
	createCourseStore,
	createDailyDigestStore,
	createFeedTokenStore,
	createHolidayStore,
	createNotificationStore,
	createOAuthStore,
	createPersonalSlotStore,
	createSubjectAbbreviationStore,
	createSlotSubmissionStore,
	createSourceHealthStore,
	createSubjectStore,
	createUnmatchedLessonStore,
	createJobRunStore,
	openDatabase,
	type AuthStore,
} from '@funmary/db';
import {
	createDeliverNotificationsJob,
	createJobRunner,
	createSendDailyDigestJob,
	type JobDefinition,
} from '@funmary/jobs';
import { bundledHolidays, estimateHolidays } from '@funmary/sources';
import {
	createAdminAlerter,
	createAdminDiscordSink,
	createDiscordBot,
	createDiscordOAuthClient,
	createDiscordPresence,
	parseLayout,
	sendViaGenericWebhook,
	sendViaWebhook,
	type DiscordLayout,
} from '@funmary/notify';
import { createLogger, type Logger } from '@funmary/log';
import { parseConfig } from '#lib/server/config.ts';
import { findBuildInfo } from '#lib/server/build-info.ts';
import { createJobDefinitions } from '#lib/server/jobs.ts';
import { createResponseTimes } from '#lib/server/response-times.ts';
import { loadCalendarFeed } from '#lib/server/calendar-feed.ts';
import { answerCommand } from '#lib/server/discord-commands.ts';
import { loadNotificationFeed } from '#lib/server/notification-feed.ts';
import { findLegalInfo } from '#lib/server/legal.ts';
import {
	DISCORD_LAYOUT_KEY,
	DISCORD_LINKING_KEY,
	DISCORD_PRESENCE_KEY,
	readLinkingEnabled,
	readPresenceEnabled,
} from '#lib/server/discord-admin.ts';
import { legacyAppPath } from '#lib/server/legacy-path.ts';
import { findMigrationsFolder } from '#lib/server/migrations-path.ts';
import { CURRENT_TERMS_VERSION } from '#lib/legal-versions.ts';
import { consentPath, needsConsent } from '#lib/server/consent-gate.ts';
import { isCsrfForbidden } from '#lib/server/csrf.ts';
import { getServices, setServices } from '#lib/server/services.ts';
import { dailyDigestDeps } from '#lib/server/daily-digest.ts';
import { deliverNotificationsDeps, testMessage } from '#lib/server/notification-delivery.ts';
import { readWebhookLimit, WEBHOOKS_PER_USER_KEY } from '#lib/server/webhook-limit.ts';
import { parseThemePreference, THEME_COOKIE } from '#lib/theme.ts';

/** Hono に渡すパス。これ自身か、この下のパスが対象になる */
// 同意の画面 (/oauth/authorize) は SvelteKit の画面なので、/oauth の全体ではなく、口ごとに書く
const API_PATHS = [
	'/.well-known',
	'/api',
	'/auth',
	'/cal',
	'/discord',
	'/feed',
	'/healthz',
	'/mcp',
	'/oauth/register',
	'/oauth/token',
	'/signup',
];

/** ログイン用の Google の OAuth クライアントを、開発サーバーで試すときの公開 URL */
const DEV_ORIGIN = 'http://localhost:5173';

/** 定期処理の実行記録を残す期間 */
const JOB_RUN_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
/** 停止するときに、実行中の定期処理を待つ時間。systemd の TimeoutStopSec より短くする */
const SHUTDOWN_GRACE_MS = 10_000;

/** 開発サーバーで動くときの、リポジトリのルート (このファイルは apps/web/src にある) */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

let api: ReturnType<typeof createApi> | undefined;
let logger: Logger | undefined;
let authStore: AuthStore | undefined;
let publicOrigin = DEV_ORIGIN;
/** 応答時間の分布 (管理画面に出す)。サーバーのメモリにだけ持つ */
const responseTimes = createResponseTimes();

export const init: ServerInit = () => {
	// 開発サーバーは、リポジトリのルートの .env を読む。本番では systemd やラッパーが環境変数を渡すので読まない (管理用コマンドと同じ)
	const envFile = resolve(REPO_ROOT, '.env');
	if (dev && existsSync(envFile)) process.loadEnvFile(envFile);
	const result = parseConfig(process.env);
	if (!result.ok) {
		const lines = result.issues.map((issue) => `  ${issue.name}: ${issue.message}`);
		throw new Error(
			[
				'環境変数に足りない値か誤りがあるので、起動を止めます。次の変数を直してください。',
				...lines,
			].join('\n'),
		);
	}
	logger = createLogger({
		level: result.config.logLevel,
		format: result.config.logFormat,
		mode: result.config.mode,
	});
	// 開発サーバーは apps/web で動くが、.env と既定の ./data はリポジトリのルートに置く (管理用コマンドと同じ DB を使う)
	const dataDir = dev ? resolve(REPO_ROOT, result.config.dataDir) : result.config.dataDir;
	mkdirSync(dataDir, { recursive: true });
	// 開くときに、壊れていないかの確認とマイグレーションまで行う。
	// ビルドしたものでは、scripts/copy-migrations.js がサーバーの出力に写したマイグレーションを、上の階層へたどって探す
	const bundledMigrations = findMigrationsFolder(dirname(fileURLToPath(import.meta.url)));
	const database = openDatabase(join(dataDir, 'funmary.db'), {
		backupDir: join(dataDir, 'backups'),
		...(bundledMigrations && { migrationsFolder: bundledMigrations }),
	});
	// 起動したときに、前回の途中で止まって "running" のまま残った記録を閉じ、古い記録を消す
	const jobRunStore = createJobRunStore(database);
	const interrupted = jobRunStore.closeInterrupted(new Date());
	if (interrupted > 0)
		logger.withTag('app').warn(`途中で止まった定期処理の記録を ${interrupted} 件閉じました`);
	jobRunStore.prune(new Date(Date.now() - JOB_RUN_RETENTION_MS));

	// 管理用の Discord の Bot。トークンとギルドの ID があれば、Webhook より先に使う
	const settingsStore = createSettingsStore(database);
	const discordBot = result.config.discordBot
		? createDiscordBot({
				token: result.config.discordBot.token,
				guildId: result.config.discordBot.guildId,
			})
		: null;
	const readDiscordLayout = () => parseLayout(settingsStore.get(DISCORD_LAYOUT_KEY));
	const discordSecretBox = createSecretBox(result.config.encryptionKey);
	const discordLinkStore = createDiscordLinkStore(database, discordSecretBox);
	const linkingEnabled = () => readLinkingEnabled(settingsStore.get(DISCORD_LINKING_KEY));
	// Bot のオンライン表示は、見た目のためだけに Gateway につなぐ。本番で、送信を止めていないときだけ動かす
	// (手元の開発で、同じトークンをつなぎ、本番と取り合わないため)。管理画面で切り替えられる
	const presence = result.config.discordBot
		? createDiscordPresence({ token: result.config.discordBot.token, log: logger })
		: null;
	const presenceAvailable =
		presence !== null && result.config.mode === 'production' && !result.config.notifyDryRun;
	const presenceEnabled = () => readPresenceEnabled(settingsStore.get(DISCORD_PRESENCE_KEY));
	const applyPresence = () => {
		if (presenceAvailable && presenceEnabled()) presence.start();
		else presence?.stop();
	};
	applyPresence();
	const alerter = createAdminAlerter({
		webhookUrl: result.config.adminDiscordWebhookUrl,
		...(discordBot
			? {
					discord: createAdminDiscordSink({ bot: discordBot, layout: readDiscordLayout }),
				}
			: {}),
		dryRun: result.config.notifyDryRun,
		log: logger,
	});
	const changeStore = createClassChangeStore(database);
	const unmatchedStore = createUnmatchedLessonStore(database);
	const subjectStore = createSubjectStore(database);
	// 祝日は、最初は同梱の CSV を入れておき、週に 1 回、内閣府の CSV で入れ替える
	const holidayStore = createHolidayStore(database);
	if (holidayStore.seedBundled(bundledHolidays())) {
		logger.withTag('app').info('同梱の祝日を入れました');
	}
	const academicCalendarStore = createAcademicCalendarStore(database);
	const jobs: JobDefinition[] = createJobDefinitions({
		config: result.config,
		database,
		alert: (alert) => alerter.send(alert),
	});
	// 予定のまとめは、利用者の Discord 連携 (Bot が送る) を使う。送る処理の中で getServices を呼ぶ (services はこのあと入れる)
	if (discordBot) jobs.push(createSendDailyDigestJob(dailyDigestDeps(getServices, discordBot)));
	// 利用者への通知 (通知欄に入ったもの) を、利用者のチャネルへ送る
	const channelStore = createChannelStore(database, discordSecretBox);
	const deliveryStore = createDeliveryStore(database, discordSecretBox);
	const deliveryOrigin = result.config.origin ?? DEV_ORIGIN;
	jobs.push(
		createDeliverNotificationsJob(
			deliverNotificationsDeps({
				channels: channelStore,
				deliveries: deliveryStore,
				notifications: createNotificationStore(database),
				subjects: subjectStore,
				bot: discordBot,
				origin: deliveryOrigin,
				dryRun: result.config.notifyDryRun,
				linkEnabled: linkingEnabled,
				termsVersion: CURRENT_TERMS_VERSION,
				log: logger,
			}),
		),
	);
	const runner = createJobRunner({
		jobs,
		store: jobRunStore,
		log: logger,
		// 失敗したら、管理者に知らせる。同じタスクの失敗は、1 時間に 1 回までにまとまる
		onFinish: async (job, outcome) => {
			if (outcome.status !== 'failed') return;
			await alerter.send({
				severity: 'error',
				title: `定期処理 ${job} が失敗しました`,
				...(outcome.message && { message: outcome.message }),
				key: `job:${job}`,
			});
		},
	});
	runner.start();

	// adapter-node は、SIGTERM を受けるとこのイベントを出して、終わるのを待つ (待つ時間の上限は SHUTDOWN_TIMEOUT)。
	// 新しい処理を止め、実行中の処理を待ってから、書きかけのデータを残さないように DB を閉じる
	// eslint-disable-next-line @typescript-eslint/no-misused-promises -- adapter-node が、リスナーの返す Promise を待つ
	process.once('sveltekit:shutdown', async () => {
		const { abandoned } = await runner.stop({ graceMs: SHUTDOWN_GRACE_MS });
		if (abandoned.length > 0) {
			logger?.withTag('app').warn(`終わらなかった定期処理を中断しました: ${abandoned.join('、')}`);
		}
		presence?.stop();
		database.close();
	});

	publicOrigin = result.config.origin ?? DEV_ORIGIN;
	const discordOAuthClient = result.config.discordOAuth
		? createDiscordOAuthClient({
				clientId: result.config.discordOAuth.clientId,
				clientSecret: result.config.discordOAuth.clientSecret,
				redirectUri: `${publicOrigin}/app/settings/discord`,
			})
		: null;
	const store = createAuthStore(database);
	authStore = store;
	const accessTokenStore = createAccessTokenStore(database);
	const testAccountStore = createTestAccountStore(database);
	const oauthStore = createOAuthStore(database, accessTokenStore);
	const services = {
		auth: store,
		settings: settingsStore,
		discord: {
			bot: discordBot,
			layout: readDiscordLayout,
			presence: {
				available: presenceAvailable,
				enabled: presenceEnabled,
				setEnabled: (enabled: boolean) => {
					settingsStore.set(DISCORD_PRESENCE_KEY, { enabled }, new Date());
					applyPresence();
				},
			},
			saveLayout: (layout: DiscordLayout) =>
				settingsStore.set(DISCORD_LAYOUT_KEY, layout, new Date()),
			link: {
				configured: discordOAuthClient !== null,
				oauth: discordOAuthClient,
				store: discordLinkStore,
				stateBox: discordSecretBox,
				enabled: linkingEnabled,
				setEnabled: (enabled: boolean) =>
					settingsStore.set(DISCORD_LINKING_KEY, { enabled }, new Date()),
				linksChannelId: () => readDiscordLayout().channels.links?.id ?? null,
			},
		},
		courses: createCourseStore(database),
		notifications: createNotificationStore(database),
		channels: channelStore,
		deliveries: deliveryStore,
		webhooks: {
			limit: () => readWebhookLimit(settingsStore.get(WEBHOOKS_PER_USER_KEY)),
			setLimit: (limit: number) => settingsStore.set(WEBHOOKS_PER_USER_KEY, { limit }, new Date()),
			// 手元の開発 (NOTIFY_DRY_RUN) では、本物の Webhook には送らず、送れたことにする
			sendTest: ({ url, signingKey }: { url: string; signingKey: string | null }) => {
				if (result.config.notifyDryRun) {
					logger?.withTag('deliver').info('(送信を止めています) Webhook へのテスト通知');
					return Promise.resolve({ status: 'sent' as const });
				}
				const message = testMessage(deliveryOrigin, new Date());
				if (signingKey) {
					return sendViaGenericWebhook(url, { ...message, id: 'ntf_test' }, signingKey);
				}
				return sendViaWebhook(url, message);
			},
		},
		dailyDigest: createDailyDigestStore(database),
		personalSlots: createPersonalSlotStore(database),
		subjectAbbreviations: createSubjectAbbreviationStore(database),
		slotSubmissions: createSlotSubmissionStore(database),
		userEvents: createUserEventStore(database),
		accessGrants: createAccessGrantStore(database),
		subjects: subjectStore,
		classChanges: changeStore,
		unmatchedLessons: unmatchedStore,
		academicCalendar: academicCalendarStore,
		holidays: holidayStore,
		sourceHealth: createSourceHealthStore(database),
		jobRuns: jobRunStore,
		jobs: { names: jobs.map((job) => job.name), runNow: (name: string) => runner.runNow(name) },
		responseTimes,
		auditLog: createAuditLogStore(database),
		registration: result.config.registration,
		estimateHolidays,
		origin: publicOrigin,
		termsVersion: CURRENT_TERMS_VERSION,
		operator: result.config.operator ?? null,
		brandDir: result.config.brandDir ?? null,
		contactEmail: result.config.contactEmail ?? null,
		alertAdmin: (alert: Parameters<typeof alerter.send>[0]) => alerter.send(alert),
		log: logger,
		feedTokens: createFeedTokenStore(database),
		accessTokens: accessTokenStore,
		oauth: oauthStore,
		account: createAccountStore(database),
		testAccounts: testAccountStore,
		universityDomains: result.config.allowedEmailDomains,
		// リリースでは、tar.gz に同梱した build-info.json を、上の階層へたどって探す
		build: findBuildInfo(dirname(fileURLToPath(import.meta.url))),
		// ビルドでは、scripts/copy-legal.js が写した legal/ を、上の階層へたどって探す
		legal: findLegalInfo(dirname(fileURLToPath(import.meta.url))),
	};
	setServices(services);
	// 同意していない利用者のトークンには、公開 API と MCP が、同意の画面の URL を知らせて断る
	const termsGate = { version: CURRENT_TERMS_VERSION, consentUrl: `${publicOrigin}/consent` };
	const authService: AuthService = createAuthService({
		oidc: createGoogleOidcClient({
			clientId: result.config.google.clientId,
			clientSecret: result.config.google.clientSecret,
			redirectUri: `${publicOrigin}/auth/google/callback`,
			hostedDomain: result.config.allowedEmailDomains[0] ?? 'fun.ac.jp',
			...(result.config.google.issuer && { issuer: result.config.google.issuer }),
		}),
		store,
		allowedDomains: result.config.allowedEmailDomains,
		registration: result.config.registration,
		adminEmails: result.config.adminEmails,
		isTestAccount: (email) => testAccountStore.isTestAccount(email),
	});
	const apiLog = logger.withTag('api');
	api = createApi({
		onError: (error, path) => apiLog.error(`${path} で例外が出ました`, error),
		checkHealth: () => checkHealth(database),
		auth: {
			service: authService,
			deleteSession: (token) => store.deleteSession(token),
			flowKey: Buffer.from(result.config.encryptionKey, 'base64'),
			origin: publicOrigin,
			// メールアドレスなど、個人情報は含めない
			onNewUser: () => {
				void alerter.send({
					severity: 'info',
					title: '新しい利用者が登録しました',
					category: 'users',
					key: `new-user:${Date.now()}`,
				});
			},
		},
		calendar: {
			loadFeed: (token) => loadCalendarFeed(services, token, new Date()),
			uidDomain: new URL(publicOrigin).hostname,
			consentUrl: `${publicOrigin}/consent`,
		},
		feed: {
			loadFeed: (token) => loadNotificationFeed(services, token, new Date()),
			consentUrl: `${publicOrigin}/consent`,
		},
		v1: { ...services, users: services.auth, termsGate },
		mcp: {
			...services,
			users: services.auth,
			resourceMetadataUrl: `${publicOrigin}/.well-known/oauth-protected-resource/mcp`,
			origin: publicOrigin,
			termsGate,
		},
		oauth: { oauth: oauthStore, origin: publicOrigin },
		// 公開鍵がなければ、Discord の署名を確かめられないので、受け口を開けない
		...(result.config.discordPublicKey
			? {
					discordInteractions: {
						publicKeyHex: result.config.discordPublicKey,
						answer: (command: string, discordUserId: string, now: Date) =>
							answerCommand(services, command, discordUserId, now),
					},
				}
			: {}),
	});
	logger.withTag('app').info(`起動しました (${result.config.mode}、DB は ${dataDir})`);
};

export const handle: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	// 開発サーバーでは、組み込みの検査も行われていなかった
	if (
		!dev &&
		isCsrfForbidden({
			method: event.request.method,
			path,
			contentType: event.request.headers.get('content-type'),
			origin: event.request.headers.get('origin'),
			selfOrigin: publicOrigin,
		})
	) {
		return new Response(`Cross-site ${event.request.method} form submissions are forbidden`, {
			status: 403,
		});
	}
	// /app に移す前の画面の URL は、移した先へ転送する (308 は、POST も POST のまま送り直させる)
	const moved = legacyAppPath(path);
	if (moved) {
		return new Response(null, { status: 308, headers: { Location: moved + event.url.search } });
	}
	const started = performance.now();
	event.locals.user = null;
	event.locals.theme = parseThemePreference(event.cookies.get(THEME_COOKIE));
	const sessionToken = event.cookies.get(sessionCookieName(publicOrigin));
	if (authStore && sessionToken) {
		// 使うたびに DB の有効期限が延びるので、Cookie の期限も延ばす
		event.locals.user = authStore.resolveSession(sessionToken, new Date());
		if (event.locals.user) {
			event.cookies.set(sessionCookieName(publicOrigin), sessionToken, {
				httpOnly: true,
				sameSite: 'lax',
				secure: publicOrigin.startsWith('https://'),
				path: '/',
				maxAge: SESSION_COOKIE_MAX_AGE_S,
			});
		}
	}
	// 利用規約への同意が済むまで、アプリの画面を止める。画面は同意の画面へ、フォームの送信などは 403 にする
	if (
		event.locals.user &&
		needsConsent(path) &&
		!hasAcceptedTerms(event.locals.user.termsAcceptedVersion, CURRENT_TERMS_VERSION)
	) {
		const isRead = event.request.method === 'GET' || event.request.method === 'HEAD';
		return isRead
			? new Response(null, {
					status: 303,
					headers: { Location: consentPath(event.url), 'Cache-Control': 'no-store' },
				})
			: new Response('利用規約とプライバシーポリシーへの同意が必要です', {
					status: 403,
					headers: { 'Cache-Control': 'no-store' },
				});
	}
	const response =
		api && API_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
			? await api.fetch(event.request)
			: await resolve(event, {
					// 画面の色の設定を <html data-theme> に入れる。値は parseThemePreference で決めた 3 つのどれかだけ
					transformPageChunk: ({ html }) => html.replace('%fm.theme%', event.locals.theme),
				});
	// 死活監視は 5 分ごとに来るので、info には出さない。トークンは logger が伏せる
	const log = logger?.withTag('http');
	const took = performance.now() - started;
	const line = `${event.request.method} ${path} ${response.status} ${Math.round(took)} ms`;
	if (path === '/healthz') log?.debug(line);
	else {
		log?.info(line);
		// 死活監視は数えない (画面と API の応答だけを見る)
		responseTimes.record(took, new Date());
	}
	return response;
};
