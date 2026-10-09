<script lang="ts">
	import type { Component } from 'svelte';
	import { resolve } from '$app/paths';
	import { confirmSubmit } from '#lib/actions/confirm-submit.ts';
	import type { AdminSummary } from '#lib/server/admin-summary.ts';
	import IconAccount from '~icons/material-symbols/manage-accounts-outline';
	import IconAbout from '~icons/material-symbols/info-outline';
	import IconAuditLog from '~icons/material-symbols/fact-check-outline';
	import IconCalendar from '~icons/material-symbols/calendar-add-on-outline';
	import IconChevron from '~icons/material-symbols/chevron-right';
	import IconContributors from '~icons/material-symbols/groups-outline';
	import IconDiscord from '~icons/material-symbols/forum-outline';
	import IconFeed from '~icons/material-symbols/rss-feed';
	import IconHistory from '~icons/material-symbols/monitor-heart-outline';
	import IconInvite from '~icons/material-symbols/person-add-outline';
	import IconKey from '~icons/material-symbols/key-outline';
	import IconLicense from '~icons/material-symbols/policy-outline';
	import IconLink from '~icons/material-symbols/link';
	import IconLogout from '~icons/material-symbols/logout';
	import IconPrivacy from '~icons/material-symbols/privacy-tip-outline';
	import IconSchool from '~icons/material-symbols/event-note-outline';
	import IconSlotReview from '~icons/material-symbols/task-outline';
	import IconTerms from '~icons/material-symbols/gavel';
	import IconThirdParty from '~icons/material-symbols/inventory-2-outline';
	import IconUpload from '~icons/material-symbols/upload-file-outline';

	let {
		data,
	}: {
		data: {
			admin: AdminSummary | null;
			moderator: boolean;
			canInvite: boolean;
			documents: { title: string; url: string }[];
			discordLinkAvailable: boolean;
		};
	} = $props();

	interface Item {
		href: string;
		icon: Component;
		title: string;
		description: string;
		/** 管理者に手を入れてほしいことがあるとき */
		attention?: boolean;
	}

	const personal = $derived.by((): Item[] => [
		{
			href: resolve('app/settings/calendar'),
			icon: IconCalendar,
			title: 'カレンダーの購読',
			description: '授業の予定を、Google カレンダーや iPhone のカレンダーに入れる',
		},
		{
			href: resolve('app/settings/webhooks'),
			icon: IconDiscord,
			title: 'Webhook',
			description: '休講などの通知を、Discord のチャンネルや、自分で用意した URL に届ける',
		},
		{
			href: resolve('app/settings/feed'),
			icon: IconFeed,
			title: 'お知らせのフィード',
			description: '休講などの通知を、RSS リーダーで受け取る',
		},
		{
			href: resolve('app/settings/tokens'),
			icon: IconKey,
			title: '公開 API と MCP',
			description: '自分の AI エージェントやスクリプトから、時間割や休講を読み取り専用で読む',
		},
		...(data.discordLinkAvailable
			? [
					{
						href: resolve('app/settings/discord'),
						icon: IconDiscord,
						title: 'Discord連携',
						description: '休講などの通知を、Discord の非公開スレッドか DM で受け取る',
					},
				]
			: []),
		...(data.canInvite
			? [
					{
						href: resolve('app/settings/invites'),
						icon: IconInvite,
						title: '招待',
						description: '友だちを招待するコードを発行する',
					},
				]
			: []),
	]);

	const adminItems = $derived.by((): Item[] => {
		const admin = data.admin;
		if (!admin) return [];
		return [
			{
				href: resolve('app/admin/lessons'),
				icon: IconLink,
				title: '照合できなかった授業名',
				description:
					admin.unresolvedLessons > 0
						? `${admin.unresolvedLessons} 件を、科目に紐付けてください`
						: 'すべて紐付け済みです',
				attention: admin.unresolvedLessons > 0,
			},
			{
				href: resolve('app/admin/calendar'),
				icon: IconSchool,
				title: '学年暦',
				description:
					admin.estimatedTerms > 0
						? `${admin.calendarYear} 年度の前期と後期のうち ${admin.estimatedTerms} つが推定のままです`
						: `${admin.calendarYear} 年度は入力済みです`,
				attention: admin.estimatedTerms > 0,
			},
			{
				href: resolve('app/admin/timetable'),
				icon: IconUpload,
				title: '授業時間割の取り込み',
				description: '大学が配る PDF から、曜日、時限、教室を入れる',
			},
			{
				href: resolve('app/admin/invites'),
				icon: IconInvite,
				title: '招待コード',
				description: '発行できる人と、発行されたコード',
			},
			{
				href: resolve('app/admin/test-accounts'),
				icon: IconAccount,
				title: 'テストアカウント',
				description: '大学のアカウントでない Google のアカウントで、機能を試す',
			},
			{
				href: resolve('app/admin/status'),
				icon: IconHistory,
				title: '取得元と実行履歴',
				description: '学生ポータルなどの取得の状態と、定期処理の記録',
			},
			{
				href: resolve('app/admin/discord'),
				icon: IconDiscord,
				title: 'Discord設定',
				description: 'Bot のチャンネルとロールを整え、ロールをユーザーに付ける',
			},
			{
				href: resolve('app/admin/support-invites'),
				icon: IconDiscord,
				title: 'サポートサーバーの招待',
				description: 'Discord の招待リンクの発行、登録、公開と取り消し',
			},
			{
				href: resolve('app/admin/webhooks'),
				icon: IconDiscord,
				title: 'Webhook の上限',
				description: '利用者が登録できる Webhook の個数',
			},
			{
				href: resolve('app/admin/audit-log'),
				icon: IconAuditLog,
				title: '操作の記録',
				description: 'シラバスにない授業の公開、情報の変更、削除、授業名の紐づけの記録',
			},
			{
				href: resolve('app/admin/slot-review'),
				icon: IconSlotReview,
				title: '曜日と時限の確認',
				description: 'だれが共有の枠を登録できるかの設定と、確認待ちの一覧',
			},
		];
	});

	const aboutItems: Item[] = [
		{
			href: resolve('about'),
			icon: IconAbout,
			title: 'リポジトリと作者',
			description: 'ソースコードと、Funmary を作った人へのリンク',
		},
		{
			href: resolve('license'),
			icon: IconLicense,
			title: 'ライセンス',
			description: 'Funmary 自身のライセンス (BSD-3-Clause または Apache-2.0)',
		},
		{
			href: resolve('third-party-licenses'),
			icon: IconThirdParty,
			title: 'サードパーティライセンス',
			description: '使っているオープンソースのソフトウェアの一覧',
		},
		{
			href: resolve('terms'),
			icon: IconTerms,
			title: '利用規約',
			description: '本サービスを利用するときの条件',
		},
		{
			href: resolve('privacy'),
			icon: IconPrivacy,
			title: 'プライバシーポリシー',
			description: '取得する情報と、その使い方',
		},
		{
			href: resolve('contributors'),
			icon: IconContributors,
			title: 'Contributors',
			description: 'コードを書いてくれた人たち',
		},
	];

	const moderatorItems = $derived.by((): Item[] => {
		if (!data.moderator) return [];
		return [
			{
				href: resolve('app/admin/audit-log'),
				icon: IconAuditLog,
				title: '操作の記録',
				description: 'シラバスにない授業の公開、情報の変更、削除、授業名の紐づけの記録',
			},
			{
				href: resolve('app/admin/slot-review'),
				icon: IconSlotReview,
				title: '曜日と時限の確認',
				description: '確認待ちの提出を承認、または却下する',
			},
		];
	});
