// ログに出す文字列から、秘密の値を伏せる。
// ロガーは、出力の前に必ずここを通す。伏せる処理をここ 1 か所にまとめ、書き忘れが起きないようにする。

const RULES: readonly (readonly [RegExp, string])[] = [
	// Discord の Webhook。URL の後ろの部分がそのまま送信の権限になる
	[
		/(https?:\/\/(?:[\w-]+\.)?discord(?:app)?\.com\/api\/(?:v\d+\/)?webhooks\/)[^\s"'<>]+/gi,
		'$1***',
	],
	// 監視サービスの ping の URL
	[/(https?:\/\/hc-ping\.com\/)[^\s"'<>]+/gi, '$1***'],
	// カレンダー購読 URL: /cal/<トークン>.ics
	[/(\/cal\/)[^/\s"'<>?#]+?(\.ics)/g, '$1***$2'],
	// フィードと共有リンク: /feed/<トークン>/..., /share/<トークン>
	[/(\/(?:feed|share)\/)[^/\s"'<>?#]+/g, '$1***'],
	// 個人用のアクセストークン
	[/\bfmy_[\w-]+/g, 'fmy_***'],
	// URL の query にある鍵の値
	[/([?&](?:token|authtoken|access_token|secret|key)=)[^&\s"'<>]+/gi, '$1***'],
	// メールアドレス
	[/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '***@***'],
];

export function redact(text: string): string {
	let result = text;
	for (const [pattern, replacement] of RULES) result = result.replace(pattern, replacement);
	return result;
}
