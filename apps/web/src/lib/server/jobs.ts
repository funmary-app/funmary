// 定期処理の組み立て。サーバー (hooks.server.ts) と、管理用コマンドの job run が使う。
// 管理用コマンドからも読み込むので、$lib を使わずに相対のパスで読み込む
import { resolveAcademicTerms } from '@funmary/core';
import {
	createAcademicCalendarStore,
	createBusStore,
	createClassChangeStore,
	createCourseStore,
	createHolidayStore,
	createNotificationStore,
	createSettingsStore,
	createSourceHealthStore,
	createSubjectStore,
	createUnmatchedLessonStore,
	type Database,
} from '@funmary/db';
import {
	createImportAcademicCalendarJob,
	createImportHolidaysJob,
	createImportSyllabusJob,
	createNotifyClassChangesJob,
	createPruneNotificationsJob,
	createRemindTermRegistrationJob,
	createRemindTimetableImportJob,
	createScrapePortalJob,
	createSyncBusJob,
	type JobDefinition,
} from '@funmary/jobs';
import type { AdminAlert } from '@funmary/notify';
import {
	fetchAcademicCalendarPdf,
	fetchBusStopList,
	fetchBusStopTimetable,
	fetchHolidays,
	fetchPortalPage,
	fetchSyllabusCatalog,
} from '@funmary/sources';
import { importAcademicCalendarPdf } from './academic-calendar-import.ts';
import type { Config } from './config.ts';
import { OFFICIAL_CALENDAR_KEY } from './official-documents.ts';

/** 定期処理の表示名 (管理画面とコマンド)。ここにないものは、名前をそのまま出す */
export const JOB_LABELS: ReadonlyMap<string, string> = new Map([
	['scrape-portal', '休講などの取得'],
	['import-syllabus', '公開シラバスの取り込み'],
	['import-holidays', '祝日の取り込み'],
	['import-academic-calendar', '学年暦の取り込み'],
	['sync-bus', 'バスの時刻表の取り込み'],
	['remind-timetable-import', '時間割の PDF の取り込みの案内'],
	['send-daily-digest', '予定のまとめの送信'],
	['deliver-notifications', '通知の送信'],
	['notify-class-changes', '休講などの通知欄への記録'],
	['prune-notifications', '古い通知の削除'],
	['remind-term-registration', '履修登録を促す知らせ'],
]);

/**
 * サーバーの中でだけ動かす定期処理。予定のまとめと通知の送信は利用者に送るので、
 * 管理用コマンドから別のプロセスで動かすと、サーバーの実行と重なって二重に送ることがある
 */
export const SERVER_ONLY_JOBS: readonly string[] = ['send-daily-digest', 'deliver-notifications'];

export interface JobFactoryDeps {
	readonly config: Config;
	readonly database: Database;
	readonly alert: (alert: AdminAlert) => Promise<unknown>;
}

