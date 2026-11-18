// 学生ポータルの時間割 (Pt/TimeTable) を、利用者自身のブラウザで読み取るブックマークレット。
// 利用者がポータルにログインして時間割を開き、ブックマークレットを押すと、表のコマを読み取って、Funmary の取り込みの画面へ、内容を URL の # 以降に入れて移る。# 以降はサーバーに送られない。
// Funmary のサーバーは大学に接続しない。パスワードも預からない。
//
// collectTimetableCells は、ブラウザの中で動く関数。文字列にしてブックマークレットに埋め込むので、この関数の外の変数や import を使ってはいけない (関数の中だけで完結させる)。

export const IMPORT_PATH = '/app/courses/import';

/** ブックマークレットが読み取る、1 つのコマ。名前は短くして、URL を短くする */
export interface RawCell {
	/** lesson_id (シラバスの番号) */
	l: string;
	/** year */
	y: number;
	/** term (10 前期、20 後期など) */
	t: string;
	/** 曜日 (1 が月曜)。表の外は null */
	w: number | null;
	/** 時限。表の外は null */
	p: number | null;
	/** classroom_name */
	r: string;
	/** staff_names */
	s: string;
	/** lesson_name */
	n: string;
	/** moca_url (HOPE) */
	h: string;
	/** コマに表示されている文字 (教室が空のときに、名前の末尾から教室を取り出す) */
	x: string;
}

/** ポータルの時間割のページから、コマを読み取る。ブラウザの中で動く */
/**
 * この関数が使う、ブラウザの DOM の部分だけの型。パッケージ全体には DOM の型を入れない (サーバーのコードの型が変わるため)
 */
export interface DomElement {
	readonly textContent: string | null;
	getAttribute(name: string): string | null;
	closest(selector: string): DomElement | null;
	querySelector(selector: string): DomElement | null;
	querySelectorAll(selector: string): ArrayLike<DomElement>;
}

export interface DomDocument {
	querySelectorAll(selector: string): ArrayLike<DomElement>;
}

export function collectTimetableCells(doc: DomDocument): RawCell[] {
	const cells: RawCell[] = [];
	const nodes = doc.querySelectorAll('.timetable-cell');
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]!;
		let weekday: number | null = null;
		let period: number | null = null;
		const td = node.closest('td');
		const tr = td ? td.closest('tr') : null;
		if (td && tr) {
			// 行の先頭の見出し (N時限) と、その行の中での、列の位置 (1 が月曜)
			const heading = tr.querySelector('th');
			const digits = heading ? (heading.textContent || '').normalize('NFKC').match(/\d+/) : null;
			if (digits) period = Number(digits[0]);
			const tds = tr.querySelectorAll('td');
			for (let j = 0; j < tds.length; j++) if (tds[j] === td) weekday = j + 1;
		}
		const attr = (name: string) => node.getAttribute(`data-${name}`) || '';
		cells.push({
			l: attr('lesson_id'),
			y: Number(attr('year')),
			t: attr('term'),
			w: weekday,
			p: period,
			r: attr('classroom_name'),
			s: attr('staff_names'),
			n: attr('lesson_name'),
			h: attr('moca_url'),
			x: (node.textContent || '').trim(),
		});
	}
	return cells;
}

/**
 * 取り込みの JavaScript を作る。ブックマークレットにも、ブラウザのコンソールに貼って実行する使い方にも使う。
 * origin は Funmary の公開 URL。ポータルのページ以外で動かしたときは、何もせずに知らせる
 */
export function buildImportScript(origin: string): string {
	const url = new URL(origin);
	const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
	if (
		!(url.protocol === 'https:' || (url.protocol === 'http:' && local)) ||
		url.origin !== origin
	) {
		throw new Error('公開 URL は、https:// とドメインだけにしてください');
	}
	const target = JSON.stringify(`${origin}${IMPORT_PATH}#`);
	// ブラウザでそのまま動く JavaScript。TypeScript の型の注釈は、文字列にした時点で消えている
	return `(function(){
if(location.hostname!=='students.fun.ac.jp'){alert('学生ポータルの時間割のページ (students.fun.ac.jp/Pt/TimeTable) で押してください');return;}
var collect=${collectTimetableCells.toString()};
var cells=collect(document);
if(cells.length===0){alert('時間割のコマが見つかりません。ポータルにログインして、時間割のページを開いてから押してください');return;}
var bytes=new TextEncoder().encode(JSON.stringify({v:1,c:cells}));
var bin='';for(var i=0;i<bytes.length;i++)bin+=String.fromCharCode(bytes[i]);
var data=btoa(bin).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');
location.assign(${target}+data);
})();`;
}

/** ブックマークレット (javascript: の URL) を作る。origin と動きは buildImportScript と同じ */
export function buildBookmarklet(origin: string): string {
	const source = buildImportScript(origin);
	// 改行は消さない (関数の中の // のコメントが、後ろの行まで飲み込んでしまうため)。改行は %0A になる
	return `javascript:${encodeURIComponent(source)}`;
}
