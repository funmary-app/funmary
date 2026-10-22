// adapter-node が直接読む環境変数を、読ませる前に整える。
// adapter-node は、変数が空の文字列でも "値がある" とみなす (HOST= なら空のアドレス、SHUTDOWN_TIMEOUT= なら NaN)。
// Funmary では、空の値は書かなかったのと同じに扱うので、空のものを消してから、既定の待ち受け先を入れる。
// 既定は 127.0.0.1 の 28461 番。外から届くのは nginx だけにするため、adapter-node の既定 (0.0.0.0 の 3000 番) は使わない。

/** adapter-node が読む変数。空なら消して、adapter-node の既定に任せる */
const ADAPTER_VARIABLES = [
	'HOST',
	'PORT',
	'SOCKET_PATH',
	'ORIGIN',
	'ADDRESS_HEADER',
	'XFF_DEPTH',
	'PROTOCOL_HEADER',
	'HOST_HEADER',
	'PORT_HEADER',
	'BODY_SIZE_LIMIT',
	'SHUTDOWN_TIMEOUT',
	'IDLE_TIMEOUT',
	'KEEP_ALIVE_TIMEOUT',
	'HEADERS_TIMEOUT',
] as const;

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = '28461';

/** env を書き換える (実際には process.env を渡す) */
export function prepareAdapterEnv(env: NodeJS.ProcessEnv): void {
	for (const name of ADAPTER_VARIABLES) {
		if (env[name] === '') delete env[name];
	}
	// UNIX ソケットで待ち受けるときは、ホストとポートを入れない (adapter-node が両方あると迷うため)
	if (env['SOCKET_PATH'] === undefined) {
		env['HOST'] ??= DEFAULT_HOST;
		env['PORT'] ??= DEFAULT_PORT;
	}
}
