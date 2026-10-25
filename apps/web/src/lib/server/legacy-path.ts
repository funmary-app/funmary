// 移した画面の前の URL を、移した先の URL にする。ブックマークや、登録済みのブックマークレット (/courses/import#...) を動かし続けるために使う。
// # 以降はサーバーに届かないが、ブラウザが転送先に引き継ぐ。

// アプリの画面は /app の下に移した (紹介の画面を / に置くため)
const MOVED = ['/week', '/courses', '/subjects', '/admin'];

// 「リポジトリと作者」の画面 (/about) は、ログインしていなくても見られるよう、設定の下からルートの下に移した (#223)
const ABOUT_PAGES = ['about', 'license', 'third-party-licenses', 'contributors'];
const MOVED_ABOUT = new Map(ABOUT_PAGES.map((name) => [`/app/settings/${name}`, `/${name}`]));

/** 前の URL なら移した先のパス、そうでなければ null */
export function legacyAppPath(pathname: string): string | null {
	const about = MOVED_ABOUT.get(pathname);
	if (about) return about;
	return MOVED.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
		? `/app${pathname}`
		: null;
}
