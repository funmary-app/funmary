// DB のスキーマ。変えたら `pnpm --filter @funmary/db generate` でマイグレーションを作る。
// マイグレーションは列やテーブルを足す方向だけにし、1 つ前の版のアプリがそのまま動くようにする。
import { sql } from 'drizzle-orm';
import {
	type AnySQLiteColumn,
	index,
	integer,
	primaryKey,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/** 作成時刻。ミリ秒の UNIX 時刻で持つ */
const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.default(sql`(unixepoch('subsec') * 1000)`);

// ---------------------------------------------------------------------------
// アカウント

export const users = sqliteTable('users', {
	/** 推測できない乱数の ID */
	id: text('id').primaryKey(),
	email: text('email').notNull().unique(),
	/** Google の ID トークンの sub */
	googleSub: text('google_sub').notNull().unique(),
	name: text('name'),
	role: text('role', { enum: ['user', 'moderator', 'admin'] })
		.notNull()
		.default('user'),
	status: text('status', { enum: ['active', 'suspended'] })
		.notNull()
		.default('active'),
	invitedBy: text('invited_by').references((): AnySQLiteColumn => users.id, {
		onDelete: 'set null',
	}),
	inviteCodeId: integer('invite_code_id').references((): AnySQLiteColumn => inviteCodes.id, {
		onDelete: 'set null',
	}),
	createdAt: createdAt(),
	lastLoginAt: integer('last_login_at', { mode: 'timestamp_ms' }),
	/** 同意した利用規約とプライバシーポリシーの版 (最終更新日)。一度も同意していなければ null */
	termsAcceptedVersion: text('terms_accepted_version'),
	termsAcceptedAt: integer('terms_accepted_at', { mode: 'timestamp_ms' }),
});

/** 利用規約への同意の履歴。いつ、どの版に同意したかの記録で、消さない */
export const termsAcceptances = sqliteTable(
	'terms_acceptances',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		version: text('version').notNull(),
		acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.version] })],
);

/**
 * 管理者が用意するテストアカウント。大学のアカウントでない Google のアカウント (メールアドレス) で、
 * ログインして試せるようにする。管理者ごとに持ち、データは引き継がない (必要なときだけ、管理者のデータを写す)
 */
export const testAccounts = sqliteTable(
	'test_accounts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** 小文字にそろえて保存する。全体で 1 つだけ */
		email: text('email').notNull().unique(),
		createdAt: createdAt(),
	},
	(table) => [index('test_accounts_owner').on(table.ownerId)],
);

export const sessions = sqliteTable(
	'sessions',
	{
		/** セッション ID の SHA-256。ID そのものは Cookie にだけある */
		idHash: text('id_hash').primaryKey(),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: createdAt(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
	},
	(table) => [index('sessions_user_id').on(table.userId)],
);

export const inviteCodes = sqliteTable('invite_codes', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	/** 招待コードの SHA-256 */
	codeHash: text('code_hash').notNull().unique(),
	maxUses: integer('max_uses').notNull().default(1),
	usedCount: integer('used_count').notNull().default(0),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
	createdBy: text('created_by').references((): AnySQLiteColumn => users.id, {
		onDelete: 'set null',
	}),
	/** 誰に渡したかなどのメモ */
	note: text('note'),
	createdAt: createdAt(),
	revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
});

/**
 * 利用者ごとに付けた権限 (例: invite:create は招待コードの発行)。
 * 将来ロールを足すときは、ロールを権限の組として定義し、この表は個別に付けた分だけを持つ
 */
