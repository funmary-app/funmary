<script lang="ts">
	import Button, { Label } from '@smui/button';
	import IconCalendar from '~icons/material-symbols/calendar-view-week-outline';
	import IconCalendarSync from '~icons/material-symbols/calendar-add-on-outline';
	import IconDetail from '~icons/material-symbols/menu-book-outline';
	import IconImport from '~icons/material-symbols/bookmark-add-outline';
	import IconAi from '~icons/material-symbols/smart-toy-outline';
	import IconBell from '~icons/material-symbols/notifications-outline';
	import IconNotice from '~icons/material-symbols/swap-horiz';
	import IconToday from '~icons/material-symbols/today-outline';
	import BrandLogo from '#lib/components/BrandLogo.svelte';
	import LessonRoom from '#lib/components/LessonRoom.svelte';
	import StatusBadge from '#lib/components/StatusBadge.svelte';
	import { resolve } from '$app/paths';
	import { OFFICIAL_ACCOUNTS } from '#lib/official-accounts.ts';

	// 紹介の画面。ログインしているかどうかにかかわらず出す。できることだけを書き、準備中のものは準備中と書く
	let {
		registration,
		signedIn,
		inviteCode = null,
	}: {
		registration: 'invite' | 'open' | 'closed';
		signedIn: boolean;
		/** 招待コードのリンクで来たときに、入力欄へ入れておく値 */
		inviteCode?: string | null;
	} = $props();

	const FEATURES = [
		{
			icon: IconToday,
			title: '今日の授業と、次の授業の教室',
			text: '今日の画面のいちばん上に、次の授業の時刻と教室を大きく出します。授業中なら、その授業を出します。',
		},
		{
			icon: IconNotice,
			title: '休講、補講、教室変更を時間割に反映',
			text: '学生ポータルの休講などの一覧を定期的に確かめ、履修している授業の分を時間割に入れます。色だけでなく、文字とアイコンでも示します。',
		},
		{
			icon: IconCalendar,
			title: '祝日や振替授業日も入った週の時間割',
			text: '祝日、振替授業日、全学の休講日を反映した 1 週間の時間割です。カレンダーから、見たい週へすぐ移れます。',
		},
		{
			icon: IconDetail,
			title: '授業のことを 1 画面で',
			text: '教員、曜日と時限、教室、シラバスの内容、その授業の休講などの履歴を、まとめて見られます。',
		},
		{
			icon: IconImport,
			title: '履修科目は、ポータルの時間割から取り込める',
			text: 'ブックマークを 1 回押すと、学生ポータルの時間割から履修科目を取り込めます。科目を探して 1 つずつ登録することもできます。',
		},
		{
			icon: IconBell,
			title: '休講などの知らせを、通知欄、Discord、RSS で',
			text: '履修している授業の休講、補講、教室変更を、アプリの通知欄に残します。Discord のサーバーやダイレクトメッセージ、Webhook、RSS などのフィードにも届けられます。',
		},
		{
			icon: IconCalendarSync,
			title: 'ふだん使っているカレンダーにも反映',
			text: 'Google カレンダーや iPhone のカレンダーに、履修科目の授業と、休講、補講、教室変更を反映します。',
		},
		{
			icon: IconAi,
			title: '自分の AI や、スクリプトからも使える',
			text: '公開 API と MCP サーバーで、自分の時間割と休講を、AI エージェントやスクリプトから読めます。Discord では、/today、/next、/week、/changes で答えます。',
		},
	];
</script>

