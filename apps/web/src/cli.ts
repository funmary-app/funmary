// 管理用コマンド。手元では pnpm funmary-admin <コマンド>、本番では funmary-admin <コマンド> で使う。
// 秘密の値は画面に出さない。出すのは変数の名前だけにする。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineCommand, runMain } from 'citty';
import {
	backupDatabase,
	createAcademicCalendarStore,
	createAuditLogStore,
	createAuthStore,
	createHolidayStore,
	createSettingsStore,
	createSourceHealthStore,
	createCourseStore,
	createJobRunStore,
	createSubjectStore,
	createUnmatchedLessonStore,
	openDatabase,
	restoreDatabase,
	type Database,
} from '@funmary/db';
import { createJobRunner } from '@funmary/jobs';
// 入口 (@funmary/sources) からだと、取得の部品と依存まで cli.js にまとまるので、PDF の読み取りだけを読み込む
import { parseTimetablePdf } from '@funmary/sources/timetable-pdf';
import { parseAcademicCalendarPdf } from '@funmary/sources/academic-calendar-pdf';
import { academicYearOf, jstDateTime, resolveAcademicTerms } from '@funmary/core';
import { createLogger } from '@funmary/log';
import {
	ADMIN_CHANNELS,
	createAdminAlerter,
	createAdminDiscordSink,
	createDiscordBot,
	parseLayout,
	registerSlashCommands,
	type AdminChannel,
} from '@funmary/notify';
import { sendAdminNotification } from './lib/server/admin-notify.ts';
import { DISCORD_LAYOUT_KEY } from './lib/server/discord-admin.ts';
import { importAcademicCalendar } from './lib/server/academic-calendar-import.ts';
import { formatCalendarImportReport, formatCalendarReport } from './lib/server/calendar-report.ts';
import { formatSourcesReport, sourceStatuses } from './lib/server/source-status.ts';
import { parseConfig, type Config } from './lib/server/config.ts';
import { alignEnvFile, fillSecrets, generateSecrets } from './lib/server/env-file.ts';
import { JOB_LABELS, SERVER_ONLY_JOBS, createJobDefinitions } from './lib/server/jobs.ts';
import { findMigrationsFolder } from './lib/server/migrations-path.ts';
import { registrationLabel } from './lib/registration.ts';
import { readRegistration } from './lib/server/registration.ts';
import { importTimetable, type TimetableImportReport } from './lib/server/timetable-import.ts';
import {
	ROLE_LABELS,
	changeRole,
	changeStatus,
	formatUserList,
	parseRole,
} from './lib/server/user-admin.ts';

/** リリースでは cli.js の隣に migrations を置く。TypeScript のまま動かす手元にはないので、DB のパッケージの既定に任せる */
const bundledMigrations = findMigrationsFolder(dirname(fileURLToPath(import.meta.url)));

/** 手元の開発では .env を読む。本番では systemd やラッパーが環境変数を渡すので読まない */
function loadDevelopmentEnv(): void {
	if (process.env['NODE_ENV'] !== 'production' && existsSync('.env')) {
		process.loadEnvFile('.env');
	}
}

/** 設定を読む。足りない値や誤りがあれば、直し方を示して終える */
function loadConfigOrExit(): Config {
	loadDevelopmentEnv();
	const result = parseConfig(process.env);
	if (result.ok) return result.config;
	console.error('環境変数に足りない値か誤りがあります。次の変数を直してください。');
	for (const issue of result.issues) console.error(`  ${issue.name}: ${issue.message}`);
	process.exit(1);
}

function openConfiguredDatabase(config: Config): Database {
	return openDatabase(join(config.dataDir, 'funmary.db'), {
		backupDir: join(config.dataDir, 'backups'),
		...(bundledMigrations && { migrationsFolder: bundledMigrations }),
	});
}

/** 管理用の Discord への知らせ。Bot があれば Bot、なければ Webhook に送る (サーバーと同じ) */
function createCliAlerter(config: Config, database: Database) {
	const bot = config.discordBot ? createDiscordBot(config.discordBot) : null;
	const settings = createSettingsStore(database);
	return createAdminAlerter({
		webhookUrl: config.adminDiscordWebhookUrl,
		...(bot
			? {
					discord: createAdminDiscordSink({
						bot,
						layout: () => parseLayout(settings.get(DISCORD_LAYOUT_KEY)),
					}),
				}
			: {}),
		dryRun: config.notifyDryRun,
		log: createLogger({ level: 'error', format: 'text', mode: 'production' }),
	});
}

