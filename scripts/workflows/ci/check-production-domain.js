// 本番のドメインがコミットされていないかを調べる (ci.yml)。
// 探す文字列は secret に置き、ログでは伏せられる。環境変数: PRODUCTION_DOMAIN
// 旧ドメインも残すときは、改行かカンマで区切って複数書く
import { spawnSync } from 'node:child_process';

const domains = (process.env['PRODUCTION_DOMAIN'] ?? '')
	.split(/[\s,]+/)
	.filter((domain) => domain !== '');
if (domains.length === 0) {
	console.log('PRODUCTION_DOMAIN がないので飛ばします (フォークからの PR など)');
	process.exit(0);
}

// -F: 正規表現にしない、-i: 大文字小文字を区別しない、-l: ファイル名だけ出す、-e: どれか 1 つでも含めば一致
const patterns = domains.flatMap((domain) => ['-e', domain]);
const result = spawnSync('git', ['grep', '-liF', ...patterns], { encoding: 'utf8' });
if (result.status === 0) {
	console.log(
		'::error::本番のドメインが追跡中のファイルに含まれています。README などでは funmary.example.com と書いてください',
	);
	console.log(result.stdout);
	process.exit(1);
}
if (result.status !== 1) {
	// 1 は "見つからない"。それ以外は git の失敗なので、成功と取り違えない
	console.error(result.stderr);
	process.exit(result.status ?? 1);
}
