// 定期処理の実行の仕組み。同じプロセスの中で croner が起動する。
// 守ること: 同じタスクは同時に 1 つだけ、タスクごとに締め切りを設ける、取得の時刻にゆらぎを入れる、1 つの失敗をほかのタスクや画面に波及させない、停止するときは実行中の処理を待つ。
// 記録先は JobRunStore として受け取る (実際の保存は @funmary/db)。時刻、乱数、待ちは差し替えられる。
import type { Logger } from '@funmary/log';
import { Cron } from 'croner';

export type JobStatus = 'running' | 'succeeded' | 'failed' | 'skipped';

export interface JobRunRecord {
	readonly id: number;
	readonly job: string;
	readonly startedAt: Date;
	finishedAt: Date | null;
	status: JobStatus;
	message: string | null;
}

/** 実行の記録先 */
export interface JobRunStore {
	/** 動き始めたことを記録し、記録の番号を返す */
	start(job: string, startedAt: Date): number;
	finish(id: number, status: Exclude<JobStatus, 'running'>, message: string | null, at: Date): void;
	/** 動かさなかったこと (同じタスクが動いている、停止中) を記録する */
	recordSkipped(job: string, at: Date, message: string): void;
}

export interface JobContext {
	/** 締め切りや停止で中断されると、abort される。外への通信に渡す */
	readonly signal: AbortSignal;
	readonly now: () => Date;
	readonly log: Logger;
	/** 管理者や管理用コマンドが、手で動かしたとき true。cron で動いたときは false (省くと false) */
	readonly manual?: boolean;
}

export interface JobDefinition {
	/** タスクの名前。例: scrape-portal */
	readonly name: string;
	/** cron 式。日本時間 (Asia/Tokyo) で読む */
	readonly schedule: string;
	/** 締め切り。これを過ぎたら失敗として記録する */
	readonly timeoutMs: number;
	/** 時刻ぴったりに動かさず、0 からこの時間までのランダムな遅れを入れる */
	readonly jitterMs?: number;
	/**
	 * 短い間隔で動かし、たいていは何もしない処理に付ける。成功して文を返さなかった回は記録しない
	 * (実行の記録が、ほかの処理の記録を押し流さないように)。動いている間も、記録には running を残さない
	 */
	readonly quietWhenIdle?: boolean;
	/** 実行する処理。返した文は、記録の message に残る */
	run(context: JobContext): Promise<string | void>;
}

export interface JobResult {
	readonly status: Exclude<JobStatus, 'running'>;
	readonly message: string | null;
}

export interface JobRunnerOptions {
	readonly jobs: readonly JobDefinition[];
	readonly store: JobRunStore;
	readonly log: Logger;
	readonly now?: () => Date;
	readonly random?: () => number;
	readonly sleep?: (ms: number) => Promise<void>;
	/** 処理が終わるたびに呼ぶ (管理者への知らせなどに使う)。ここで例外が出ても、実行の結果には影響しない */
	readonly onFinish?: (job: string, result: JobResult) => void | Promise<void>;
}

export interface JobRunner {
	/** cron 式に従って動かし始める */
	start(): void;
	/** 待たずに 1 回動かす (管理用コマンドの job run と、テストが使う)。動かさなかったときも結果を返す */
	/** 今すぐ動かす (管理者の操作と、管理用コマンド)。処理には manual: true で伝わる */
	runNow(name: string): Promise<JobResult>;
	/** 次の実行の時刻を、from より後から count 個返す */
	nextRuns(name: string, count: number, from?: Date): Date[];
	/**
	 * 新しい処理を受け付けなくし、実行中の処理を最大 graceMs だけ待つ。
	 * 終わらなかった処理は中断を知らせ、その名前を返す
	 */
	stop(options: { graceMs: number }): Promise<{ abandoned: string[] }>;
}

const TIMEZONE = 'Asia/Tokyo';

function toError(reason: unknown): Error {
	return reason instanceof Error ? reason : new Error(String(reason));
}