const init = defineCommand({
	meta: {
		name: 'init',
		description: '環境変数ファイルの空の鍵を作って埋める。値のある行は変えない',
	},
	args: {
		file: {
			type: 'string',
			description: '書き換える環境変数ファイル。なければ .env.example から作る',
			default: '.env',
		},
	},
	run({ args }) {
		const exists = existsSync(args.file);
		const text = exists
			? readFileSync(args.file, 'utf8')
			: existsSync('.env.example')
				? readFileSync('.env.example', 'utf8')
				: '';
		const result = fillSecrets(text, generateSecrets);
		if (exists && result.filled.length === 0) {
			console.log(`${args.file} の鍵はすべて埋まっています。何も変えていません。`);
			return;
		}
		// 既存のファイルは上書きしても所有者と権限が変わらない。新しく作るときは自分だけが読めるようにする
		writeFileSync(args.file, result.text, exists ? {} : { mode: 0o600 });
		console.log(`${args.file} に次の鍵を書きました: ${result.filled.join(', ')}`);
		console.log('Google の値は、自分で書いてください。');
	},
});

const alignEnv = defineCommand({
	meta: {
		name: 'align-env',
		description:
			'環境変数ファイルの並びを .env.example に合わせる。値のある行の値は変えない (足りない鍵を足し、並び替えるだけ)',
	},
	args: {
		file: { type: 'string', description: '並びを揃える環境変数ファイル', default: '.env' },
		template: { type: 'string', description: '並びのお手本', default: '.env.example' },
	},
	run({ args }) {
		if (!existsSync(args.file)) {
			console.error(`${args.file} がありません。先に funmary-admin init で作ってください。`);
			process.exit(1);
		}
		if (!existsSync(args.template)) {
			console.error(`${args.template} がありません。`);
			process.exit(1);
		}
		const current = readFileSync(args.file, 'utf8');
		const template = readFileSync(args.template, 'utf8');
		const result = alignEnvFile(current, template);
		if (result.text === current) {
			console.log(`${args.file} は、すでに ${args.template} と同じ並びです。何も変えていません。`);
			return;
		}
		const backupPath = `${args.file}.bak.${new Date().toISOString().replaceAll(/[:.]/g, '-')}`;
		writeFileSync(backupPath, current);
		writeFileSync(args.file, result.text);
		console.log(
			`${args.file} の並びを ${args.template} に合わせました (${backupPath} に元の内容を残しました)`,
		);
		if (result.added.length > 0) {
			console.log(`空のまま足した鍵: ${result.added.join(', ')}`);
		}
		if (result.extra.length > 0) {
			console.log(
				`${args.template} にない鍵を末尾に残しました (値はそのまま): ${result.extra.join(', ')}`,
			);
		}
	},
});

const migrate = defineCommand({
	meta: { name: 'migrate', description: 'DB のマイグレーションを行う (起動時にも自動で行われる)' },
	run() {
		const config = loadConfigOrExit();
		mkdirSync(config.dataDir, { recursive: true });
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		database.close();
		console.log(`${join(config.dataDir, 'funmary.db')} のマイグレーションを終えました。`);
	},
});

const backup = defineCommand({
	meta: {
		name: 'backup',
		description: 'DB のバックアップを取る。古い日ごとのバックアップは 14 個まで残す',
	},
	run() {
		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			const file = backupDatabase(database, join(config.dataDir, 'backups'), { now: new Date() });
			console.log(`バックアップを作りました: ${file}`);
		} finally {
			database.close();
		}
	},
});

const restore = defineCommand({
	meta: {
		name: 'restore',
		description: 'バックアップから DB を戻す。先に systemctl stop funmary でアプリを止めておく',
	},
	args: {
		file: { type: 'positional', description: '戻すバックアップのファイル', required: true },
	},
	run({ args }) {
		const config = loadConfigOrExit();
		const kept = restoreDatabase(join(config.dataDir, 'funmary.db'), args.file, {
			now: new Date(),
		});
		console.log(`戻しました。それまでの DB は ${kept} に残してあります。`);
		console.log('systemctl start funmary でアプリを起動してください。');
	},
});

