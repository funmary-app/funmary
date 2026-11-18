import { describe, expect, it } from 'vitest';
import { createAuthStore } from './auth-store.ts';
import type { Database } from './database.ts';
import { createAccessGrantStore } from './access-grant-store.ts';
import { createUserEventStore, type UserEventInput } from './user-event-store.ts';
import { useTestDatabase } from './testing.ts';

let database: Database;
useTestDatabase('funmary-user-events-', (db) => (database = db));

const T0 = new Date('2026-10-01T00:00:00Z');
const T1 = new Date('2026-10-02T00:00:00Z');

function setup() {
	const auth = createAuthStore(database);
	const alice = auth.createUser(
		{ googleSub: 'a', email: 'a@fun.ac.jp', name: null, role: 'user' },
		T0,
	);
	const bob = auth.createUser(
		{ googleSub: 'b', email: 'b@fun.ac.jp', name: null, role: 'user' },
		T0,
	);
	return {
		store: createUserEventStore(database),
		alice,
		bob,
		aliceViewer: { id: alice, email: 'a@fun.ac.jp' },
		bobViewer: { id: bob, email: 'b@fun.ac.jp' },
	};
}

const input = (overrides: Partial<UserEventInput> = {}): UserEventInput => ({
	title: '架空のサークル',
	location: '架空の部室',
	notes: null,
	startDate: '2026-10-05',
	endDate: '2026-10-05',
	time: { kind: 'time', start: '18:00', end: '19:30' },
	rrule: null,
	excludedDates: [],
	visibility: 'private',
	...overrides,
});

describe('UserEventStore', () => {
	it('予定を足して、持ち主が読み戻せる。時間の 3 つの種類を、そのまま保存できる', () => {
		const { store, alice } = setup();
		const timed = store.create(alice, input(), T0);
		const period = store.create(alice, input({ time: { kind: 'period', from: 2, to: 3 } }), T0);
		const allDay = store.create(
			alice,
			input({
				endDate: '2026-10-08',
				time: { kind: 'allDay' },
				rrule: 'FREQ=WEEKLY;BYDAY=MO',
				excludedDates: ['2026-10-12'],
			}),
			T0,
		);
		expect(store.get(timed, alice)).toEqual({ id: timed, ...input(), shareToken: null });
		expect(store.get(period, alice)?.time).toEqual({ kind: 'period', from: 2, to: 3 });
		expect(store.get(allDay, alice)).toMatchObject({
			endDate: '2026-10-08',
			time: { kind: 'allDay' },
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			excludedDates: ['2026-10-12'],
		});
	});

	it('ほかの人の予定は、読めず、直せず、消せない', () => {
		const { store, alice, bob } = setup();
		const id = store.create(alice, input(), T0);
		expect(store.get(id, bob)).toBeNull();
		expect(store.update(id, bob, input({ title: '乗っ取り' }), T1)).toBe(false);
		expect(store.delete(id, bob)).toBe(false);
		expect(store.get(id, alice)?.title).toBe('架空のサークル');
		expect(store.listByOwner(bob)).toEqual([]);
	});

	it('持ち主は、予定を直し、消せる', () => {
		const { store, alice } = setup();
		const id = store.create(alice, input(), T0);
		expect(store.update(id, alice, input({ title: '改名', time: { kind: 'allDay' } }), T1)).toBe(
			true,
		);
		expect(store.get(id, alice)).toMatchObject({ title: '改名', time: { kind: 'allDay' } });
		expect(store.delete(id, alice)).toBe(true);
		expect(store.get(id, alice)).toBeNull();
		expect(store.delete(id, alice)).toBe(false);
	});

	it('一覧は、始まりの日の順に返す', () => {
		const { store, alice } = setup();
		store.create(alice, input({ title: 'B', startDate: '2026-11-01', endDate: '2026-11-01' }), T0);
		store.create(alice, input({ title: 'A', startDate: '2026-10-01', endDate: '2026-10-01' }), T0);
		expect(store.listByOwner(alice).map((event) => event.title)).toEqual(['A', 'B']);
	});

	it('利用者を削除すると、その人の予定も消える', () => {
		const { store, alice } = setup();
		store.create(alice, input(), T0);
		const deleted = database.sqlite.prepare('DELETE FROM users WHERE id = ?').run(alice);
		expect(deleted.changes).toBe(1);
		expect(store.listByOwner(alice)).toEqual([]);
	});
});