<div class="landing">
	<section class="hero" aria-labelledby="hero-heading">
		<div class="hero-text">
			<p class="hero-logo"><BrandLogo height="3.5rem" /></p>
			<h1 id="hero-heading">
				大学の<span class="nowrap">「知りたい」</span>を、<br class="heading-break" />すべて。
			</h1>
			<p class="subcatch">履修の取り込みから、休講、教室変更、カレンダー連携、AI 連携まで。</p>
			<p class="lead">
				Funmary は、公立はこだて未来大学の学生向けの便利な総合 Web
				アプリです。学生ポータルの休講、補講、教室変更を、あなたの時間割にまとめて出します。
			</p>

			<div class="start">
				{#if signedIn}
					<Button href={resolve('app')} variant="unelevated"><Label>アプリを開く</Label></Button>
				{:else}
					{#if registration === 'closed'}
						<p class="muted">
							いまは、新しい登録を受け付けていません。登録済みの方はログインできます。
						</p>
					{/if}
					<!-- /auth は SvelteKit の画面ではなく、サーバーが処理するので、通常の移動にする -->
					<Button href="/auth/google" variant="unelevated" data-sveltekit-reload>
						<Label
							>{registration === 'open'
								? '大学のアカウントではじめる'
								: '大学のアカウントでログイン'}</Label
						>
					</Button>
					<p class="note">
						@fun.ac.jp の Google アカウントを使います。スマホでも PC でも使えます。
					</p>

					{#if registration === 'invite'}
						<form method="GET" action="/signup" class="invite" data-sveltekit-reload>
							<label for="invite-code">はじめての方は、招待コードで登録します</label>
							<div class="invite-row">
								<input
									id="invite-code"
									name="code"
									value={inviteCode ?? ''}
									required
									autocomplete="off"
									spellcheck="false"
									maxlength="100"
								/>
								<Button type="submit" variant="outlined"><Label>招待コードで登録</Label></Button>
							</div>
						</form>
					{/if}
				{/if}
			</div>
		</div>

		<figure class="preview">
			<div class="device">
				<div class="next">
					<p class="next-label">次の授業</p>
					<p class="next-time">13:10-14:40 <span>3 限</span></p>
					<p class="next-room">講堂</p>
					<p class="next-subject">
						情報演習 <StatusBadge status="roomChanged" />
					</p>
				</div>
				<ul class="lessons">
					<li>
						<span class="when">1 限</span>
						<span class="what">線形代数</span>
						<span class="room"><LessonRoom room="363" tentative={false} /></span>
					</li>
					<li class="cancelled">
						<span class="when">2 限</span>
						<span class="what">英語<StatusBadge status="cancelled" /></span>
						<span class="room"><LessonRoom room="484" tentative={false} /></span>
					</li>
					<li>
						<span class="when">5 限</span>
						<span class="what">物理 <StatusBadge status="makeup" /></span>
						<span class="room"><LessonRoom room="495" tentative={false} /></span>
					</li>
				</ul>
			</div>
			<figcaption>画面の例</figcaption>
		</figure>
	</section>

	<section aria-labelledby="features-heading">
		<h2 id="features-heading">できること</h2>
		<ul class="features">
			{#each FEATURES as feature (feature.title)}
				<li>
					<feature.icon aria-hidden="true" class="feature-icon" />
					<div>
						<h3>{feature.title}</h3>
						<p>{feature.text}</p>
					</div>
				</li>
			{/each}
		</ul>
		<p class="soon">
			準備中: ブラウザのプッシュ通知、授業前のリマインダー、欠席の記録、時間割の共有。
		</p>
	</section>

	<section aria-labelledby="trust-heading">
		<h2 id="trust-heading">安心して使うために</h2>
		<ul class="trust">
			<li>
				ログインには大学の Google アカウントを使います。Funmary
				にパスワードを入れることはありません。
			</li>
			<li>
				ポータルの時間割の読み取りは、あなたのブラウザの中で行います。ポータルのパスワードは Funmary
				に送られません。
			</li>
			<li>
				Funmary
				は公立はこだて未来大学の公式のアプリではありません。休講などは、大学の案内もあわせて確かめてください。
			</li>
		</ul>
	</section>

	<section aria-labelledby="news-heading">
		<h2 id="news-heading">お知らせ</h2>
		<p class="news">
			新しい機能や、開発の様子は、公式のアカウントでお知らせしています:
			{#each OFFICIAL_ACCOUNTS as account, index (account.url)}
				{#if index > 0}、{/if}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 外部サイトへのリンク -->
				<a href={account.url} target="_blank" rel="noopener noreferrer">{account.label}</a>
			{/each}
		</p>
	</section>
</div>

<style lang="scss">
	@use 'mixins';

	@use 'breakpoints';

	.landing {
		max-width: 64rem;
	}

	.hero {
		display: grid;
		gap: 2.5rem;
		padding: 1rem 0 2rem;

		@include breakpoints.wide {
			grid-template-columns: minmax(0, 1.1fr) minmax(0, 0.9fr);
			align-items: center;
			padding: 3rem 0 3.5rem;
		}
	}

	.hero-logo {
		margin: 0 0 1.5rem;
	}

	.hero-text {
		// 見出しが 1 行に収まる幅かどうかを、画面幅ではなく、この列自体の実際の幅で判断する
		// (2 段組みになる幅でも、この列はまだ 1 行分の幅がないことがあるため)
		container-type: inline-size;
	}

	h1 {
		margin: 0 0 1rem;
		font-size: 2rem;
		line-height: 1.3;
		letter-spacing: -0.01em;

		@include breakpoints.wide {
			font-size: 2.75rem;
		}
	}

	/* 「知りたい」が、括弧の途中で折り返らないようにする */
	.nowrap {
		white-space: nowrap;
	}

	/* 見出しが折り返るときは、必ず「を、」の後ろで折り返す。1 行に収まる幅があれば、改行させない */
	.heading-break {
		display: inline;
	}

	@container (min-width: 32rem) {
		.heading-break {
			display: none;
		}
	}

	.subcatch {
		margin: 0 0 1rem;
		color: var(--fm-primary);
		font-size: 1.0625rem;
		font-weight: 700;
		max-width: 34em;
	}

	.lead {
		margin: 0 0 1.75rem;
		color: var(--fm-text-muted);
		font-size: 1.0625rem;
		max-width: 34em;
	}

	.start {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.5rem;
	}

	.note {
		margin: 0;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
	}

	.invite {
		@include mixins.stack(0.375rem);
		width: 100%;
		max-width: 26rem;
		margin-top: 1.25rem;
		padding-top: 1.25rem;
		border-top: 1px dashed var(--fm-divider);

		label {
			font-size: 0.875rem;
		}
	}

	.invite-row {
		@include mixins.wrap-row(0.5rem);

		input {
			flex: 1 1 10rem;
		}
	}

	/* 画面の例。本物の部品 (教室、休講などのラベル) で描く */
	.preview {
		margin: 0;
	}

	.device {
		padding: 1rem;
		border: 1px solid var(--fm-divider);
		border-radius: 1.25rem;
		background: var(--fm-surface);
		box-shadow: 0 12px 32px -16px rgb(0 0 0 / 0.35);
	}

	.next {
		padding: 1rem 1.25rem;
		border-radius: 0.75rem;
		background: var(--fm-primary-soft);

		p {
			margin: 0;
		}
	}

	.next-label {
		color: var(--fm-primary);
		font-size: 0.8125rem;
		font-weight: 700;
	}

	.next-time {
		font-size: 1.5rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;

		span {
			font-size: 0.875rem;
			font-weight: 400;
		}
	}

	.next-room {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.next .next-subject {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
		margin-top: 0.25rem;
		font-size: 0.9375rem;
	}

	.lessons {
		margin: 0.75rem 0 0;
		padding: 0;
		list-style: none;
		font-size: 0.875rem;

		li {
			display: grid;
			grid-template-columns: 2.5rem minmax(0, 1fr) auto;
			align-items: baseline;
			gap: 0.5rem;
			padding: 0.5rem 0.25rem;
			border-bottom: 1px dashed var(--fm-divider);
		}

		li:last-child {
			border-bottom: 0;
		}
	}

	.when {
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.what {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.25rem 0.5rem;
	}

	.cancelled .what {
		text-decoration: line-through;
	}

	figcaption {
		margin-top: 0.5rem;
		color: var(--fm-text-muted);
		font-size: 0.8125rem;
		text-align: center;
	}

	h2 {
		margin: 2.5rem 0 1rem;
		font-size: 1.25rem;
	}

	.features {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;

		@include breakpoints.wide {
			grid-template-columns: repeat(2, minmax(0, 1fr));
			column-gap: 2.5rem;
		}

		li {
			display: flex;
			gap: 1rem;
			padding: 1.25rem 0;
			border-top: 1px dashed var(--fm-divider);
		}

		h3 {
			margin: 0 0 0.25rem;
			font-size: 1rem;
		}

		p {
			margin: 0;
			color: var(--fm-text-muted);
			font-size: 0.9375rem;
		}
	}

	.features :global(.feature-icon) {
		flex: none;
		width: 1.75rem;
		height: 1.75rem;
		color: var(--fm-primary);
	}

	.news {
		margin: 0;
		color: var(--fm-text-muted);
	}

	.soon {
		margin: 0.5rem 0 0;
		padding: 0.75rem 1rem;
		border-radius: 0.5rem;
		background: var(--fm-surface-muted);
		color: var(--fm-text-muted);
		font-size: 0.875rem;
	}

	.trust {
		margin: 0;
		padding-left: 1.25rem;
		color: var(--fm-text-muted);

		li + li {
			margin-top: 0.5rem;
		}
	}
</style>
