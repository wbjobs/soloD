<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { fetchPublicNoteByShareId } from '$lib/firebase/notes';
	import type { Note } from '$lib/types/note';

	let loading = true;
	let note: Note | null = null;
	let error: string | null = null;

	$: shareId = $page.params.shareId;

	onMount(async () => {
		await loadNote();
	});

	async function loadNote() {
		loading = true;
		error = null;

		try {
			const fetchedNote = await fetchPublicNoteByShareId(shareId);

			if (!fetchedNote) {
				error = '笔记不存在或未公开分享';
			} else if (fetchedNote.isDeleted) {
				error = '该笔记已被删除';
			} else {
				note = fetchedNote;
			}
		} catch (err) {
			console.error('Error loading shared note:', err);
			error = '加载笔记时出错，请稍后重试';
		} finally {
			loading = false;
		}
	}

	function formatDate(date: Date | string): string {
		const d = typeof date === 'string' ? new Date(date) : date;
		return d.toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function handleGoBack() {
		window.history.back();
	}
</script>

<div class="shared-note-container">
	<header class="shared-header">
		<button class="btn btn-secondary" on:click={handleGoBack} title="返回">← 返回</button>
		<div class="header-title">
			<h1>📝 公开分享的笔记</h1>
		</div>
	</header>

	<main class="shared-content">
		{#if loading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>正在加载笔记...</p>
			</div>
		{:else if error}
			<div class="error-state card">
				<div class="error-icon">⚠️</div>
				<h2>无法查看笔记</h2>
				<p>{error}</p>
				<button class="btn btn-primary" on:click={() => window.location.href = '/'}>
					返回首页
				</button>
			</div>
		{:else if note}
			<article class="note-content card">
				<header class="note-header">
					<h2>{note.title || '无标题'}</h2>
					<div class="note-meta">
						<span>创建于 {formatDate(note.createdAt)}</span>
						{#if note.updatedAt !== note.createdAt}
							<span>• 最后更新 {formatDate(note.updatedAt)}</span>
						{/if}
					</div>
				</header>
				<div class="note-body">
					{#if note.content}
						{note.content}
					{:else}
						<p class="empty-content">该笔记暂无内容</p>
					{/if}
				</div>
			</article>
		{/if}
	</main>

	<footer class="shared-footer">
		<p>这是一篇公开分享的笔记，仅供查看</p>
	</footer>
</div>

<style>
	.shared-note-container {
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}

	.shared-header {
		padding: 1rem 2rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		color: white;
	}

	.header-title h1 {
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
	}

	.shared-content {
		flex: 1;
		padding: 2rem;
		max-width: 900px;
		margin: 0 auto;
		width: 100%;
	}

	.loading-state {
		text-align: center;
		padding: 4rem 2rem;
		color: white;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	.error-state {
		text-align: center;
		padding: 3rem 2rem;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.error-state h2 {
		color: #dc2626;
		margin-bottom: 0.5rem;
	}

	.error-state p {
		color: #666;
		margin-bottom: 1.5rem;
	}

	.note-content {
		background: white;
		border-radius: 12px;
		overflow: hidden;
	}

	.note-header {
		padding: 2rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.note-header h2 {
		font-size: 1.75rem;
		font-weight: 700;
		color: #111827;
		margin: 0 0 0.75rem;
	}

	.note-meta {
		font-size: 0.875rem;
		color: #6b7280;
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.note-body {
		padding: 2rem;
		min-height: 300px;
		white-space: pre-wrap;
		word-wrap: break-word;
		line-height: 1.75;
		color: #374151;
		font-size: 1rem;
	}

	.empty-content {
		color: #9ca3af;
		font-style: italic;
		text-align: center;
		padding: 2rem;
	}

	.shared-footer {
		padding: 1rem 2rem;
		text-align: center;
		color: rgba(255, 255, 255, 0.8);
		font-size: 0.875rem;
	}

	@media (max-width: 768px) {
		.shared-header {
			padding: 1rem;
		}

		.shared-content {
			padding: 1rem;
		}

		.note-header,
		.note-body {
			padding: 1.5rem 1rem;
		}

		.note-header h2 {
			font-size: 1.5rem;
		}
	}
</style>
