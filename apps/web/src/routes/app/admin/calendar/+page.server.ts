// 学年暦の確認と入力。大学の学年暦の PDF を上げて取り込むか、管理者が学期の期間、振替授業日、全学の休講日を入れる。入れていない学期は、既定の規則で推定した期間を使う。
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import {
	academicYearOf,
	jstDateTime,
	resolveAcademicTerms,
	resolveHolidays,
	TERMS,
} from '@funmary/core';
import { parseAcademicCalendarPdf } from '@funmary/sources/academic-calendar-pdf';
import {
	importAcademicCalendar,
	type ParsedAcademicCalendar,
} from '#lib/server/academic-calendar-import.ts';
import { requireAdmin } from '#lib/server/admin.ts';
import { createPendingImports } from '#lib/server/pending-imports.ts';
import { readPdfUpload } from '#lib/server/pdf-upload.ts';
import {
	academicYearRange,
	parseAcademicYear,
	parseDateKey,
	parseNoClassDayForm,
	parseSubstituteDayForm,
	parseTermEdgeForm,
	parseTermForm,
	parseTermKey,
} from '#lib/server/calendar-form.ts';
import { getServices } from '#lib/server/services.ts';

/** PDF を読んでから取り込むまでに、管理者が内容を確かめる時間 */
const pending = createPendingImports<ParsedAcademicCalendar>({ ttlMs: 30 * 60 * 1000 });

/** 取り込む前に見せる、PDF から読んだ内容。祝日と重なる休講日は除いてある */
function preview(id: string, parsed: ParsedAcademicCalendar) {
	const report = importAcademicCalendar(parsed, holidayDeps(), { apply: false, now: new Date() });
	if (report.kind !== 'planned') throw new Error('確かめるだけなら planned になるはず');
	return {
		id,
		academicYear: report.academicYear,
		terms: report.terms,
		substituteDays: report.substituteDays,
		noClassDays: report.noClassDays,
		warnings: report.warnings,
	};
}

function holidayDeps() {
	const { academicCalendar, holidays } = getServices();
	// 祝日は保存されたものを使う (管理用コマンドの calendar import と同じ)
	return { calendar: academicCalendar, holidays: holidays.list().map((holiday) => holiday.date) };
}

/** 画面を開いた年度。?year= がなければ今日の年度 */
function yearOf(url: URL): number {
	return parseAcademicYear(
		url.searchParams.get('year'),
		academicYearOf(jstDateTime(new Date()).date),
	);
}

export const load: ServerLoad = ({ locals, url }) => {
	requireAdmin(locals);
	const { academicCalendar, holidays, estimateHolidays } = getServices();
	const academicYear = yearOf(url);
	const range = academicYearRange(academicYear);
	const resolved = new Map(
		resolveAcademicTerms(academicYear, academicCalendar.listTerms(academicYear)).map((term) => [
			term.term,
			term,
		]),
	);
	return {
		academicYear,
		range,
		// 学期は、決まっていないものも含めて、選択肢と同じ順に並べる
		terms: TERMS.map((term) => {
			const period = resolved.get(term);
			return period
				? { term, start: period.start, end: period.end, source: period.source }
				: { term, start: null, end: null, source: null };
		}),
		substituteDays: academicCalendar.listSubstituteDays(range.start, range.end),
		noClassDays: academicCalendar.listNoClassDays(range.start, range.end),
		// 年の格子に出す祝日 (保存されたものと、まだ載っていない年の推定)
		holidays: resolveHolidays({
			stored: holidays.list(),
			estimate: estimateHolidays,
			throughYear: academicYear + 1,
		}).filter((holiday) => range.start <= holiday.date && holiday.date <= range.end),
		today: jstDateTime(new Date()).date,
	};
};