export const userPermissions = sqliteTable(
	'user_permissions',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		permission: text('permission', { enum: ['invite:create'] }).notNull(),
		grantedBy: text('granted_by').references((): AnySQLiteColumn => users.id, {
			onDelete: 'set null',
		}),
		grantedAt: integer('granted_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.permission] })],
);

// ---------------------------------------------------------------------------
// 科目と履修

export const subjects = sqliteTable(
	'subjects',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		academicYear: integer('academic_year').notNull(),
		/** シラバスの番号 */
		syllabusId: text('syllabus_id').notNull(),
		name: text('name').notNull(),
		teacher: text('teacher'),
		credits: integer('credits'),
		/** @funmary/core の Term */
		term: text('term').notNull(),
		/** 対象学年、必修か選択かなど、シラバスの表の項目 */
		attributes: text('attributes', { mode: 'json' }).$type<Record<string, string>>(),
		/** 授業の概要、到達目標、授業計画などの本文 */
		syllabus: text('syllabus', { mode: 'json' }).$type<Record<string, string>>(),
		syllabusUrl: text('syllabus_url'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
		/** syllabus は公開シラバスから取り込んだもの、user はシラバスにない授業として利用者か管理者が足したもの */
		source: text('source', { enum: ['syllabus', 'user'] })
			.notNull()
			.default('syllabus'),
		/** 足した人 (source が user のとき) */
		createdBy: text('created_by').references((): AnySQLiteColumn => users.id, {
			onDelete: 'set null',
		}),
		/**
		 * 公開範囲 (source が user のときだけ意味を持つ。syllabus は常に public)。Issue #164。
		 * public は誰でも探せる、link は URL を知っていれば開ける、private は足した人と管理者だけ
		 */
		visibility: text('visibility', { enum: ['public', 'link', 'private'] })
			.notNull()
			.default('public'),
	},
	(table) => [uniqueIndex('subjects_year_syllabus').on(table.academicYear, table.syllabusId)],
);

export const timetableSlots = sqliteTable(
	'timetable_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		subjectId: integer('subject_id')
			.notNull()
			.references(() => subjects.id, { onDelete: 'cascade' }),
		/** ISO 8601 の曜日。1 が月曜 */
		weekday: integer('weekday').notNull(),
		period: integer('period').notNull(),
		room: text('room'),
		/**
		 * 枠をどこから得たか。大学から自動では取れないので、利用者どうしで登録している。
		 * portal (利用者がポータルの時間割から取り込んだ)、manual (利用者が手で入力した)、pdf (管理者が時間割の PDF から取り込んだ)、admin (管理者が直した)
		 */
		source: text('source', { enum: ['portal', 'manual', 'pdf', 'admin'] })
			.notNull()
			.default('manual'),
		/** 登録した利用者。退会したら null */
		createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
	},
	(table) => [
		uniqueIndex('timetable_slots_unique').on(table.subjectId, table.weekday, table.period),
	],
);

export const courseRegistrations = sqliteTable(
	'course_registrations',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subjectId: integer('subject_id')
			.notNull()
			.references(() => subjects.id, { onDelete: 'cascade' }),
		hopeCourseUrl: text('hope_course_url'),
		/** 欠席の上限。利用者が決める */
		absenceLimit: integer('absence_limit'),
		createdAt: createdAt(),
	},
	(table) => [
		primaryKey({ columns: [table.userId, table.subjectId] }),
		index('course_registrations_subject').on(table.subjectId),
	],
);

/**
 * 利用者だけに見える、曜日と時限の書き換え。共有の timetable_slots は変えないので、ほかの利用者には影響しない。
 * 「だれでも共有の枠を登録できる」設定を絞っていても、これは誰でも使える
 */
export const personalTimetableSlots = sqliteTable(
	'personal_timetable_slots',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subjectId: integer('subject_id')
			.notNull()
			.references(() => subjects.id, { onDelete: 'cascade' }),
		weekday: integer('weekday').notNull(),
		period: integer('period').notNull(),
		room: text('room'),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [
		uniqueIndex('personal_timetable_slots_unique').on(
			table.userId,
			table.subjectId,
			table.weekday,
			table.period,
		),
	],
);

/** 利用者ごとの科目の略称。共有の科目名やほかの利用者の表示には影響しない */
export const subjectAbbreviations = sqliteTable(
	'subject_abbreviations',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subjectId: integer('subject_id')
			.notNull()
			.references(() => subjects.id, { onDelete: 'cascade' }),
		/** 空欄は正式名称を使う指定。未保存とは区別する */
		abbreviation: text('abbreviation').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.subjectId] })],
);

