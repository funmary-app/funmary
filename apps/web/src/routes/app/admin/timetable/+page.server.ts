// 授業時間割の PDF の取り込み (管理用コマンドの timetable import と同じ処理)。PDF を読み、科目と照合した結果を見せ、管理者が確かめてから、科目ごとに共有する枠に取り込む。既にある枠は上書きしない。
import { fail, type Actions, type ServerLoad } from '@sveltejs/kit';
import { parseTimetablePdf } from '@funmary/sources/timetable-pdf';
import { requireAdmin } from '#lib/server/admin.ts';
import { createPendingImports } from '#lib/server/pending-imports.ts';
import { readPdfUpload } from '#lib/server/pdf-upload.ts';
import { getServices } from '#lib/server/services.ts';
import {
	importTimetable,
	type ParsedTimetable,
	type TimetableImportReport,
} from '#lib/server/timetable-import.ts';
import { toTimetableImportView } from '#lib/server/timetable-import-view.ts';

interface Pending {
	readonly parsed: ParsedTimetable;
	/** 管理者が指定した年度。PDF の表題の年度より優先する */
	readonly academicYear: number | undefined;
}

/** PDF を読んでから取り込むまでに、管理者が内容を確かめる時間 */
const pending = createPendingImports<Pending>({ ttlMs: 30 * 60 * 1000 });

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;

function run(value: Pending, apply: boolean, ignoreWarnings = false): TimetableImportReport {
	const { subjects, courses, unmatchedLessons } = getServices();
	return importTimetable(
		value.parsed,
		{ subjects, courses, unmatched: unmatchedLessons },
		{
			apply,
			now: new Date(),
			ignoreWarnings,
			...(value.academicYear !== undefined && { academicYear: value.academicYear }),
		},
	);
}

/** 取り込めない理由があれば、その文を返す */
function problem(report: TimetableImportReport): string | null {
	switch (report.kind) {
		case 'no-year':
			return 'PDF の表題から年度を読めませんでした。年度を入れて、もう一度読み取ってください。';
		case 'no-subjects':
			return `${report.academicYear} 年度の科目がまだありません。公開シラバスの取り込み (定期処理) を待ってから、もう一度読み取ってください。`;
		default:
			return null;
	}
}

const subjectName = (id: number) => getServices().subjects.findById(id)?.name ?? `(科目 ${id})`;

export const load: ServerLoad = ({ locals }) => {
	requireAdmin(locals);
	return {};
};

export const actions: Actions = {
	previewPdf: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const upload = await readPdfUpload(form, 'pdf');
		if (!upload.ok) return fail(400, { error: upload.error });
		const yearText = form.get('year');
		let academicYear: number | undefined;
		if (typeof yearText === 'string' && yearText.trim() !== '') {
			academicYear = Number(yearText);
			if (!Number.isInteger(academicYear) || academicYear < MIN_YEAR || academicYear > MAX_YEAR) {
				return fail(400, { error: `年度は ${MIN_YEAR} から ${MAX_YEAR} の数で入れてください。` });
			}
		}
		const parsed = await parseTimetablePdf(upload.value);
		if (parsed.kind === 'invalid') {
			return fail(400, { error: `授業時間割の PDF として読めませんでした: ${parsed.reason}` });
		}
		const value = { parsed, academicYear };
		const report = run(value, false);
		const reason = problem(report);
		if (reason || report.kind !== 'planned') return fail(400, { error: reason });
		return {
			preview: {
				id: pending.put(admin.id, value, new Date()),
				...toTimetableImportView(report, subjectName),
			},
		};
	},
	applyPdf: async ({ request, locals }) => {
		const admin = requireAdmin(locals);
		const form = await request.formData();
		const id = form.get('id');
		const value = typeof id === 'string' ? pending.take(id, admin.id, new Date()) : null;
		if (!value) {
			return fail(400, {
				error: '読み取った内容の期限が切れました。もう一度 PDF を選んでください。',
			});
		}
		const report = run(value, true, form.get('confirmWarnings') === 'on');
		if (report.kind === 'has-warnings') {
			const planned = run(value, false);
			if (planned.kind !== 'planned') return fail(400, { error: problem(planned) });
			return fail(400, {
				error: '読み取りに警告があります。内容を確かめて、確かめたことのチェックを入れてください。',
				preview: {
					id: pending.put(admin.id, value, new Date()),
					...toTimetableImportView(planned, subjectName),
				},
			});
		}
		const reason = problem(report);
		if (reason || report.kind !== 'planned') return fail(400, { error: reason });
		return { result: toTimetableImportView(report, subjectName) };
	},
};
