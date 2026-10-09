import { and, eq } from 'drizzle-orm';
import type { Database } from './database.ts';
import { subjectAbbreviations } from './schema.ts';

export interface SubjectAbbreviationStore {
	/** 未保存なら undefined、正式名称を使う指定なら空文字を返す */
	get(userId: string, subjectId: number): string | undefined;
	list(userId: string): Map<number, string>;
	set(userId: string, subjectId: number, abbreviation: string, now: Date): void;
}

/** 利用者ごとに科目の略称を保存する。共有の科目名は変更しない */
export function createSubjectAbbreviationStore(database: Database): SubjectAbbreviationStore {
	const { db } = database;
	return {
		get(userId, subjectId) {
			return db
				.select({ abbreviation: subjectAbbreviations.abbreviation })
				.from(subjectAbbreviations)
				.where(
					and(
						eq(subjectAbbreviations.userId, userId),
						eq(subjectAbbreviations.subjectId, subjectId),
					),
				)
				.get()?.abbreviation;
		},
		list(userId) {
			return new Map(
				db
					.select({
						subjectId: subjectAbbreviations.subjectId,
						abbreviation: subjectAbbreviations.abbreviation,
					})
					.from(subjectAbbreviations)
					.where(eq(subjectAbbreviations.userId, userId))
					.all()
					.map(({ subjectId, abbreviation }) => [subjectId, abbreviation]),
			);
		},
		set(userId, subjectId, abbreviation, now) {
			db.insert(subjectAbbreviations)
				.values({ userId, subjectId, abbreviation, updatedAt: now })
				.onConflictDoUpdate({
					target: [subjectAbbreviations.userId, subjectAbbreviations.subjectId],
					set: { abbreviation, updatedAt: now },
				})
				.run();
		},
	};
}