/**
 * 共有の枠を「モデレーターが確認してから登録する」設定のときに、確認を待つ提出。
 * 承認すると timetable_slots に入り、この記録は結果として残る (消さない)
 */
export const slotSubmissions = sqliteTable(
	'slot_submissions',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		subjectId: integer('subject_id')
			.notNull()
			.references(() => subjects.id, { onDelete: 'cascade' }),
		weekday: integer('weekday').notNull(),
		period: integer('period').notNull(),
		room: text('room'),
		/** 提出した利用者。退会したら null */
		submittedBy: text('submitted_by').references(() => users.id, { onDelete: 'set null' }),
		submittedAt: integer('submitted_at', { mode: 'timestamp_ms' }).notNull(),
		status: text('status', { enum: ['pending', 'approved', 'rejected'] })
			.notNull()
			.default('pending'),
		/** 承認、却下した人。退会したら null */
		decidedBy: text('decided_by').references((): AnySQLiteColumn => users.id, {
			onDelete: 'set null',
		}),
		decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
	},
	(table) => [index('slot_submissions_status').on(table.status, table.submittedAt)],
);

// ---------------------------------------------------------------------------
// 休講など

export const classChanges = sqliteTable(
	'class_changes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		kind: text('kind', { enum: ['cancellation', 'makeup', 'roomChange'] }).notNull(),
		/** 科目と照合できるまでは null */
		subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
		/** ポータルの表記のままの授業名 */
		lessonName: text('lesson_name').notNull(),
		date: text('date').notNull(),
		period: integer('period').notNull(),
		teacher: text('teacher'),
		campus: text('campus'),
		/** 補講の教室、または教室変更の移動先 */
		room: text('room'),
		/** 教室変更の移動元 */
		fromRoom: text('from_room'),
		comment: text('comment'),
		makeupPlan: text('makeup_plan', { enum: ['planned', 'none', 'undecided'] }),
		firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
		/** 一覧から続けて消えた回数。2 回で取り消しとみなす */
		missingCount: integer('missing_count').notNull().default(0),
		withdrawnAt: integer('withdrawn_at', { mode: 'timestamp_ms' }),
	},
	(table) => [
		uniqueIndex('class_changes_unique').on(table.kind, table.date, table.period, table.lessonName),
		index('class_changes_subject_date').on(table.subjectId, table.date),
	],
);

export const unmatchedLessons = sqliteTable(
	'unmatched_lessons',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		academicYear: integer('academic_year').notNull(),
		lessonName: text('lesson_name').notNull(),
		firstSeenAt: integer('first_seen_at', { mode: 'timestamp_ms' }).notNull(),
		lastSeenAt: integer('last_seen_at', { mode: 'timestamp_ms' }).notNull(),
		/** 管理者が「科目にしない」とした時刻。集会など、科目でない名前を一覧から外す */
		ignoredAt: integer('ignored_at', { mode: 'timestamp_ms' }),
		/** 管理者が手で紐付けた科目 */
		resolvedSubjectId: integer('resolved_subject_id').references(() => subjects.id, {
			onDelete: 'set null',
		}),
	},
	(table) => [uniqueIndex('unmatched_lessons_unique').on(table.academicYear, table.lessonName)],
);