const WEEKDAYS = ['', '月', '火', '水', '木', '金', '土'];
const METHOD_LABELS = {
	exact: '完全一致',
	normalized: '表記の揺れを除いて一致',
	'old-name-removed': '旧名を除いて一致',
	alias: '略称を言い換えて一致',
	split: 'まとめて書かれたコマを分けて一致',
	manual: '管理画面で紐付け済み',
} as const;

/** 取り込みの結果を、管理者が確かめられる形で出す */
function printTimetableReport(
	report: Extract<TimetableImportReport, { kind: 'planned' }>,
	subjectName: (id: number) => string,
): void {
	const term = report.term === 'spring' ? '前期' : report.term === 'fall' ? '後期' : '学期不明';
	console.log(`${report.academicYear} 年度 ${term} の時間割`);
	for (const warning of report.warnings) console.log(`  警告: ${warning}`);

	const counts = new Map<string, number>();
	for (const slot of report.slots) {
		counts.set(slot.method, (counts.get(slot.method) ?? 0) + 1);
	}
	console.log(
		`枠 ${report.slots.length} 件 (` +
			Object.entries(METHOD_LABELS)
				.map(([method, label]) => `${label} ${counts.get(method) ?? 0}`)
				.join('、') +
			')',
	);
	// 完全一致でないものは、取り違えがないかを人が確かめる
	for (const slot of report.slots.filter((s) => s.method !== 'exact')) {
		console.log(
			`  ${METHOD_LABELS[slot.method]}: ${slot.lessonName} → ${subjectName(slot.subjectId)} (${WEEKDAYS[slot.weekday]} ${slot.period} 限)`,
		);
	}
	console.log(`照合できなかった名前 ${report.unmatched.length} 件`);
	for (const item of report.unmatched) {
		if (item.reason === 'similar') {
			console.log(
				`  似た科目だけあり: ${item.lessonName} (似た科目: ${subjectName(item.candidateId)})`,
			);
		} else {
			console.log(
				`  ${item.reason === 'ambiguous' ? '候補が複数' : '候補なし'}: ${item.lessonName}`,
			);
		}
	}

	if (!report.applied) {
		console.log(
			'確かめただけで、DB には書き込んでいません。書き込むには --apply を付けてください。',
		);
		return;
	}
	const { added, updated, conflicts, newUnmatched } = report.applied;
	console.log(
		`書き込みました: 枠を ${added} 件足し、空だった教室を ${updated} 件埋めました。` +
			`照合できなかった名前を ${newUnmatched} 件、新しく記録しました。`,
	);
	if (conflicts.length > 0) {
		console.log(`既にある枠と教室が違うもの ${conflicts.length} 件 (上書きしていません)`);
		for (const c of conflicts) {
			console.log(
				`  ${subjectName(c.subjectId)} ${WEEKDAYS[c.weekday]} ${c.period} 限: 登録済み ${c.existingRoom ?? '(なし)'}、PDF ${c.importedRoom ?? '(なし)'}`,
			);
		}
	}
}

