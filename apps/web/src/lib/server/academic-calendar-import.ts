// 学年暦の PDF の読み取り結果を、学期の期間、振替授業日、全学の休講日として取り込む。
// 管理用コマンドの calendar import と、学年暦の定期処理で使う。値は学年暦から自動で取った値 (auto) として書き、管理者が入れた値 (manual) は上書きしない。休講日の候補のうち祝日と重なる日は、祝日として扱われるので入れない。
import type { CalendarDate, Term } from '@funmary/core';
import type { AcademicCalendarStore } from '@funmary/db';
import type { AcademicCalendarImportOutcome } from '@funmary/jobs';
import type { AcademicCalendarPdfResult } from '@funmary/sources';

export type ParsedAcademicCalendar = Extract<AcademicCalendarPdfResult, { kind: 'ok' }>;

export interface AcademicCalendarImportDeps {
	readonly calendar: AcademicCalendarStore;
	/** 祝日の日付 (保存された祝日と推定を合わせたもの) */
	readonly holidays: readonly CalendarDate[];
}

export interface AcademicCalendarImportOptions {
	readonly apply: boolean;
	readonly now: Date;
	/** 読み取りの警告があっても書き込む */
	readonly ignoreWarnings?: boolean;
}

export type AcademicCalendarImportReport =
	| { readonly kind: 'has-warnings'; readonly warnings: readonly string[] }
	| {
			readonly kind: 'planned';
			readonly academicYear: number;
			readonly terms: ParsedAcademicCalendar['terms'];
			readonly substituteDays: ParsedAcademicCalendar['substituteDays'];
			/** 祝日を除いた休講日 */
			readonly noClassDays: ParsedAcademicCalendar['noClassDays'];
			readonly warnings: readonly string[];
			/** 書き込んだ結果。確かめるだけなら null */
			readonly applied: {
				/** 管理者が入れた値があるので、上書きしなかったもの */
				readonly skippedTerms: readonly Term[];
				readonly skippedSubstituteDays: readonly CalendarDate[];
				readonly skippedNoClassDays: readonly CalendarDate[];
			} | null;
	  };

export function importAcademicCalendar(
	parsed: ParsedAcademicCalendar,
	deps: AcademicCalendarImportDeps,
	options: AcademicCalendarImportOptions,
): AcademicCalendarImportReport {
	if (options.apply && parsed.warnings.length > 0 && !options.ignoreWarnings) {
		return { kind: 'has-warnings', warnings: parsed.warnings };
	}
	const holidays = new Set(deps.holidays);
	const noClassDays = parsed.noClassDays.filter((day) => !holidays.has(day.date));
	const planned = {
		kind: 'planned',
		academicYear: parsed.academicYear,
		terms: parsed.terms,
		substituteDays: parsed.substituteDays,
		noClassDays,
		warnings: parsed.warnings,
	} as const;
	if (!options.apply) return { ...planned, applied: null };

	const skippedTerms = parsed.terms
		.filter((term) => !deps.calendar.saveTerm(parsed.academicYear, term, 'auto', options.now))
		.map((term) => term.term);
	const skippedDays = deps.calendar.replaceAutoDays(
		{ start: `${parsed.academicYear}-04-01`, end: `${parsed.academicYear + 1}-03-31` },
		{ substituteDays: parsed.substituteDays, noClassDays },
	);
	return {
		...planned,
		applied: {
			skippedTerms,
			skippedSubstituteDays: skippedDays.substituteDays,
			skippedNoClassDays: skippedDays.noClassDays,
		},
	};
}

/**
 * 学年暦の定期処理から使う。PDF を読み取り、警告がなければ書き込む。
 * parse は PDF の読み取り (pdfjs-dist を使うので、呼ぶ側が必要なときだけ読み込む)
 */
export async function importAcademicCalendarPdf(
	bytes: Uint8Array,
	deps: AcademicCalendarImportDeps,
	now: Date,
	parse: (bytes: Uint8Array) => Promise<AcademicCalendarPdfResult>,
): Promise<AcademicCalendarImportOutcome> {
	const parsed = await parse(bytes);
	if (parsed.kind === 'invalid') return { kind: 'invalid', reason: parsed.reason };
	const report = importAcademicCalendar(parsed, deps, { apply: true, now });
	if (report.kind === 'has-warnings') return { kind: 'has-warnings', warnings: report.warnings };
	const skipped = report.applied
		? report.applied.skippedTerms.length +
			report.applied.skippedSubstituteDays.length +
			report.applied.skippedNoClassDays.length
		: 0;
	return { kind: 'applied', academicYear: report.academicYear, skipped };
}