/** 利用者が自分の時間割に足す予定 (Issue #144)。繰り返しは RRULE の文字列で持つ */
export const userEvents = sqliteTable(
	'user_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ownerId: text('owner_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		title: text('title').notNull(),
		location: text('location'),
		notes: text('notes'),
		/** 始まりの日と、終わりの日 (この日を含む)。単発なら同じ */
		startDate: text('start_date').notNull(),
		endDate: text('end_date').notNull(),
		timeKind: text('time_kind', { enum: ['allDay', 'time', 'period'] }).notNull(),
		startTime: text('start_time'),
		endTime: text('end_time'),
		startPeriod: integer('start_period'),
		endPeriod: integer('end_period'),
		/** RFC 5545 の RRULE の値。繰り返さないなら null */
		rrule: text('rrule'),
		/** 繰り返しから除く日 ("YYYY-MM-DD" の配列) */
		excludedDates: text('excluded_dates', { mode: 'json' }).$type<string[]>().notNull().default([]),
		/** 公開範囲。private は本人だけ、link は共有のリンクを知っている人、public はログインしている全員 */
		visibility: text('visibility', { enum: ['private', 'link', 'public'] })
			.notNull()
			.default('private'),
		/** 限定公開 (link) の共有のリンクの値。限定公開でなければ null。再発行すると変わる */
		shareToken: text('share_token').unique(),
		createdAt: createdAt(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [
		index('user_events_owner').on(table.ownerId, table.startDate),
		index('user_events_public').on(table.visibility),
	],
);

/**
 * 予定や科目を、特定のメールアドレスの人にだけ見せる (限定公開、メールアドレスでの指定)。
 * メールアドレスは、登録済みの利用者のものかどうかを確かめずに保存する (存在するかしないかを教えないため)。
 * 見る側は、自分のログインのメールアドレスと照らし合わせたときだけ開ける
 */
export const accessGrants = sqliteTable(
	'access_grants',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		resourceType: text('resource_type', { enum: ['event', 'subject'] }).notNull(),
		resourceId: integer('resource_id').notNull(),
		/** 小文字にそろえて保存する */
		granteeEmail: text('grantee_email').notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex('access_grants_unique').on(
			table.resourceType,
			table.resourceId,
			table.granteeEmail,
		),
		index('access_grants_email').on(table.granteeEmail),
	],
);

/** ほかの人の予定を、自分の時間割に加えたもの (Issue #145)。持ち主が直すと、加えた人にも反映される */
export const eventSubscriptions = sqliteTable(
	'event_subscriptions',
	{
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		eventId: integer('event_id')
			.notNull()
			.references(() => userEvents.id, { onDelete: 'cascade' }),
		createdAt: createdAt(),
	},
	(table) => [primaryKey({ columns: [table.userId, table.eventId] })],
);

// ---------------------------------------------------------------------------
// 暦

/** 値の出どころ */
const sourceKinds = ['auto', 'manual', 'estimated'] as const;

export const academicTerms = sqliteTable(
	'academic_terms',
	{
		academicYear: integer('academic_year').notNull(),
		term: text('term').notNull(),
		start: text('start').notNull(),
		end: text('end').notNull(),
		source: text('source', { enum: sourceKinds }).notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
	},
	(table) => [primaryKey({ columns: [table.academicYear, table.term] })],
);

export const academicDays = sqliteTable(
	'academic_days',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		date: text('date').notNull(),
		/** 振替授業日、全学の休講日、行事 */
		kind: text('kind', { enum: ['substitute', 'noClass', 'event'] }).notNull(),
		/** 振替授業日に行う曜日 */
		weekday: integer('weekday'),
		label: text('label'),
		source: text('source', { enum: sourceKinds }).notNull(),
	},
	(table) => [uniqueIndex('academic_days_unique').on(table.date, table.kind)],
);

export const holidays = sqliteTable('holidays', {
	date: text('date').primaryKey(),
	name: text('name').notNull(),
	source: text('source', { enum: ['cabinetOffice', 'bundled', 'estimated'] }).notNull(),
});

// ---------------------------------------------------------------------------
// 利用者の記録

export const absences = sqliteTable(
	'absences',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		subjectId: integer('subject_id')
			.notNull()
			.references(() => subjects.id, { onDelete: 'cascade' }),
		date: text('date').notNull(),
		period: integer('period').notNull(),
		createdAt: createdAt(),
	},
	(table) => [
		uniqueIndex('absences_unique').on(table.userId, table.subjectId, table.date, table.period),
	],
);