</script>

<svelte:head>
	<title>設定 - Funmary</title>
	<meta name="robots" content="noindex" />
</svelte:head>

{#snippet links(items: Item[])}
	<ul class="links">
		{#each items as item (item.href)}
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href は resolve 済み -->
				<a href={item.href}>
					<item.icon aria-hidden="true" class="icon" />
					<span class="text">
						<span class="title">{item.title}</span>
						<span class={['description', { attention: item.attention }]}>{item.description}</span>
					</span>
					<IconChevron aria-hidden="true" class="icon" />
				</a>
			</li>
		{/each}
	</ul>
{/snippet}

<div class="page">
	<h1>設定</h1>
	{@render links(personal)}

	{#if data.documents.length > 0}
		<section aria-labelledby="documents-heading">
			<h2 id="documents-heading">大学の公式の資料</h2>
			<p class="muted">
				大学が配っている PDF を、大学のサイトで開きます (新しいタブ)。Funmary
				が作ったものではありません。
			</p>
			<ul class="documents">
				{#each data.documents as document (document.url)}
					<li>
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- 大学のサイトへの外部リンク。サーバーで大学サイトの https の PDF だと確かめてある -->
						<a href={document.url} target="_blank" rel="noopener noreferrer">
							{document.title} (PDF)
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section aria-labelledby="about-heading">
		<h2 id="about-heading">このアプリについて</h2>
		{@render links(aboutItems)}
	</section>

	<section aria-labelledby="account-heading">
		<h2 id="account-heading">アカウント</h2>
		<ul class="links">
			<li>
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- href は resolve 済み -->
				<a href={resolve('app/settings/account')}>
					<IconAccount aria-hidden="true" class="icon" />
					<span class="text">
						<span class="title">データの書き出しと退会</span>
						<span class="description">自分のデータを JSON で受け取る。アカウントを消す</span>
					</span>
					<IconChevron aria-hidden="true" class="icon" />
				</a>
			</li>
			<li>
				<!-- /auth は、サーバーが処理する。SvelteKit の form の処理を通さず、通常の送信にする -->
				<form
					method="POST"
					action="/auth/logout"
					data-sveltekit-reload
					use:confirmSubmit={'ログアウトします。よろしいですか?'}
				>
					<button type="submit">
						<IconLogout aria-hidden="true" class="icon" />
						<span class="text">
							<span class="title">ログアウト</span>
						</span>
					</button>
				</form>
			</li>
		</ul>
	</section>

	<!-- 管理者とモデレーターだけの項目は、ふだん使う項目の邪魔にならないよう、いちばん下に置く -->
	{#if data.admin}
		<section id="admin" aria-labelledby="admin-heading">
			<h2 id="admin-heading">管理</h2>
			<p class="muted">管理者にだけ出ています。</p>
			{@render links(adminItems)}
		</section>
	{:else if data.moderator}
		<section id="moderator" aria-labelledby="moderator-heading">
			<h2 id="moderator-heading">モデレーター</h2>
			<p class="muted">モデレーターにだけ出ています。</p>
			{@render links(moderatorItems)}
		</section>
	{/if}
</div>

<style lang="scss">
	section {
		margin-top: 2rem;
	}

	.documents {
		margin: 0;
		padding: 0;
		list-style: none;

		a {
			display: inline-flex;
			align-items: center;
			min-height: 44px;
		}
	}

	.links {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;

		a,
		button {
			display: flex;
			width: 100%;
			align-items: center;
			gap: 0.75rem;
			min-height: 56px;
			padding: 0.75rem 1rem;
			border: none;
			border-radius: 0.75rem;
			background: var(--fm-surface-muted);
			color: inherit;
			font: inherit;
			text-align: left;
			text-decoration: none;
			cursor: pointer;
		}

		a:hover,
		button:hover {
			background: var(--fm-primary-soft);
		}

		:global(.icon) {
			flex: none;
			width: 1.5rem;
			height: 1.5rem;
		}
	}

	.text {
		display: flex;
		flex: 1;
		flex-direction: column;
	}

	.title {
		font-weight: 700;
	}

	.description,
	.description.attention {
		color: var(--fm-primary);
		font-weight: 700;
	}
</style>
