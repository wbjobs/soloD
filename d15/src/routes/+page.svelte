<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getAllNotes, createNote } from '$lib/db/indexedDB';
	import { isOnline } from '$lib/stores/network';
	import { syncStatus } from '$lib/stores/sync';
	import { initializeSyncService } from '$lib/sync/syncService';
	import type { Note } from '$lib/types/note';

	let notes: Note[] = [];
	let loading = true;

	onMount(async () => {
		initializeSyncService();
		await loadNotes();
	});

	async function loadNotes() {
		loading = true;
		const allNotes = await getAllNotes();
		notes = allNotes.filter((n) => !n.isDeleted);
		loading = false;
	}

	async function handleCreateNote() {
		const newNote = await createNote({
			title: '新笔记',
			content: ''
		});
		goto(`/note/${newNote.id}`);
	}

	function formatDate(date: Date): string {
		return new Date(date).toLocaleDateString('zh-CN', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function truncateContent(content: string): string {
		if (!content) return '无内容';
		if (content.length <= 100) return content;
		return content.slice(0, 100) + '...';
	}
</script>

<div class="notes-page">
	<div class="page-header">
		<h2>我的笔记</h2>
		<button class="btn btn-primary" on:click={handleCreateNote}>+ 新建笔记</button>
	</div>

	{#if loading}
		<div class="loading">加载中...</div>
	{:else if notes.length === 0}
		<div class="empty-state card">
			<h2>还没有笔记</h2>
			<p>点击上方按钮创建您的第一条笔记</p>
			<p style="margin-top: 1rem; font-size: 0.9rem; color: #666;">
				提示：您可以在离线状态下创建和编辑笔记，网络恢复后将自动同步
			</p>
		</div>
	{:else}
		<div class="notes-grid">
			{#each notes as note}
				<div
					class="card note-card"
					on:click={() => goto(`/note/${note.id}`)}
					title="点击编辑笔记"
				>
					<h3>{note.title || '无标题'}</h3>
					<p>{truncateContent(note.content)}</p>
					<div class="note-date">
						{formatDate(note.updatedAt)}
						{#if !note.synced}
							<span style="color: #f44336; margin-left: 0.5rem;">• 未同步</span>
						{/if}
						{#if note.isPublic}
							<span class="share-badge" title="已公开分享">🔗</span>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.notes-page {
		width: 100%;
	}

	.page-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 2rem;
	}

	.page-header h2 {
		font-size: 1.8rem;
		color: #333;
	}

	.loading {
		text-align: center;
		padding: 4rem;
		color: #666;
		font-size: 1.1rem;
	}

	.share-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		margin-left: 0.5rem;
		font-size: 0.9rem;
	}
</style>