export const actions: Actions = {
	previewPdf: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const upload = await readPdfUpload(await request.formData(), 'pdf');
		if (!upload.ok) return fail(400, { error: upload.error });
		const parsed = await parseAcademicCalendarPdf(upload.value);
		if (parsed.kind === 'invalid') {
			return fail(400, { error: `学年暦の PDF として読めませんでした: ${parsed.reason}` });
		}
		return { pdfPreview: preview(pending.put(admin.id, parsed, new Date()), parsed) };
	},
	applyPdf: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const id = form.get('id');
		const now = new Date();
		const parsed = typeof id === 'string' ? pending.take(id, admin.id, now) : null;
		if (!parsed) {
			return fail(400, {
				error: '読み取った内容の期限が切れました。もう一度 PDF を選んでください。',
			});
		}
		const report = importAcademicCalendar(parsed, holidayDeps(), {
			apply: true,
			now,
			ignoreWarnings: form.get('confirmWarnings') === 'on',
		});
		if (report.kind === 'has-warnings') {
			return fail(400, {
				error: '読み取りに警告があります。内容を確かめて、確かめたことのチェックを入れてください。',
				pdfPreview: preview(pending.put(admin.id, parsed, now), parsed),
			});
		}
		const skipped =
			(report.applied?.skippedTerms.length ?? 0) +
			(report.applied?.skippedSubstituteDays.length ?? 0) +
			(report.applied?.skippedNoClassDays.length ?? 0);
		return {
			message:
				`${report.academicYear} 年度の学年暦を取り込みました。` +
				(skipped > 0 ? `手で入れた値がある ${skipped} 件は、上書きしていません。` : ''),
		};
	},
	saveTerm: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const academicYear = yearOf(url);
		const parsed = parseTermForm(await request.formData(), academicYear);
		if (!parsed.ok) return fail(400, { error: parsed.error });
		getServices().academicCalendar.saveTerm(academicYear, parsed.value, 'manual', new Date());
		return { message: '学期の期間を保存しました。' };
	},
	/** 年の格子で選んだ日を、学期の始まりか終わりにする */
	setTermEdge: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const academicYear = yearOf(url);
		const form = await request.formData();
		const { academicCalendar } = getServices();
		const term = form.get('term');
		const current = resolveAcademicTerms(
			academicYear,
			academicCalendar.listTerms(academicYear),
		).find((period) => period.term === term);
		const parsed = parseTermEdgeForm(form, academicYear, current ?? null);
		if (!parsed.ok) return fail(400, { error: parsed.error });
		academicCalendar.saveTerm(academicYear, parsed.value, 'manual', new Date());
		return { message: '学期の期間を保存しました。' };
	},
	deleteTerm: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const term = parseTermKey(await request.formData());
		if (term === null) return fail(400, { error: '学期を選んでください。' });
		getServices().academicCalendar.deleteTerm(yearOf(url), term);
		return {
			message: '学期の期間を消しました。前期と後期は、既定の規則で推定した期間に戻ります。',
		};
	},
	saveSubstituteDay: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const parsed = parseSubstituteDayForm(await request.formData(), yearOf(url));
		if (!parsed.ok) return fail(400, { error: parsed.error });
		getServices().academicCalendar.saveSubstituteDay(parsed.value, 'manual');
		return { message: '振替授業日を保存しました。' };
	},
	deleteSubstituteDay: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const date = parseDateKey(await request.formData(), yearOf(url));
		if (date === null) return fail(400, { error: '日付がありません。' });
		getServices().academicCalendar.deleteSubstituteDay(date);
		return { message: '振替授業日を消しました。' };
	},
	saveNoClassDay: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const parsed = parseNoClassDayForm(await request.formData(), yearOf(url));
		if (!parsed.ok) return fail(400, { error: parsed.error });
		getServices().academicCalendar.saveNoClassDay(parsed.value.date, parsed.value.label, 'manual');
		return { message: '全学の休講日を保存しました。' };
	},
	deleteNoClassDay: async ({ request, locals, url }) => {
		requireAdmin(locals);
		const date = parseDateKey(await request.formData(), yearOf(url));
		if (date === null) return fail(400, { error: '日付がありません。' });
		getServices().academicCalendar.deleteNoClassDay(date);
		return { message: '全学の休講日を消しました。' };
	},
};