const timetableImport = defineCommand({
	meta: {
		name: 'import',
		description:
			'授業時間割の PDF を読み、科目と照合して、科目ごとに共有する枠に取り込む。--apply がなければ確かめるだけ',
	},
	args: {
		file: { type: 'positional', description: '授業時間割の PDF', required: true },
		apply: { type: 'boolean', description: 'DB に書き込む', default: false },
		year: { type: 'string', description: '年度 (PDF の表題から読めないときに指定する)' },
		'ignore-warnings': {
			type: 'boolean',
			description: '読み取りに警告があっても書き込む (内容を確かめてから使う)',
			default: false,
		},
	},
	async run({ args }) {
		const year = args.year === undefined ? undefined : Number(args.year);
		if (year !== undefined && !Number.isInteger(year)) {
			console.error(`年度は数字で指定してください: ${args.year}`);
			process.exit(1);
		}
		const parsed = await parseTimetablePdf(new Uint8Array(readFileSync(args.file)));
		if (parsed.kind === 'invalid') {
			console.error(`時間割の PDF として読めませんでした: ${parsed.reason}`);
			process.exit(1);
		}
		console.log(
			`PDF から ${parsed.entries.length} コマを読みました (更新日 ${parsed.updatedOn ?? '不明'}、` +
				`クラスのあるコマ ${Math.round(parsed.quality.classRatio * 100)}%、` +
				`部屋のあるコマ ${Math.round(parsed.quality.roomRatio * 100)}%)`,
		);

		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			const subjects = createSubjectStore(database);
			const report = importTimetable(
				parsed,
				{
					subjects,
					courses: createCourseStore(database),
					unmatched: createUnmatchedLessonStore(database),
				},
				{
					apply: args.apply,
					now: new Date(),
					ignoreWarnings: args['ignore-warnings'],
					...(year !== undefined && { academicYear: year }),
				},
			);
			switch (report.kind) {
				case 'no-year':
					console.error('PDF の表題から年度を読めませんでした。--year で指定してください。');
					process.exitCode = 1;
					return;
				case 'no-subjects':
					console.error(
						`${report.academicYear} 年度の科目がまだありません。先に定期処理 import-syllabus で公開シラバスを取り込んでください。`,
					);
					process.exitCode = 1;
					return;
				case 'has-warnings':
					console.error('読み取りに警告があるので、書き込みませんでした。');
					for (const warning of report.warnings) console.error(`  ${warning}`);
					console.error('内容を確かめたうえで書き込むなら、--ignore-warnings を付けてください。');
					process.exitCode = 1;
					return;
				case 'planned':
					printTimetableReport(report, (id) => subjects.findById(id)?.name ?? `(科目 ${id})`);
			}
		} finally {
			database.close();
		}
	},
});

const timetable = defineCommand({
	meta: { name: 'timetable', description: '科目ごとに共有する時間割の枠を扱う' },
	subCommands: { import: timetableImport },
});

const calendarShow = defineCommand({
	meta: {
		name: 'show',
		description: '学期の期間 (値の出どころ付き)、振替授業日、全学の休講日を表示する',
	},
	args: {
		year: { type: 'string', description: '年度。省くと今日の年度' },
	},
	run({ args }) {
		const academicYear =
			args.year === undefined ? academicYearOf(jstDateTime(new Date()).date) : Number(args.year);
		if (!Number.isInteger(academicYear)) {
			console.error(`年度は数字で指定してください: ${args.year}`);
			process.exit(1);
		}
		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			const calendar = createAcademicCalendarStore(database);
			const start = `${academicYear}-04-01`;
			const end = `${academicYear + 1}-03-31`;
			const lines = formatCalendarReport({
				academicYear,
				terms: resolveAcademicTerms(academicYear, calendar.listTerms(academicYear)),
				substituteDays: calendar.listSubstituteDays(start, end),
				noClassDays: calendar.listNoClassDays(start, end),
			});
			for (const line of lines) console.log(line);
		} finally {
			database.close();
		}
	},
});

const calendarImport = defineCommand({
	meta: {
		name: 'import',
		description:
			'大学の学年暦の PDF を読み、学期の期間、振替授業日、全学の休講日を取り込む。--apply がなければ確かめるだけ',
	},
	args: {
		file: { type: 'positional', description: '学年暦の PDF', required: true },
		apply: { type: 'boolean', description: 'DB に書き込む', default: false },
		'ignore-warnings': {
			type: 'boolean',
			description: '読み取りに警告があっても書き込む (内容を確かめてから使う)',
			default: false,
		},
	},
	async run({ args }) {
		const parsed = await parseAcademicCalendarPdf(new Uint8Array(readFileSync(args.file)));
		if (parsed.kind === 'invalid') {
			console.error(`学年暦の PDF として読めませんでした: ${parsed.reason}`);
			process.exit(1);
		}
		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			// 祝日は保存されたものだけを使う (内閣府の CSV には翌年の分まで載っている)。
			// 漏れた祝日が休講日に入っても、授業がない日として同じに扱われる
			const holidays = createHolidayStore(database).list();
			if (holidays.length === 0) {
				console.log('祝日がまだ保存されていないので、休講日から祝日を除いていません。');
			}
			const report = importAcademicCalendar(
				parsed,
				{
					calendar: createAcademicCalendarStore(database),
					holidays: holidays.map((holiday) => holiday.date),
				},
				{ apply: args.apply, now: new Date(), ignoreWarnings: args['ignore-warnings'] },
			);
			if (report.kind === 'has-warnings') {
				console.error('読み取りに警告があるので、書き込みませんでした。');
				for (const warning of report.warnings) console.error(`  ${warning}`);
				console.error('内容を確かめたうえで書き込むなら、--ignore-warnings を付けてください。');
				process.exitCode = 1;
				return;
			}
			for (const line of formatCalendarImportReport(report)) console.log(line);
		} finally {
			database.close();
		}
	},
});

