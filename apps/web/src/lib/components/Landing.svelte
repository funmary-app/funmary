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
	@use './Landing';
</style>