/** ICS とフィードの URL のトークン */
export const feedTokens = sqliteTable(
	'feed_tokens',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind', { enum: ['calendar', 'feed'] }).notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		/** 載せる予定や通知の種類など */
		options: text('options', { mode: 'json' }).$type<Record<string, unknown>>(),
		createdAt: createdAt(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
	},
	(table) => [index('feed_tokens_user').on(table.userId)],
);

/** 公開 API と MCP サーバー向けの個人用アクセストークン。1 人が複数を同時に持てる */
export const accessTokens = sqliteTable(
	'access_tokens',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/** どこで使うかの、本人のためのメモ */
		name: text('name').notNull(),
		tokenHash: text('token_hash').notNull().unique(),
		/** read:lessons、read:changes、read:notifications など */
		scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: createdAt(),
		lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
	},
	(table) => [index('access_tokens_user').on(table.userId)],
);

/** MCP の認可で、動的に登録されたクライアント (Claude など)。公開クライアントなので、秘密は持たない */
export const oauthClients = sqliteTable('oauth_clients', {
	/** client_id。推測できない乱数 */
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	redirectUris: text('redirect_uris', { mode: 'json' }).notNull().$type<string[]>(),
	createdAt: createdAt(),
});

/** 認可コード。1 回使うと消える。コードそのものでなく、ハッシュを保存する */
export const oauthCodes = sqliteTable('oauth_codes', {
	codeHash: text('code_hash').primaryKey(),
	clientId: text('client_id')
		.notNull()
		.references(() => oauthClients.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	redirectUri: text('redirect_uri').notNull(),
	/** PKCE の code_challenge (S256) */
	codeChallenge: text('code_challenge').notNull(),
	scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
	expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	createdAt: createdAt(),
});

/** リフレッシュトークン。使うたびに新しいものに替え、同じ系列 (familyId) でまとめて無効にできる */
export const oauthRefreshTokens = sqliteTable(
	'oauth_refresh_tokens',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		tokenHash: text('token_hash').notNull().unique(),
		familyId: text('family_id').notNull(),
		clientId: text('client_id')
			.notNull()
			.references(() => oauthClients.id, { onDelete: 'cascade' }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		scopes: text('scopes', { mode: 'json' }).notNull().$type<string[]>(),
		/** 一緒に発行したアクセストークン。設定の画面で無効にされたら、このリフレッシュも使えなくする */
		accessTokenId: integer('access_token_id').references(() => accessTokens.id, {
			onDelete: 'set null',
		}),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
		createdAt: createdAt(),
		/** 新しいものに替えた日時。これが入ったトークンがまた来たら、盗まれたとみなす */
		usedAt: integer('used_at', { mode: 'timestamp_ms' }),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
	},
	(table) => [index('oauth_refresh_tokens_family').on(table.familyId)],
);

export const shares = sqliteTable(
	'shares',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		tokenHash: text('token_hash').notNull().unique(),
		visibility: text('visibility', { enum: ['anyone', 'signedIn'] }).notNull(),
		showRooms: integer('show_rooms', { mode: 'boolean' }).notNull().default(true),
		showChanges: integer('show_changes', { mode: 'boolean' }).notNull().default(true),
		expiresAt: integer('expires_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt(),
		revokedAt: integer('revoked_at', { mode: 'timestamp_ms' }),
	},
	(table) => [index('shares_user').on(table.userId)],
);

export const hopeCalendars = sqliteTable('hope_calendars', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	/** HOPE の書き出しの URL。本人用のトークンを含むので暗号化する */
	urlEncrypted: text('url_encrypted').notNull(),
	etag: text('etag'),
	lastModified: text('last_modified'),
	lastFetchedAt: integer('last_fetched_at', { mode: 'timestamp_ms' }),
	consecutiveFailures: integer('consecutive_failures').notNull().default(0),
});