export function createJobRunner(options: JobRunnerOptions): JobRunner {
	const { store, log } = options;
	const now = options.now ?? (() => new Date());
	const random = options.random ?? Math.random;
	const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
	const jobs = new Map(options.jobs.map((job) => [job.name, job]));
	const running = new Map<string, { done: Promise<unknown>; controller: AbortController }>();
	const crons: Cron[] = [];
	let stopping = false;

	const find = (name: string) => {
		const job = jobs.get(name);
		if (!job) {
			throw new Error(
				`定期処理 ${name} はありません。あるのは ${[...jobs.keys()].join('、')} です`,
			);
		}
		return job;
	};

	const skip = (name: string, message: string): JobResult => {
		store.recordSkipped(name, now(), message);
		log.withTag('job').warn(`${name} は動かしませんでした: ${message}`);
		return { status: 'skipped', message };
	};

	/** manual が true のとき、処理に手で動かしたことを伝える。cron からは false で呼ぶ */
	async function execute(name: string, manual: boolean): Promise<JobResult> {
		const job = find(name);
		if (stopping) return skip(name, '停止中なので、動かしませんでした');
		if (running.has(name))
			return skip(name, '前の実行がまだ終わっていないので、動かしませんでした');

		const tagged = log.withTag(name);
		const controller = new AbortController();
		const startedAt = now();
		const id = job.quietWhenIdle ? null : store.start(name, startedAt);
		if (!job.quietWhenIdle) tagged.info('始めます');

		const work = (async (): Promise<JobResult> => {
			const timer = setTimeout(
				() => controller.abort(new Error(`締め切り (${job.timeoutMs} ms) を過ぎました`)),
				job.timeoutMs,
			);
			try {
				// 締め切りに気づかない処理でも、締め切りで抜けられるように、中断と競わせる
				const aborted = new Promise<never>((_resolve, reject) => {
					controller.signal.addEventListener(
						'abort',
						() => reject(toError(controller.signal.reason)),
						{
							once: true,
						},
					);
				});
				const outcome = await Promise.race([
					job.run({ signal: controller.signal, now, log: tagged, manual }),
					aborted,
				]);
				return { status: 'succeeded', message: typeof outcome === 'string' ? outcome : null };
			} catch (error) {
				return {
					status: 'failed',
					message: error instanceof Error ? error.message : String(error),
				};
			} finally {
				clearTimeout(timer);
			}
		})();

		running.set(name, { done: work, controller });
		const result = await work;
		running.delete(name);
		const idle = result.status === 'succeeded' && result.message === null;
		if (id !== null) store.finish(id, result.status, result.message, now());
		else if (!idle)
			store.finish(store.start(name, startedAt), result.status, result.message, now());
		try {
			await options.onFinish?.(name, result);
		} catch (error) {
			tagged.error(
				`onFinish で例外が出ました: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		const took = now().getTime() - startedAt.getTime();
		if (job.quietWhenIdle && idle) return result;
		if (result.status === 'succeeded') {
			tagged.info(`成功 (${took} ms)${result.message ? `: ${result.message}` : ''}`);
		} else {
			tagged.error(`失敗 (${took} ms): ${result.message ?? ''}`);
		}
		return result;
	}

	return {
		runNow: (name) => execute(name, true),
		start() {
			for (const job of jobs.values()) {
				crons.push(
					new Cron(job.schedule, { timezone: TIMEZONE, protect: false, catch: true }, async () => {
						// 取得元に毎回同じ時刻に接続しないよう、ゆらぎを入れる
						if (job.jitterMs) await sleep(Math.floor(random() * job.jitterMs));
						await execute(job.name, false);
					}),
				);
			}
		},
		nextRuns(name, count, from = now()) {
			return new Cron(find(name).schedule, { timezone: TIMEZONE }).nextRuns(count, from);
		},
		async stop({ graceMs }) {
			stopping = true;
			for (const cron of crons) cron.stop();
			const pending = [...running.values()].map((entry) => entry.done);
			if (pending.length > 0) {
				let timer: ReturnType<typeof setTimeout> | undefined;
				await Promise.race([
					Promise.allSettled(pending),
					new Promise<void>((resolve) => {
						timer = setTimeout(resolve, graceMs);
					}),
				]);
				clearTimeout(timer);
			}
			const abandoned = [...running.keys()];
			for (const name of abandoned) {
				running.get(name)?.controller.abort(new Error('停止するので、中断します'));
			}
			return { abandoned };
		},
	};
}
