import { describe, expect, it } from 'vitest';
import {
	findIpRange,
	ipRangeContaining,
	isInIpRanges,
	isNearUniversity,
	normalizeIpRange,
	UNIVERSITY_LOCATION,
} from './campus.ts';

describe('normalizeIpRange', () => {
	it('単独のアドレスと CIDR を、そのまま受け付ける', () => {
		expect(normalizeIpRange('203.0.113.7')).toBe('203.0.113.7');
		expect(normalizeIpRange('203.0.113.0/24')).toBe('203.0.113.0/24');
	});

	it('前後の空白を除く。/32 は単独のアドレスにそろえる', () => {
		expect(normalizeIpRange(' 203.0.113.7/32 ')).toBe('203.0.113.7');
	});

	it('ホスト部が 0 でない CIDR は、範囲の先頭に直す', () => {
		expect(normalizeIpRange('203.0.113.77/24')).toBe('203.0.113.0/24');
	});

	it('IPv4 の範囲として読めないものは null', () => {
		for (const input of [
			'',
			'abc',
			'203.0.113',
			'203.0.113.256',
			'203.0.113.0/33',
			'203.0.113.0/-1',
			'203.0.113.0/2x',
			'2001:db8::1',
			'203.0.113.0/24/8',
		]) {
			expect(normalizeIpRange(input), input).toBeNull();
		}
	});

	it('学内以外まで巻き込む広すぎる範囲 (/8 より広いもの) は null', () => {
		expect(normalizeIpRange('0.0.0.0/0')).toBeNull();
		expect(normalizeIpRange('10.0.0.0/7')).toBeNull();
		expect(normalizeIpRange('10.0.0.0/8')).toBe('10.0.0.0/8');
	});
});

describe('findIpRange', () => {
	const ranges = ['203.0.113.0/24', '198.51.100.7'];

	it('アドレスが入る最初の範囲を返す。入らなければ null', () => {
		expect(findIpRange('203.0.113.55', ranges)).toBe('203.0.113.0/24');
		expect(findIpRange('198.51.100.7', ranges)).toBe('198.51.100.7');
		expect(findIpRange('198.51.100.8', ranges)).toBeNull();
		expect(findIpRange('203.0.113.55', [])).toBeNull();
	});

	it('IPv4 を IPv6 の形に包んだアドレスも、IPv4 として扱う', () => {
		expect(findIpRange('::ffff:203.0.113.9', ranges)).toBe('203.0.113.0/24');
	});
});

describe('ipRangeContaining', () => {
	it('アドレスを含む、指定した長さの範囲を返す', () => {
		expect(ipRangeContaining('202.231.20.252', 24)).toBe('202.231.20.0/24');
		expect(ipRangeContaining('202.231.20.252', 32)).toBe('202.231.20.252');
		expect(ipRangeContaining('::ffff:202.231.20.252', 24)).toBe('202.231.20.0/24');
	});

	it('IPv4 でないアドレスや、広すぎる長さは null', () => {
		expect(ipRangeContaining('2001:db8::1', 24)).toBeNull();
		expect(ipRangeContaining('abc', 24)).toBeNull();
		expect(ipRangeContaining('202.231.20.252', 4)).toBeNull();
	});
});

describe('isInIpRanges', () => {
	const ranges = ['203.0.113.0/24', '198.51.100.7'];

	it('範囲 (CIDR) と、単独のアドレスの、どちらも判定できる', () => {
		expect(isInIpRanges('203.0.113.55', ranges)).toBe(true);
		expect(isInIpRanges('203.0.114.1', ranges)).toBe(false);
		expect(isInIpRanges('198.51.100.7', ranges)).toBe(true);
		expect(isInIpRanges('198.51.100.8', ranges)).toBe(false);
	});

	it('IPv4 を IPv6 の形に包んだアドレスも、IPv4 として扱う', () => {
		expect(isInIpRanges('::ffff:203.0.113.9', ranges)).toBe(true);
	});

	it('範囲が空、アドレスが読めない、範囲が不正なときは false', () => {
		expect(isInIpRanges('203.0.113.9', [])).toBe(false);
		expect(isInIpRanges('abc', ranges)).toBe(false);
		expect(isInIpRanges('203.0.113.9', ['bad', '203.0.113.0/99'])).toBe(false);
		expect(isInIpRanges('2001:db8::1', ranges)).toBe(false);
	});

	it('/0 はすべてに当たる。/32 は 1 つのアドレス', () => {
		expect(isInIpRanges('8.8.8.8', ['0.0.0.0/0'])).toBe(true);
		expect(isInIpRanges('203.0.113.9', ['203.0.113.9/32'])).toBe(true);
		expect(isInIpRanges('203.0.113.10', ['203.0.113.9/32'])).toBe(false);
	});
});

describe('isNearUniversity', () => {
	it('未来大の近くの現在地は true、離れていれば false', () => {
		expect(isNearUniversity(UNIVERSITY_LOCATION.latitude, UNIVERSITY_LOCATION.longitude)).toBe(
			true,
		);
		// 約 200 m
		expect(
			isNearUniversity(UNIVERSITY_LOCATION.latitude + 0.0018, UNIVERSITY_LOCATION.longitude),
		).toBe(true);
		// 函館駅の近く
		expect(isNearUniversity(41.7737, 140.7266)).toBe(false);
	});

	it('緯度と経度のどちらが離れていても、500 m を境に判定する', () => {
		// 緯度 0.001 度は約 111 m
		expect(
			isNearUniversity(UNIVERSITY_LOCATION.latitude + 0.0039, UNIVERSITY_LOCATION.longitude),
		).toBe(true);
		expect(
			isNearUniversity(UNIVERSITY_LOCATION.latitude + 0.0049, UNIVERSITY_LOCATION.longitude),
		).toBe(false);
		// この緯度では、経度 0.001 度は約 83 m
		expect(
			isNearUniversity(UNIVERSITY_LOCATION.latitude, UNIVERSITY_LOCATION.longitude + 0.0052),
		).toBe(true);
		expect(
			isNearUniversity(UNIVERSITY_LOCATION.latitude, UNIVERSITY_LOCATION.longitude + 0.0065),
		).toBe(false);
	});

	it('範囲 (メートル) を指定できる', () => {
		const offset = UNIVERSITY_LOCATION.latitude + 0.0045; // 約 500 m
		expect(isNearUniversity(offset, UNIVERSITY_LOCATION.longitude, 300)).toBe(false);
		expect(isNearUniversity(offset, UNIVERSITY_LOCATION.longitude, 800)).toBe(true);
	});

	it('座標が数でなければ false', () => {
		expect(isNearUniversity(Number.NaN, 140.7)).toBe(false);
	});
});