describe('公開範囲', () => {
	it('新しい予定は非公開。限定公開にするとリンクの値ができ、非公開に戻すと消える', () => {
		const { store, alice } = setup();
		const id = store.create(alice, input(), T0);
		expect(store.get(id, alice)).toMatchObject({ visibility: 'private', shareToken: null });
		store.update(id, alice, input({ visibility: 'link' }), T1);
		const token = store.get(id, alice)?.shareToken;
		expect(token).toMatch(/^[\w-]{43}$/);
		// 直しても、リンクの値は変わらない
		store.update(id, alice, input({ visibility: 'link', title: '改名' }), T1);
		expect(store.get(id, alice)?.shareToken).toBe(token);
		// 全体に公開すると、リンクは使えなくなる。非公開に戻しても同じ
		store.update(id, alice, input({ visibility: 'public' }), T1);
		expect(store.get(id, alice)?.shareToken).toBeNull();
		store.update(id, alice, input({ visibility: 'private' }), T1);
		expect(store.get(id, alice)?.shareToken).toBeNull();
	});

	it('リンクを再発行すると、前のリンクは使えなくなる。限定公開でなければ、再発行しない', () => {
		const { store, alice, bob, bobViewer } = setup();
		const id = store.create(alice, input({ visibility: 'link' }), T0);
		const first = store.get(id, alice)?.shareToken ?? '';
		expect(store.findShared(first, bobViewer)?.event.id).toBe(id);
		expect(store.rotateShareToken(id, alice)).toBe(true);
		const second = store.get(id, alice)?.shareToken;
		expect(second).not.toBe(first);
		expect(store.findShared(first, bobViewer)).toBeNull();
		expect(store.findShared(second ?? '', bobViewer)?.event.id).toBe(id);
		const privateId = store.create(alice, input(), T0);
		expect(store.rotateShareToken(privateId, alice)).toBe(false);
		expect(store.rotateShareToken(id, bob)).toBe(false);
	});

	it('ほかの人が見られるのは、リンクの値を知っているか、全体に公開された予定だけ。非公開は見られない', () => {
		const { store, alice, aliceViewer, bobViewer } = setup();
		const linked = store.create(alice, input({ visibility: 'link' }), T0);
		const open = store.create(alice, input({ visibility: 'public', title: '全体' }), T0);
		const hidden = store.create(alice, input({ title: '非公開' }), T0);
		expect(store.findShared(String(open), bobViewer)?.event.title).toBe('全体');
		expect(store.findShared(String(hidden), bobViewer)).toBeNull();
		// リンクの予定は、番号では開けない (リンクの値だけ)
		expect(store.findShared(String(linked), bobViewer)).toBeNull();
		// 持ち主は、自分の予定を、番号で開ける
		expect(store.findShared(String(hidden), aliceViewer)).toMatchObject({ isOwner: true });
		expect(store.findShared('存在しない値', bobViewer)).toBeNull();
	});

	it('返す予定に、持ち主の情報は含めない', () => {
		const { store, alice, bob, bobViewer } = setup();
		const id = store.create(alice, input({ visibility: 'public' }), T0);
		const shared = store.findShared(String(id), bobViewer);
		expect(JSON.stringify(shared)).not.toContain(alice);
		expect(JSON.stringify(store.listPublic(bob))).not.toContain(alice);
	});

	it('全体に公開された予定の一覧は、自分の予定を除き、加えたかどうかを添える', () => {
		const { store, alice, bob, bobViewer } = setup();
		const open = store.create(alice, input({ visibility: 'public', title: 'A' }), T0);
		store.create(alice, input({ title: '非公開' }), T0);
		store.create(bob, input({ visibility: 'public', title: 'Bの予定' }), T0);
		expect(store.listPublic(bob).map((item) => [item.event.title, item.subscribed])).toEqual([
			['A', false],
		]);
		expect(store.subscribe(bobViewer, open, T1)).toBe(true);
		expect(store.listPublic(bob).map((item) => item.subscribed)).toEqual([true]);
	});

	it('ほかの人の予定を、自分の時間割に加え、外せる。自分の予定と、非公開の予定は加えられない', () => {
		const { store, alice, bob, aliceViewer, bobViewer } = setup();
		const open = store.create(alice, input({ visibility: 'public' }), T0);
		const linked = store.create(alice, input({ visibility: 'link' }), T0);
		const hidden = store.create(alice, input(), T0);
		expect(store.subscribe(bobViewer, open, T1)).toBe(true);
		expect(store.subscribe(bobViewer, linked, T1)).toBe(true);
		expect(store.subscribe(bobViewer, hidden, T1)).toBe(false);
		expect(store.subscribe(aliceViewer, open, T1)).toBe(false);
		expect(store.listSubscribed(bobViewer).map((event) => event.id)).toEqual([open, linked]);
		expect(store.unsubscribe(bob, open)).toBe(true);
		expect(store.listSubscribed(bobViewer).map((event) => event.id)).toEqual([linked]);
		expect(store.unsubscribe(bob, open)).toBe(false);
	});

	it('持ち主が直すと、加えた人にも反映される。非公開にすると、加えた人の時間割から消え、公開し直すと戻る。消すと、なくなる', () => {
		const { store, alice, bobViewer } = setup();
		const id = store.create(alice, input({ visibility: 'public', title: '元' }), T0);
		store.subscribe(bobViewer, id, T1);
		store.update(id, alice, input({ visibility: 'public', title: '直した' }), T1);
		expect(store.listSubscribed(bobViewer).map((event) => event.title)).toEqual(['直した']);
		store.update(id, alice, input({ visibility: 'private' }), T1);
		expect(store.listSubscribed(bobViewer)).toEqual([]);
		store.update(id, alice, input({ visibility: 'public' }), T1);
		expect(store.listSubscribed(bobViewer)).toHaveLength(1);
		store.delete(id, alice);
		expect(store.listSubscribed(bobViewer)).toEqual([]);
	});

	it('非公開でも、メールアドレスで招待した人には見せ、時間割にも加えられる。外すと見えなくなる (#215)', () => {
		const { store, alice, aliceViewer, bobViewer } = setup();
		const grants = createAccessGrantStore(database);
		const hidden = store.create(alice, input({ title: '非公開' }), T0);
		expect(store.findShared(String(hidden), bobViewer)).toBeNull();
		expect(store.subscribe(bobViewer, hidden, T0)).toBe(false);
		grants.grant('event', hidden, bobViewer.email, T0);
		expect(store.findShared(String(hidden), bobViewer)).toMatchObject({ isOwner: false });
		expect(store.subscribe(bobViewer, hidden, T0)).toBe(true);
		expect(store.listSubscribed(bobViewer).map((event) => event.id)).toEqual([hidden]);
		grants.revoke('event', hidden, bobViewer.email);
		expect(store.findShared(String(hidden), bobViewer)).toBeNull();
		expect(store.listSubscribed(bobViewer)).toEqual([]);
		// 持ち主は、招待していなくても、いつでも自分の予定を開ける
		expect(store.findShared(String(hidden), aliceViewer)).toMatchObject({ isOwner: true });
	});
});