export const hopeEvents = sqliteTable(
	'hope_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		uid: text('uid').notNull(),
		title: text('title').notNull(),
		dueAt: integer('due_at', { mode: 'timestamp_ms' }).notNull(),
		courseName: text('course_name'),
		url: text('url'),
	},
	(table) => [uniqueIndex('hope_events_unique').on(table.userId, table.uid)],
);

// ---------------------------------------------------------------------------
// 利用者の Discord 連携

/**
 * 利用者の Discord アカウントと Funmary のアカウントの紐付け。1 人につき 1 行。
 * トークンは暗号化して保存する。解除すると行ごと消す (再連携できるようにするため)
 */
export const discordLinks = sqliteTable('discord_links', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	/** Discord のユーザー ID。1 つの Discord アカウントは 1 人にしか紐付けられない */
	discordUserId: text('discord_user_id').notNull().unique(),
	accessTokenEncrypted: text('access_token_encrypted').notNull(),
	refreshTokenEncrypted: text('refresh_token_encrypted').notNull(),
	tokenExpiresAt: integer('token_expires_at', { mode: 'timestamp_ms' }).notNull(),
	/** 本人だけの非公開スレッドの ID。まだ用意していない、完全に削除したあとは null */
	threadChannelId: text('thread_channel_id'),
	/** DM チャンネルの ID。まだ用意していない間は null */
	dmChannelId: text('dm_channel_id'),
	/**
	 * 通知の種類ごとの送り先とメンション (#163)。
	 * JSON (Partial<Record<NotificationKind, { destination: 'thread' | 'dm' | 'both'; mention: boolean }>>)。
	 * 無い種類は、スレッド、メンション無しとみなす
	 */
	kindSettings: text('kind_settings', { mode: 'json' }).$type<Record<string, unknown>>(),
	createdAt: createdAt(),
});

/**
 * 予定のまとめ (今日か明日の授業と予定を Discord に送るもの、#207) の、利用者ごとの設定。
 * 行がなければ既定の設定 (@funmary/core の DEFAULT_DAILY_DIGEST_SETTINGS) とみなす。列の既定値もそれに合わせる
 */
export const dailyDigestSettings = sqliteTable('daily_digest_settings', {
	userId: text('user_id')
		.primaryKey()
		.references(() => users.id, { onDelete: 'cascade' }),
	enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
	timing: text('timing', { enum: ['evening', 'morning', 'custom'] })
		.notNull()
		.default('evening'),
	/** timing が custom のときの、日本時間の "HH:MM" */
	customTime: text('custom_time').notNull().default('20:30'),
	customDay: text('custom_day', { enum: ['today', 'tomorrow'] })
		.notNull()
		.default('tomorrow'),
	sendWhenEmpty: integer('send_when_empty', { mode: 'boolean' }).notNull().default(true),
	/** 前に送ったまとめの、対象の日 (YYYY-MM-DD)。同じ日の分を 2 回送らないために使う */
	lastSentFor: text('last_sent_for'),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

// ---------------------------------------------------------------------------
// 通知

export const notifications = sqliteTable(
	'notifications',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		kind: text('kind').notNull(),
		title: text('title').notNull(),
		body: text('body'),
		/** 押したときに開く画面のパス */
		link: text('link'),
		subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
		/** 授業の日付 (YYYY-MM-DD)。休講などの通知のときだけ持つ。汎用 Webhook の構造化データに使う */
		date: text('date'),
		/** 授業の時限。休講などの通知のときだけ持つ */
		period: integer('period'),
		/** 同じ出来事を二重に通知しないための鍵 (例: class-change:12)。利用者ごとに一意 */
		dedupeKey: text('dedupe_key'),
		createdAt: createdAt(),
		readAt: integer('read_at', { mode: 'timestamp_ms' }),
	},
	(table) => [
		index('notifications_user_created').on(table.userId, table.createdAt),
		uniqueIndex('notifications_user_dedupe').on(table.userId, table.dedupeKey),
	],
);

export const channels = sqliteTable(
	'channels',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		/**
		 * discord は利用者が登録した Discord の Webhook、generic は利用者が自分で用意した Webhook、
		 * discordLink は Discord 連携 (Bot が送る) の送り先
		 */
		kind: text('kind', { enum: ['discord', 'generic', 'discordLink', 'push', 'email'] }).notNull(),
		/** Webhook の URL (と、generic の署名の鍵) やプッシュ通知の購読情報。暗号化する。discordLink は送り先を discord_links から引くので、中身は使わない */
		configEncrypted: text('config_encrypted').notNull(),
		label: text('label'),
		/** このチャネルに送る通知の種類 */
		notificationKinds: text('notification_kinds', { mode: 'json' }).$type<string[]>(),
		status: text('status', { enum: ['active', 'disabled'] })
			.notNull()
			.default('active'),
		disabledReason: text('disabled_reason'),
		createdAt: createdAt(),
	},
	(table) => [index('channels_user').on(table.userId)],
);

