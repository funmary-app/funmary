import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { openFlow, sealFlow } from './flow-cookie.ts';
import type { LoginFlow } from './service.ts';

const KEY = randomBytes(32);

/**
 * 封の最後のバイトの 1 ビットを反転する。文字列の末尾を書き換えると、Base64 の使われないビットだけが変わり、中身が同じままのことがあるので、バイトを書き換えてから符号化し直す
 */
function flipLastByte(sealed: string): string {
	const bytes = Buffer.from(sealed, 'base64url');
	bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
	return bytes.toString('base64url');
}
const FLOW: LoginFlow = {
	state: 's',
	nonce: 'n',
	codeVerifier: 'verifier-secret',
	inviteCode: 'CODE-1',
	startedAt: 1_000,
};

describe('ログインの途中の値の暗号化', () => {
	it('封をした値を、同じ鍵で開けると元に戻る', () => {
		expect(openFlow(sealFlow(FLOW, KEY), KEY)).toEqual(FLOW);
	});

	it('封をした値に、中身が平文で残らない', () => {
		expect(sealFlow(FLOW, KEY)).not.toContain('verifier-secret');
	});

	it('同じ値でも、封をするたびに違う文字列になる', () => {
		expect(sealFlow(FLOW, KEY)).not.toBe(sealFlow(FLOW, KEY));
	});

	it('違う鍵では開けない', () => {
		expect(openFlow(sealFlow(FLOW, KEY), randomBytes(32))).toBeNull();
	});

	it('1 文字でも書き換えられていたら開けない', () => {
		expect(openFlow(flipLastByte(sealFlow(FLOW, KEY)), KEY)).toBeNull();
	});

	it('壊れた文字列や空の文字列は、例外にせず開けないものとして扱う', () => {
		for (const bad of ['', 'x', '....', '!!!!', 'a'.repeat(10)]) {
			expect(openFlow(bad, KEY)).toBeNull();
		}
	});

	it('招待コードがない場合も戻せる', () => {
		const flow = { ...FLOW, inviteCode: null };
		expect(openFlow(sealFlow(flow, KEY), KEY)).toEqual(flow);
	});

	it('鍵が 32 バイトでなければ、封をする前に失敗する', () => {
		expect(() => sealFlow(FLOW, randomBytes(16))).toThrow();
	});
});