/** 予定のまとめ (サーバーの services が要る) を除いた、定期処理の一覧 */
export function createJobDefinitions({ config, database, alert }: JobFactoryDeps): JobDefinition[] {
	const jobs: JobDefinition[] = [];
	const changeStore = createClassChangeStore(database);
	const unmatchedStore = createUnmatchedLessonStore(database);
	const subjectStore = createSubjectStore(database);
	const holidayStore = createHolidayStore(database);
	// 公開シラバスは、ログインが要らないので、ポータルのアカウントがなくても動かす
	jobs.push(
		createImportSyllabusJob({
			fetchCatalog: ({ academicYear, needsDetail, signal }) =>
				fetchSyllabusCatalog({
					fetch: (url, init) => fetch(url, init),
					academicYear,
					needsDetail,
					signal,
				}),
			disabledSources: config.sourcesDisabled,
			health: createSourceHealthStore(database),
			subjects: subjectStore,
			alert,
		}),
	);
	// 授業時間割の PDF を取り込む時期 (3 月 31 日と 8 月 31 日) を、管理用の Discord に知らせる
	jobs.push(createRemindTimetableImportJob({ alert }));
	// 祝日は、週に 1 回、内閣府の CSV で入れ替える (最初に同梱の CSV を入れるのは、サーバーの起動のとき)
	jobs.push(
		createImportHolidaysJob({
			fetchHolidays: () => fetchHolidays({ fetch: (url, init) => fetch(url, init) }),
			disabledSources: config.sourcesDisabled,
			health: createSourceHealthStore(database),
			holidays: holidayStore,
			alert,
		}),
	);
	// 学年暦は、大学サイトの PDF を月に 1 回取り、変わったときだけ取り込む。手で入れた値は上書きしない
	const academicCalendarStore = createAcademicCalendarStore(database);
	jobs.push(
		createImportAcademicCalendarJob({
			fetchPdf: () => fetchAcademicCalendarPdf({ fetch: (url, init) => fetch(url, init) }),
			importPdf: (bytes) =>
				importAcademicCalendarPdf(
					bytes,
					{
						calendar: academicCalendarStore,
						holidays: holidayStore.list().map((holiday) => holiday.date),
					},
					new Date(),
					// PDF の読み取り (pdfjs-dist) は大きいので、使うときだけ読み込む
					async (pdf) =>
						(await import('@funmary/sources/academic-calendar-pdf')).parseAcademicCalendarPdf(pdf),
				),
			recordOfficialPdf: (info) =>
				createSettingsStore(database).set(OFFICIAL_CALENDAR_KEY, info, new Date()),
			disabledSources: config.sourcesDisabled,
			health: createSourceHealthStore(database),
			alert,
		}),
	);
	// バスの時刻表は、API の基準の URL を設定したときだけ取り込む
	const busApiBaseUrl = config.busApiBaseUrl;
	if (busApiBaseUrl) {
		jobs.push(
			createSyncBusJob({
				fetchCatalog: (etag) =>
					fetchBusStopList({
						fetch: (url, init) => fetch(url, init),
						baseUrl: busApiBaseUrl,
						etag,
					}),
				fetchTimetable: ({ stopId, generation, etag }) =>
					fetchBusStopTimetable({
						fetch: (url, init) => fetch(url, init),
						baseUrl: busApiBaseUrl,
						stopId,
						generation,
						etag,
					}),
				disabledSources: config.sourcesDisabled,
				health: createSourceHealthStore(database),
				bus: createBusStore(database),
				alert,
			}),
		);
	}
	// 履修している科目の休講などを、利用者の通知欄に入れる
	const notificationStore = createNotificationStore(database);
	jobs.push(
		createNotifyClassChangesJob({
			candidates: (today) => notificationStore.classChangeCandidates(today),
			insert: (entries, now) => notificationStore.insertMany(entries, now),
		}),
		createPruneNotificationsJob({ prune: (before) => notificationStore.pruneBefore(before) }),
	);
	// 前期か後期の始まりに、その学期の科目を履修していない人へ、履修登録を促す
	const courseStore = createCourseStore(database);
	jobs.push(
		createRemindTermRegistrationJob({
			terms: (year) => resolveAcademicTerms(year, academicCalendarStore.listTerms(year)),
			usersWithoutRegistrationIn: (year, terms) =>
				courseStore.usersWithoutRegistrationIn(year, terms),
			insert: (entries, now) => notificationStore.insertMany(entries, now),
		}),
	);
	const portal = config.portal;
	const heartbeatUrl = config.heartbeatUrl;
	if (portal) {
		// 取得の間隔の下限 (60 分) は、DB に残した最終試行の時刻で守るので、別のプロセスから動かしても破られない
		jobs.push(
			createScrapePortalJob({
				fetchPage: (lastAttemptAt) =>
					fetchPortalPage({
						fetch: (url, init) => fetch(url, init),
						credentials: portal,
						lastAttemptAt,
						now: new Date(),
					}),
				disabledSources: config.sourcesDisabled,
				health: createSourceHealthStore(database),
				changes: changeStore,
				matching: {
					unassignedLessonNames: () => changeStore.unassignedLessonNames(),
					assignSubject: (lessonName, subjectId) =>
						changeStore.assignSubject(lessonName, subjectId),
					latestSubjectYear: () => subjectStore.latestYear(),
					subjects: (academicYear) => subjectStore.list(academicYear),
					resolvedNames: (academicYear) => unmatchedStore.resolvedNames(academicYear),
					recordUnmatched: (academicYear, names, now) =>
						unmatchedStore.record(academicYear, names, now),
				},
				alert,
				// 取得のたびに、監視サービスに知らせる。決まった時刻に届かなければ、監視サービスが知らせる
				...(heartbeatUrl && {
					heartbeat: () => fetch(heartbeatUrl, { signal: AbortSignal.timeout(10_000) }),
				}),
			}),
		);
	}
	return jobs;
}
