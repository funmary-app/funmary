import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
	decodeImportFragment,
	encodeImportPayload,
	parseImportPayload,
	roomFromLabel,
} from './payload.ts';

const cell = (over: Record<string, unknown> = {}) => ({
	l: '100002',
	y: 2026,
	t: '20',
	w: 1,
	p: 1,
	r: '494C&D',
	s: '架空　花子,架空　次郎',
	n: '架空の科目B1-J',
	h: 'https://hope.fun.ac.jp/2026/course/view.php?idnumber=126100200001',
	x: '架空の科目B1-J(494C&D)(後期)',
	...over,
});

const payload = (cells: unknown[]) => ({ v: 1, c: cells });

describe('parseImportPayload', () => {
	it('コマの内容を、名前のついた形にそろえる', () => {
		const result = parseImportPayload(payload([cell()]));
		if (result.kind !== 'ok') throw new Error(`読めるはず: ${JSON.stringify(result)}`);
		expect(result.cells).toEqual([
			{
				lessonId: '100002',
				year: 2026,
				term: 'fall',
				weekday: 1,
				period: 1,
				room: '494C&D',
				teachers: ['架空　花子', '架空　次郎'],
				name: '架空の科目B1-J',
				hopeUrl: 'https://hope.fun.ac.jp/2026/course/view.php?idnumber=126100200001',
			},
		]);
	});

	it('開講期の記号 (10 前期、20 後期、11 から 22 の各クォーター、00 通年) を Term にする', () => {
		const termOf = (t: string) => {
			const result = parseImportPayload(payload([cell({ t })]));
			return result.kind === 'ok' ? (result.cells[0]?.term ?? 'rejected') : 'invalid';
		};
		expect(termOf('10')).toBe('spring');
		expect(termOf('20')).toBe('fall');
		expect(termOf('11')).toBe('q1');
		expect(termOf('12')).toBe('q2');
		expect(termOf('21')).toBe('q3');
		expect(termOf('22')).toBe('q4');
		expect(termOf('00')).toBe('full-year');
		expect(termOf('99')).toBe('rejected');
	});

	it('教室が空なら、名前の末尾の (教室)(前期|後期) から取り出す', () => {
		const result = parseImportPayload(payload([cell({ r: '', x: '科目(R791)(後期)' })]));
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells[0]?.room).toBe('R791');
	});

	it('教室が、どちらにもなければ null にする', () => {
		const result = parseImportPayload(payload([cell({ r: '', x: '集中講義' })]));
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells[0]?.room).toBeNull();
	});

	it('HOPE の URL は、hope.fun.ac.jp の https のものだけを残し、ほかは捨てる (コマは残す)', () => {
		const result = parseImportPayload(
			payload([
				cell({ h: 'https://evil.example/x' }),
				cell({ l: '3', h: 'javascript:alert(1)' }),
				cell({ l: '4', h: 'http://hope.fun.ac.jp/x' }),
				cell({ l: '5', h: 'https://hope.fun.ac.jp.evil.example/x' }),
			]),
		);
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells.map((c) => c.hopeUrl)).toEqual([null, null, null, null]);
	});

	it('曜日と時限がないコマ (集中講義) は、null のまま残す', () => {
		const result = parseImportPayload(payload([cell({ w: null, p: null })]));
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells[0]).toMatchObject({ weekday: null, period: null });
	});

	it('形が合わないコマは、捨てて、数を返す。ほかのコマは読む', () => {
		const result = parseImportPayload(
			payload([
				cell(),
				cell({ l: 'abc' }),
				cell({ y: 1 }),
				cell({ w: 9 }),
				cell({ p: 0 }),
				cell({ n: '' }),
				'x',
				null,
			]),
		);
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells).toHaveLength(1);
		expect(result.rejected).toBe(7);
	});

	it('同じコマ (科目、年度、曜日、時限が同じ) の重複は、1 つにする', () => {
		const result = parseImportPayload(payload([cell(), cell()]));
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells).toHaveLength(1);
	});

	it('文字数の上限を超える項目は切り、制御文字は除く', () => {
		const result = parseImportPayload(
			payload([cell({ n: `あ${'\u0000'}${'い'.repeat(500)}`, r: 'x'.repeat(500) })]),
		);
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells[0]!.name.length).toBeLessThanOrEqual(200);
		expect(result.cells[0]!.name).not.toContain('\u0000');
		expect(result.cells[0]!.room!.length).toBeLessThanOrEqual(100);
	});

	it('コマが多すぎる入力は、受け付けない', () => {
		const many = Array.from({ length: 201 }, (_, i) => cell({ l: String(100000 + i) }));
		expect(parseImportPayload(payload(many)).kind).toBe('invalid');
	});

	it('版が違う、形が違う入力は invalid にする', () => {
		expect(parseImportPayload({ v: 2, c: [] }).kind).toBe('invalid');
		expect(parseImportPayload({ v: 1 }).kind).toBe('invalid');
		expect(parseImportPayload('x').kind).toBe('invalid');
		expect(parseImportPayload(null).kind).toBe('invalid');
	});

	it('__proto__ などをキーにしたオブジェクトが来ても、結果を汚さない', () => {
		const evil = JSON.parse(
			'{"v":1,"c":[{"l":"1","y":2026,"t":"20","w":1,"p":1,"r":"","s":"","n":"a","h":"","x":"","__proto__":{"admin":true}}]}',
		) as unknown;
		const result = parseImportPayload(evil);
		expect(result.kind).toBe('ok');
		expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
	});

	it('でたらめな入力でも、例外にならない', () => {
		fc.assert(
			fc.property(fc.anything(), (value) => {
				expect(['ok', 'invalid']).toContain(parseImportPayload(value).kind);
			}),
			{ numRuns: 300 },
		);
	});
});

describe('decodeImportFragment', () => {
	it('URL の # 以降 (base64url の JSON) から、コマを読む。日本語も戻る', () => {
		const fragment = encodeImportPayload(payload([cell()]));
		const result = decodeImportFragment(fragment);
		if (result.kind !== 'ok') throw new Error('読めるはず');
		expect(result.cells[0]?.name).toBe('架空の科目B1-J');
	});

	it('先頭の # や、d= が付いていても読む', () => {
		const fragment = encodeImportPayload(payload([cell()]));
		expect(decodeImportFragment(`#${fragment}`).kind).toBe('ok');
	});

	it('壊れた文字列や、JSON でないものは、例外にせず invalid にする', () => {
		expect(decodeImportFragment('').kind).toBe('invalid');
		expect(decodeImportFragment('!!!').kind).toBe('invalid');
		expect(
			decodeImportFragment(Buffer.from('これは JSON ではない').toString('base64url')).kind,
		).toBe('invalid');
	});

	it('大きすぎる入力は、読まずに invalid にする', () => {
		expect(decodeImportFragment('A'.repeat(300_000)).kind).toBe('invalid');
	});
});

describe('roomFromLabel', () => {
	it('教室名に & や 記号が含まれても、取り出せる', () => {
		expect(roomFromLabel('コミュニケーションII1-J(494C&D)(後期)')).toBe('494C&D');
		expect(roomFromLabel('線形代数学II1-IJKL(R791)(後期)')).toBe('R791');
	});

	it('科目名にカッコがあっても、末尾の (教室)(前期|後期) だけを見る', () => {
		expect(roomFromLabel('科目(旧:別名)(講堂)(前期)')).toBe('講堂');
	});

	it('書式に合わなければ null', () => {
		expect(roomFromLabel('集中講義')).toBeNull();
		expect(roomFromLabel('')).toBeNull();
	});
});