export const deliveries = sqliteTable(
	'deliveries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		notificationId: integer('notification_id')
			.notNull()
			.references(() => notifications.id, { onDelete: 'cascade' }),
		channelId: integer('channel_id')
			.notNull()
			.references(() => channels.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['pending', 'sent', 'failed'] })
			.notNull()
			.default('pending'),
		attempts: integer('attempts').notNull().default(0),
		nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
		lastError: text('last_error'),
		sentAt: integer('sent_at', { mode: 'timestamp_ms' }),
		failedAt: integer('failed_at', { mode: 'timestamp_ms' }),
	},
	(table) => [
		// 同じ通知が同じチャネルに二重に届かないようにする
		uniqueIndex('deliveries_unique').on(table.notificationId, table.channelId),
		index('deliveries_pending').on(table.status, table.nextAttemptAt),
	],
);

// ---------------------------------------------------------------------------
// 運用

/** 取得元の見張り */
export const sourceStatus = sqliteTable('source_status', {
	source: text('source').primaryKey(),
	lastSuccessAt: integer('last_success_at', { mode: 'timestamp_ms' }),
	lastAttemptAt: integer('last_attempt_at', { mode: 'timestamp_ms' }),
	consecutiveFailures: integer('consecutive_failures').notNull().default(0),
	nextAttemptAt: integer('next_attempt_at', { mode: 'timestamp_ms' }),
	lastError: text('last_error'),
	/** 前回取得した内容のハッシュ。同じなら解析を省く */
	contentHash: text('content_hash'),
});

/** 時限の時刻など、管理画面で変える値 */
export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value', { mode: 'json' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const jobRuns = sqliteTable(
	'job_runs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		job: text('job').notNull(),
		startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
		finishedAt: integer('finished_at', { mode: 'timestamp_ms' }),
		status: text('status', { enum: ['running', 'succeeded', 'failed', 'skipped'] }).notNull(),
		message: text('message'),
	},
	(table) => [index('job_runs_job_started').on(table.job, table.startedAt)],
);

/**
 * 利用者が全体に影響する操作 (シラバスにない授業の公開、情報の変更、削除、授業名の紐づけなど) をしたときの記録。
 * 消せない (管理画面でも削除の口は作らない)。行った人が退会しても、記録は summary の文だけ残す
 */
export const auditLogEntries = sqliteTable(
	'audit_log_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		/** 行った人。管理用コマンドなど、利用者によらない操作なら null */
		actorId: text('actor_id').references((): AnySQLiteColumn => users.id, { onDelete: 'set null' }),
		/** 操作の種類。例: subject.create、subject.update、subject.delete、lesson.resolve */
		action: text('action').notNull(),
		/** 関わった科目 (あれば)。科目を消しても記録は残す */
		subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
		/** 画面に出す一言。個人情報 (氏名、学籍番号、メールアドレス) は入れない */
		summary: text('summary').notNull(),
		createdAt: createdAt(),
	},
	(table) => [index('audit_log_entries_created').on(table.createdAt)],
);