const calendar = defineCommand({
	meta: { name: 'calendar', description: '学年暦 (学期の期間、振替授業日、全学の休講日) を扱う' },
	subCommands: { show: calendarShow, import: calendarImport },
});

const inviteCreate = defineCommand({
	meta: {
		name: 'create',
		description:
			'招待コードを発行する。コードは DB にハッシュだけを保存するので、ここで 1 回だけ出す',
	},
	args: {
		uses: { type: 'string', description: '使用回数の上限 (1 から 100)', default: '1' },
		days: {
			type: 'string',
			description: '期限までの日数 (1 から 365)。0 なら期限なし',
			default: '30',
		},
		note: { type: 'string', description: '誰に渡したかなどのメモ' },
	},
	run({ args }) {
		const uses = Number(args.uses);
		const days = Number(args.days);
		if (!Number.isInteger(uses) || uses < 1 || uses > 100) {
			console.error(`使用回数は 1 から 100 の整数で指定してください: ${args.uses}`);
			process.exit(1);
		}
		if (!Number.isInteger(days) || days < 0 || days > 365) {
			console.error(`期限の日数は 0 から 365 の整数で指定してください: ${args.days}`);
			process.exit(1);
		}
		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			const now = new Date();
			const expiresAt = days === 0 ? null : new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
			const code = createAuthStore(database).createInviteCode(
				{ maxUses: uses, expiresAt, note: args.note?.trim() || null },
				now,
			);
			const origin = config.origin ?? 'http://localhost:5173';
			console.log(`招待コード: ${code}`);
			console.log(`登録の URL: ${origin}/signup?code=${encodeURIComponent(code)}`);
			console.log(
				`使用回数 ${uses} 回、期限 ${expiresAt ? `${jstDateTime(expiresAt).date} ${jstDateTime(expiresAt).time} (日本時間)` : 'なし'}`,
			);
			const registration = readRegistration(createSettingsStore(database));
			if (registration !== 'invite') {
				console.log(
					`いまの登録の方式は「${registrationLabel(registration)}」なので、招待コードは登録に使われません (管理画面の「登録と招待」で変えられます)。`,
				);
			}
		} finally {
			database.close();
		}
	},
});

const invite = defineCommand({
	meta: { name: 'invite', description: '招待コードを扱う' },
	subCommands: { create: inviteCreate },
});

const sourcesStatus = defineCommand({
	meta: { name: 'status', description: '取得元ごとの最終成功時刻と、連続の失敗回数を表示する' },
	run() {
		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			const rows = sourceStatuses(createSourceHealthStore(database).list());
			for (const line of formatSourcesReport(rows)) console.log(line);
			console.log('時刻は日本時間です。');
		} finally {
			database.close();
		}
	},
});

const sources = defineCommand({
	meta: { name: 'sources', description: '取得元 (ポータル、シラバス、祝日) の状態を扱う' },
	subCommands: { status: sourcesStatus },
});

const notify = defineCommand({
	meta: {
		name: 'notify',
		description:
			'管理用の Discord に通知を送る (update.sh が使う)。終了コード 0 = 送った、3 = 送り先がない、1 = 送れなかった',
	},
	args: {
		channel: {
			type: 'string',
			description: `送るチャンネル (${ADMIN_CHANNELS.join('、')})`,
			default: 'other',
		},
		severity: { type: 'string', description: 'info、warn、error のどれか', default: 'info' },
		message: { type: 'positional', description: '本文', required: true },
	},
	async run({ args }) {
		const channel = ADMIN_CHANNELS.find((candidate: AdminChannel) => candidate === args.channel);
		const severity = (['info', 'warn', 'error'] as const).find(
			(candidate) => candidate === args.severity,
		);
		if (!channel || !severity) {
			console.error(
				`--channel は ${ADMIN_CHANNELS.join('、')}、--severity は info、warn、error のどれかにしてください`,
			);
			process.exit(2);
		}
		const config = loadConfigOrExit();
		const database = openDatabase(join(config.dataDir, 'funmary.db'), {
			backupDir: join(config.dataDir, 'backups'),
			...(bundledMigrations && { migrationsFolder: bundledMigrations }),
		});
		try {
			const layout = parseLayout(createSettingsStore(database).get(DISCORD_LAYOUT_KEY));
			const result = await sendAdminNotification({
				bot: config.discordBot ? createDiscordBot(config.discordBot) : null,
				layout,
				webhookUrl: config.adminDiscordWebhookUrl,
				dryRun: config.notifyDryRun,
				log: createLogger({ level: 'error', format: 'text', mode: 'production' }),
				channel,
				severity,
				message: args.message,
			});
			if (result === 'sent') console.log('送りました');
			else if (result === 'no-destination') console.error('送り先 (Bot か Webhook) がありません');
			else console.error('送れませんでした');
			// process.exit は finally を飛ばすので、DB を閉じてから終える
			process.exitCode = result === 'sent' ? 0 : result === 'no-destination' ? 3 : 1;
		} finally {
			database.close();
		}
	},
});

