// 画面のサーバー側の処理 (load、action) が使う部品。起動時に hooks.server.ts の init が 1 回だけ入れる。
import type { TimetableSources } from '@funmary/api';
import type {
	AcademicCalendarStore,
	AccessGrantStore,
	AccessTokenStore,
	AccountStore,
	TestAccountStore,
	AuditLogStore,
	AuthStore,
	ChannelStore,
	ClassChangeStore,
	CourseStore,
	DailyDigestStore,
	DeliveryStore,
	DiscordLinkStore,
	FeedTokenStore,
	HolidayStore,
	NotificationStore,
	OAuthStore,
	PersonalSlotStore,
	SecretBox,
	SettingsStore,
	SlotSubmissionStore,
	StoredJobRunStore,
	SourceHealthStore,
	SubjectStore,
	SubjectAbbreviationStore,
	UnmatchedLessonStore,
	UserEventStore,
} from '@funmary/db';
import type { JobResult } from '@funmary/jobs';
import type { Logger } from '@funmary/log';
import type {
	AdminChannel,
	DiscordBot,
	DiscordLayout,
	DiscordOAuthClient,
	SendOutcome,
} from '@funmary/notify';
import type { BuildInfo } from './build-info.ts';
import type { LegalInfo } from './legal.ts';
import type { ResponseTimes } from './response-times.ts';

