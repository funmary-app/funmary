// 汎用の Webhook への送信を SSRF から守る部品。利用者が指定した URL の宛先が、Funmary のサーバーの内側 (自分自身、VPS の内部のサービス、クラウドのメタデータ) にならないようにする。
//
// - https だけを許し、ポートは 443 と 8443 だけにする (checkWebhookUrl)。これは URL の形だけで決まる
// - 名前を引いた結果の IP が、ループバック、プライベート、リンクローカル、ユニークローカル、マルチキャスト、予約済みの範囲なら、接続しない (guardedLookup)。DNS リバインディング (検査のあとに DNS が変わる攻撃) を防ぐため、検査した IP にそのまま接続する。undici の Agent の connect.lookup を使うと、検査と接続が同じ結果になる。
//   undici は `all: true` (複数の候補を返す形) で引くので、複数あれば内側のものだけを取り除く。すべて内側なら拒む
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import { BlockList } from 'node:net';
import { Agent } from 'undici';

const ALLOWED_PORTS = new Set([443, 8443]);

export type UrlCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/** https で、ポートが 443 か 8443 であることを確かめる。IP の検査は、接続するとき (guardedLookup) に行う */
export function checkWebhookUrl(url: string): UrlCheck {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { ok: false, reason: 'URL の形が正しくありません' };
	}
	if (parsed.protocol !== 'https:') return { ok: false, reason: 'https の URL だけ使えます' };
	if (parsed.port !== '' && !ALLOWED_PORTS.has(Number(parsed.port))) {
		return { ok: false, reason: 'ポートは 443 か 8443 だけ使えます' };
	}
	return { ok: true };
}

/** 内側とみなす IP の範囲。IPv4 と IPv6 の両方を登録する */
function createBlockList(): BlockList {
	const list = new BlockList();
	// IPv4: ループバック、プライベート (10/8、172.16/12、192.168/16)、リンクローカル、CGNAT (100.64/10)、「このネットワーク」(0/8)、ブロードキャスト、マルチキャストと予約済み (224/4 以降)
	list.addSubnet('127.0.0.0', 8, 'ipv4');
	list.addSubnet('10.0.0.0', 8, 'ipv4');
	list.addSubnet('172.16.0.0', 12, 'ipv4');
	list.addSubnet('192.168.0.0', 16, 'ipv4');
	list.addSubnet('169.254.0.0', 16, 'ipv4');
	list.addSubnet('100.64.0.0', 10, 'ipv4');
	list.addSubnet('0.0.0.0', 8, 'ipv4');
	list.addAddress('255.255.255.255', 'ipv4');
	list.addSubnet('224.0.0.0', 4, 'ipv4');
	// IPv6: ループバック、ユニークローカル (fc00::/7)、リンクローカル (fe80::/10)、マルチキャスト (ff00::/8)
	list.addAddress('::1', 'ipv6');
	list.addSubnet('fc00::', 7, 'ipv6');
	list.addSubnet('fe80::', 10, 'ipv6');
	list.addSubnet('ff00::', 8, 'ipv6');
	return list;
}

/** IPv4 射影の IPv6 アドレス (::ffff:10.0.0.1 など) から、埋め込まれた IPv4 を取り出す */
function embeddedIpv4(address: string): string | null {
	return /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.exec(address)?.[1] ?? null;
}

export function isBlockedAddress(blockList: BlockList, address: string, family: 4 | 6): boolean {
	if (family === 4) return blockList.check(address, 'ipv4');
	const mapped = embeddedIpv4(address);
	if (mapped && blockList.check(mapped, 'ipv4')) return true;
	return blockList.check(address, 'ipv6');
}

/**
 * `net.connect` の `lookup` オプションに渡せる。`dns.lookup` と同様に、`options.all` が `true` ならアドレスの配列を、それ以外はアドレスを 1 件コールバックに渡す。
 */
export type LookupFunction = (
	hostname: string,
	options: LookupOptions,
	callback: (
		error: NodeJS.ErrnoException | null,
		address: string | LookupAddress[],
		family: number,
	) => void,
) => void;

export class SsrfBlockedError extends Error {
	constructor(addresses: readonly string[]) {
		super(`内側のアドレス (${addresses.join('、')}) へは送れません`);
		this.name = 'SsrfBlockedError';
	}
}

/** 引いた IP が内側なら、接続を拒む lookup 関数にする。複数の候補があれば、内側のものだけを取り除く */
export function guardedLookup(lookup: LookupFunction, blockList: BlockList): LookupFunction {
	return (hostname, options, callback) => {
		lookup(hostname, options, (error, address, family) => {
			if (error) {
				callback(error, address, family);
				return;
			}
			if (Array.isArray(address)) {
				const safe = address.filter(
					(entry) => !isBlockedAddress(blockList, entry.address, entry.family === 6 ? 6 : 4),
				);
				if (safe.length === 0) {
					callback(new SsrfBlockedError(address.map((entry) => entry.address)), address, family);
					return;
				}
				callback(null, safe, family);
				return;
			}
			if (isBlockedAddress(blockList, address, family === 6 ? 6 : 4)) {
				callback(new SsrfBlockedError([address]), address, family);
				return;
			}
			callback(null, address, family);
		});
	};
}

export interface SsrfSafeAgentOptions {
	/** 差し替え用 (テスト)。省くと node:dns の lookup を使う */
	readonly lookup?: LookupFunction;
}

/**
 * SSRF から守る undici の Agent。fetch の dispatcher に渡す。
 * @example fetch(url, { dispatcher: createSsrfSafeAgent() })
 */
export function createSsrfSafeAgent(options: SsrfSafeAgentOptions = {}): Agent {
	const lookup = options.lookup ?? dnsLookup;
	return new Agent({ connect: { lookup: guardedLookup(lookup, createBlockList()) } });
}

/** テストで使う、固定の IP を返す lookup。options.all に合わせて、配列か単体かを選ぶ */
export function fixedLookup(address: string, family: 4 | 6 = 4): LookupFunction {
	return (_hostname, options, callback) => {
		if (options.all) callback(null, [{ address, family }], family);
		else callback(null, address, family);
	};
}