const jobRun = defineCommand({
	meta: {
		name: 'run',
		description:
			'定期処理を 1 つだけ、今すぐ動かす。サーバーとは別のプロセスで動く (管理画面の「取得元と実行履歴」からも動かせる)',
	},
	args: {
		name: { type: 'positional', description: '定期処理の名前。例: scrape-portal', required: true },
	},
	async run({ args }) {
		if (SERVER_ONLY_JOBS.includes(args.name)) {
			console.error(
				`${args.name} は、サーバーの実行と重なって二重に送らないよう、管理画面の「取得元と実行履歴」からだけ動かせます。`,
			);
			process.exit(1);
		}
		const config = loadConfigOrExit();
		const database = openConfiguredDatabase(config);
		try {
			const alerter = createCliAlerter(config, database);
			const jobs = createJobDefinitions({
				config,
				database,
				alert: (alert) => alerter.send(alert),
			});
			if (!jobs.some((candidate) => candidate.name === args.name)) {
				console.error(`定期処理 ${args.name} はありません。動かせるのは次のとおりです。`);
				for (const candidate of jobs) {
					console.error(`  ${candidate.name}  ${JOB_LABELS.get(candidate.name) ?? ''}`);
				}
				process.exitCode = 1;
				return;
			}
			const runner = createJobRunner({
				jobs,
				store: createJobRunStore(database),
				log: createLogger({ level: config.logLevel, format: 'text', mode: 'production' }),
			});
			const result = await runner.runNow(args.name);
			const detail = result.message ? `: ${result.message}` : '';
			if (result.status === 'succeeded') console.log(`成功しました${detail}`);
			else if (result.status === 'skipped') console.log(`動かしませんでした${detail}`);
			else console.error(`失敗しました${detail}`);
			process.exitCode = result.status === 'failed' ? 1 : 0;
		} finally {
			database.close();
		}
	},
});

const job = defineCommand({
	meta: { name: 'job', description: '定期処理を扱う' },
	subCommands: { run: jobRun },
});

const userList = defineCommand({
	meta: { name: 'list', description: '利用者の一覧 (メールアドレス、権限の段階、停止中か)' },
	run() {
		const config = loadConfigOrExit();
		const database = openConfiguredDatabase(config);
		try {
			for (const line of formatUserList(createAuthStore(database).listUsers())) console.log(line);
		} finally {
			database.close();
		}
	},
});