export interface Services {
	/** 利用者、招待コード、利用者の権限 */
	readonly auth: AuthStore;
	/** 管理画面で変える設定 (招待コードを発行できる人など) */
	readonly settings: SettingsStore;
	/** 管理用の Discord の Bot と、チャンネルとロールの配置。Bot は設定されていなければ null */
	readonly discord: {
		readonly bot: DiscordBot | null;
		layout(): DiscordLayout;
		saveLayout(layout: DiscordLayout): void;
		/** Bot のオンライン表示 (Gateway につなぐ)。available は本番で、送信を止めていないときだけ true */
		readonly presence: {
			readonly available: boolean;
			enabled(): boolean;
			setEnabled(enabled: boolean): void;
		};
		/** 利用者の Discord 連携 (#163) */
		readonly link: {
			/** OAuth の Client ID と Secret が設定されているか。false なら連携の入口を出さない */
			readonly configured: boolean;
			readonly oauth: DiscordOAuthClient | null;
			readonly store: DiscordLinkStore;
			/** 連携の途中経過 (state) を封じる。ENCRYPTION_KEY から作った、この起動のもの */
			readonly stateBox: SecretBox;
			/** 管理者が機能全体を有効にしているか (既定は無効) */
			enabled(): boolean;
			setEnabled(enabled: boolean): void;
			/** サポートサーバーの support チャンネルの ID。まだ整えていなければ null */
			linksChannelId(): string | null;
		};
	};
	readonly courses: CourseStore;
	/** 利用者の通知欄 */
	readonly notifications: NotificationStore;
	/** 利用者が登録した通知の送り先 (Discord の Webhook、汎用の Webhook) */
	readonly channels: ChannelStore;
	/** 通知の送信待ちと、送れたか。管理画面の「配信の失敗」はここから出す */
	readonly deliveries: DeliveryStore;
	readonly webhooks: {
		/** 1 人が登録できる Webhook の個数 (管理者が決める)。discord と generic を合わせた数 */
		limit(): number;
		setLimit(limit: number): void;
		/**
		 * Webhook にテスト通知を送る。NOTIFY_DRY_RUN のときは送らずに、送れたことにする。
		 * signingKey があれば、汎用の Webhook として Funmary 共通の JSON と署名で送る
		 */
		sendTest(webhook: { url: string; signingKey: string | null }): Promise<SendOutcome>;
	};
	/** 予定のまとめ (今日か明日の授業と予定を Discord に送るもの、#207) の、利用者ごとの設定 */
	readonly dailyDigest: DailyDigestStore;
	/** 利用者だけに見える、曜日と時限の書き換え */
	readonly personalSlots: PersonalSlotStore;
	/** 共有の枠を「モデレーターが確認してから登録する」設定のときの、確認待ちの提出 */
	readonly slotSubmissions: SlotSubmissionStore;
	/** 利用者が自分の時間割に足した予定 (持ち主だけが読み書きできる) */
	readonly userEvents: UserEventStore;
	readonly subjects: SubjectStore;
	/** 時間割のセルだけに使う、利用者ごとの科目の略称 */
	readonly subjectAbbreviations: SubjectAbbreviationStore;
	/** 予定や科目を、特定のメールアドレスの人にだけ見せる招待 (限定公開、Issue #215) */
	readonly accessGrants: AccessGrantStore;
	readonly classChanges: ClassChangeStore;
	readonly unmatchedLessons: UnmatchedLessonStore;
	readonly academicCalendar: AcademicCalendarStore;
	readonly holidays: HolidayStore;
	readonly sourceHealth: SourceHealthStore;
	readonly jobRuns: StoredJobRunStore;
	/** サーバーの中で動いている定期処理。管理画面から今すぐ動かせる */
	readonly jobs: {
		readonly names: readonly string[];
		runNow(name: string): Promise<JobResult>;
	};
	/** 直近 24 時間の応答時間 (サーバーのメモリにだけある) */
	readonly responseTimes: ResponseTimes;
	/** 利用者が全体に影響する操作をしたときの記録 (監査ログ) */
	readonly auditLog: AuditLogStore;
	readonly estimateHolidays: TimetableSources['estimateHolidays'];
	/** 動いているアプリの版。手元の開発では null */
	readonly build: BuildInfo | null;
	/** LICENSE の本文と、依存のライセンス一覧。手元の開発では null */
	readonly legal: LegalInfo | null;
	/** カレンダー購読の URL のトークン */
	readonly feedTokens: FeedTokenStore;
	/** 公開 API と MCP サーバー向けの個人用アクセストークン */
	readonly accessTokens: AccessTokenStore;
	/** アカウントのデータの書き出しと、退会 */
	readonly account: AccountStore;
	/** 管理者が用意するテストアカウント (大学のアカウントでなくても、ログインして試せる) */
	readonly testAccounts: TestAccountStore;
	/** 大学のアカウントとして許すメールのドメイン (テストアカウントには使えない) */
	readonly universityDomains: readonly string[];
	/** MCP の認可 (OAuth 2.1)。同意の画面が、クライアントの確認と認可コードの発行に使う */
	readonly oauth: OAuthStore;
	/** 新規登録の方式。紹介の画面の案内に使う */
	readonly registration: 'invite' | 'open' | 'closed';
	/** 公開 URL の origin (ブックマークレットの戻り先に使う) */
	readonly origin: string;
	/** 同意を求めている利用規約とプライバシーポリシーの版 (最終更新日)。同意するまで、すべての機能を止める */
	readonly termsVersion: string;
	/** セルフホストの運営者の情報。設定されていなければ null */
	readonly operator: { readonly name: string; readonly url: string } | null;
	/** ロゴ、アイコン、OGP の画像を差し替えるディレクトリ。設定されていなければ null */
	readonly brandDir: string | null;
	/** 問い合わせ先のメールアドレス。設定されていなければ null */
	readonly contactEmail: string | null;
	/** 管理者への知らせ。秘密の値を含めない */
	readonly alertAdmin: (alert: {
		severity: 'info' | 'warn' | 'error';
		title: string;
		message?: string;
		key?: string;
		/** 送るチャンネル。省くと、error は errors、それ以外は sources */
		category?: AdminChannel;
	}) => Promise<unknown>;
	/** サーバーのログ。個人情報や秘密の値を含まない内容だけを書き込む */
	readonly log: Logger;
}

let services: Services | undefined;

export function setServices(value: Services): void {
	services = value;
}

export function getServices(): Services {
	if (!services) throw new Error('サーバーの準備が終わっていません');
	return services;
}