const userPromote = defineCommand({
	meta: {
		name: 'promote',
		description:
			'利用者の権限の段階を変える。--role を省くと管理者にする。下げるときも --role user のように使う',
	},
	args: {
		email: { type: 'positional', description: '利用者のメールアドレス', required: true },
		role: { type: 'string', description: 'user、moderator、admin のどれか', default: 'admin' },
	},
	async run({ args }) {
		const role = parseRole(args.role);
		if (!role) {
			console.error(`--role は user、moderator、admin のどれかにしてください: ${args.role}`);
			process.exit(1);
		}
		const config = loadConfigOrExit();
		const database = openConfiguredDatabase(config);
		try {
			const result = changeRole(createAuthStore(database), args.email, role, config.adminEmails);
			if (result.kind === 'not-found') {
				console.error(
					`${args.email} の利用者はいません。一度ログインしてもらってから実行してください。`,
				);
				process.exitCode = 1;
				return;
			}
			if (result.kind === 'unchanged') {
				console.log(
					`${result.user.email} は、すでに${ROLE_LABELS[role]}です。何も変えていません。`,
				);
				return;
			}
			const change = `権限の段階を${ROLE_LABELS[result.from]}から${ROLE_LABELS[role]}に変えました`;
			createAuditLogStore(database).record(
				{
					actorId: null,
					action: 'user.role',
					summary: `${result.user.email} の${change} (管理用コマンド)`,
				},
				new Date(),
			);
			console.log(`${result.user.email} の${change}。`);
			if (result.adminEmail) {
				console.log(
					'この人は ADMIN_EMAILS にあるので、次にログインすると管理者に戻ります。ADMIN_EMAILS からも外してください。',
				);
			}
			// メールアドレスなど、個人情報は含めない
			await createCliAlerter(config, database).send({
				severity: 'info',
				title: `利用者の権限の段階を${ROLE_LABELS[role]}にしました`,
				category: 'users',
				key: `role:${result.user.id}:${role}:${Date.now()}`,
			});
		} finally {
			database.close();
		}
	},
});

/** 利用の停止と再開。停止すると、その人のセッションもすべて消える */
function defineStatusCommand(name: 'suspend' | 'unsuspend') {
	const status = name === 'suspend' ? 'suspended' : 'active';
	const verb = name === 'suspend' ? '停止' : '再開';
	return defineCommand({
		meta: {
			name,
			description:
				name === 'suspend'
					? '利用者の利用を停止する。ログイン中のセッションもすべて消える'
					: '停止した利用者の利用を再開する',
		},
		args: { email: { type: 'positional', description: '利用者のメールアドレス', required: true } },
		async run({ args }) {
			const config = loadConfigOrExit();
			const database = openConfiguredDatabase(config);
			try {
				const result = changeStatus(createAuthStore(database), args.email, status);
				if (result.kind === 'not-found') {
					console.error(`${args.email} の利用者はいません。`);
					process.exitCode = 1;
					return;
				}
				if (result.kind === 'unchanged') {
					console.log(`${result.user.email} は、すでに${verb}しています。何も変えていません。`);
					return;
				}
				createAuditLogStore(database).record(
					{
						actorId: null,
						action: 'user.status',
						summary: `${result.user.email} の利用を${verb}しました (管理用コマンド)`,
					},
					new Date(),
				);
				console.log(`${result.user.email} の利用を${verb}しました。`);
				await createCliAlerter(config, database).send({
					severity: 'info',
					title: `利用者の利用を${verb}しました`,
					category: 'users',
					key: `status:${result.user.id}:${status}:${Date.now()}`,
				});
			} finally {
				database.close();
			}
		},
	});
}

const user = defineCommand({
	meta: { name: 'user', description: '利用者の確認と管理' },
	subCommands: {
		list: userList,
		promote: userPromote,
		suspend: defineStatusCommand('suspend'),
		unsuspend: defineStatusCommand('unsuspend'),
	},
});

const discordCommands = defineCommand({
	meta: {
		name: 'commands',
		description:
			'Discord のスラッシュコマンドを登録する (DISCORD_BOT_TOKEN と DISCORD_CLIENT_ID が要る。反映は最大 1 時間)',
	},
	async run() {
		const config = loadConfigOrExit();
		if (!config.discordBot || !config.discordOAuth) {
			console.error('DISCORD_BOT_TOKEN と DISCORD_CLIENT_ID を設定してください');
			process.exit(2);
		}
		try {
			const count = await registerSlashCommands({
				token: config.discordBot.token,
				applicationId: config.discordOAuth.clientId,
			});
			console.log(`${count} 個のコマンドを登録しました (反映は最大 1 時間)`);
		} catch (error) {
			console.error(error instanceof Error ? error.message : 'コマンドを登録できませんでした');
			process.exitCode = 1;
		}
	},
});

const discord = defineCommand({
	meta: { name: 'discord', description: 'Discord の設定を管理する' },
	subCommands: { commands: discordCommands },
});

const main = defineCommand({
	meta: { name: 'funmary-admin', description: 'Funmary の管理用コマンド' },
	subCommands: {
		discord,
		init,
		'align-env': alignEnv,
		migrate,
		backup,
		restore,
		timetable,
		calendar,
		invite,
		sources,
		job,
		user,
		notify,
	},
});

await runMain(main);
