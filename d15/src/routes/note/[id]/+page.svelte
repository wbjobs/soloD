<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { getNoteById, updateNote, deleteNote } from '$lib/db/indexedDB';
	import { saveNoteAndSync } from '$lib/sync/syncService';
	import { shareNote, unshareNote, copyShareUrlToClipboard, getShareUrl } from '$lib/services/shareService';
	import type { Note } from '$lib/types/note';

	let note: Note | null = null;
	let title = '';
	let content = '';
	let loading = true;
	let hasChanges = false;
	let shareDialogOpen = false;
	let copySuccess = false;
	let shareLoading = false;

	$: noteId = $page.params.id;
	$: shareUrl = note?.shareId ? getShareUrl(note.shareId) : '';

	onMount(async () => {
		await loadNote();
	});

	async function loadNote() {
		loading = true;
		const foundNote = await getNoteById(noteId);
		if (foundNote) {
			note = foundNote;
			title = foundNote.title;
			content = foundNote.content;
		}
		loading = false;
	}

	function onInputChange() {
		hasChanges = true;
	}

	async function handleSave() {
		if (!note) return;

		const updatedNote = await updateNote(noteId, { title, content });
		if (updatedNote) {
			note = updatedNote;
			hasChanges = false;
			await saveNoteAndSync(updatedNote);
		}
	}

	async function handleDelete() {
		if (!note) return;
		if (!confirm('确定要删除这条笔记吗？')) return;

		await deleteNote(noteId);
		const deletedNote = await getNoteById(noteId);
		if (deletedNote) {
			await saveNoteAndSync(deletedNote);
		}
		goto('/');
	}

	function handleBack() {
		if (hasChanges) {
			if (confirm('有未保存的更改，确定要离开吗？')) {
				goto('/');
			}
		} else {
			goto('/');
		}
	}

	function toggleShareDialog() {
		shareDialogOpen = !shareDialogOpen;
		copySuccess = false;
	}

	async function handleShare() {
		if (!note || shareLoading) return;

		shareLoading = true;
		const result = await shareNote(noteId);
		if (result) {
			note = result.note;
		}
		shareLoading = false;
	}

	async function handleUnshare() {
		if (!note || shareLoading) return;

		if (!confirm('确定要取消分享吗？此操作将使公开链接失效。')) {
			return;
		}

		shareLoading = true;
		const result = await unshareNote(noteId);
		if (result) {
			note = result;
		}
		shareLoading = false;
	}

	async function handleCopyLink() {
		if (!shareUrl) return;

		const success = await copyShareUrlToClipboard(shareUrl);
		if (success) {
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		}
	}

	function openSharePreview() {
		if (shareUrl) {
			window.open(shareUrl, '_blank');
		}
	}
</script>

<div class="note-edit-page">
	{#if loading}
		<div class="loading">加载中...</div>
	{:else if !note}
		<div class="card empty-state">
			<h2>笔记不存在</h2>
			<button class="btn btn-primary" on:click={() => goto('/')}>返回列表</button>
		</div>
	{:else}
		<div class="note-form card">
			<div class="form-header">
				<button class="btn btn-secondary" on:click={handleBack}>← 返回</button>
				<div class="header-actions">
					<button class="btn btn-share {note?.isPublic ? 'shared' : ''}" on:click={toggleShareDialog} title="分享笔记">
						{#if note?.isPublic}
							🔗 已分享
						{:else}
							📤 分享
						{/if}
					</button>
					<button class="btn btn-danger" on:click={handleDelete}>删除</button>
					<button class="btn btn-primary" on:click={handleSave} disabled={!hasChanges}>
						{hasChanges ? '保存 *' : '已保存 ✓'}
					</button>
				</div>
			</div>

			<input
				type="text"
				bind:value={title}
				on:input={onInputChange}
				placeholder="笔记标题"
				autocomplete="off"
			/>

			<textarea
				bind:value={content}
				on:input={onInputChange}
				placeholder="在这里写下您的笔记内容..."
				rows={15}
			/>

			<div class="note-meta">
				<p>创建于: {new Date(note.createdAt).toLocaleString('zh-CN')}</p>
				<p>最后更新: {new Date(note.updatedAt).toLocaleString('zh-CN')}</p>
				<p>
					同步状态:
					{#if note.synced}
						<span style="color: #4caf50;">已同步 ✓</span>
					{:else}
						<span style="color: #f44336;">未同步 •</span>
					{/if}
				</p>
				{#if note.isPublic}
					<p>
						分享状态:
						<span style="color: #667eea;">已公开分享 🔗</span>
					</p>
				{/if}
			</div>
		</div>

		{#if shareDialogOpen}
			<div class="share-dialog-overlay" on:click|self={toggleShareDialog}>
				<div class="share-dialog card">
					<div class="dialog-header">
						<h3>📤 分享笔记</h3>
						<button class="close-btn" on:click={toggleShareDialog}>&times;</button>
					</div>

					<div class="dialog-content">
						{#if note?.isPublic && note.shareId}
							<div class="share-success">
								<div class="success-icon">✅</div>
								<p>笔记已公开分享</p>
								<p class="share-date">
									分享于: {note.sharedAt ? new Date(note.sharedAt).toLocaleString('zh-CN') : '未知'}
								</p>
							</div>

							<div class="share-link-section">
								<label>公开链接</label>
								<div class="link-input-wrapper">
									<input type="text" value={shareUrl} readonly />
									<button
										class="btn {copySuccess ? 'copy-success' : 'btn-primary'}"
										on:click={handleCopyLink}
										disabled={shareLoading}
									>
										{copySuccess ? '已复制 ✓' : '复制链接'}
									</button>
								</div>
								<p class="link-hint">
									任何人都可以通过此链接查看笔记内容，但无法编辑
								</p>
							</div>

							<div class="dialog-actions">
								<button class="btn btn-secondary" on:click={openSharePreview} disabled={shareLoading}>
									预览链接
								</button>
								<button class="btn btn-danger" on:click={handleUnshare} disabled={shareLoading}>
									{shareLoading ? '取消中...' : '取消分享'}
								</button>
							</div>
						{:else}
							<div class="share-prompt">
								<div class="prompt-icon">🔗</div>
								<h4>生成公开链接</h4>
								<p>生成一个公开只读链接，任何人都可以通过该链接查看此笔记的内容</p>
							</div>

							<div class="dialog-actions centered">
								<button class="btn btn-primary" on:click={handleShare} disabled={shareLoading}>
									{shareLoading ? '生成中...' : '生成公开链接'}
								</button>
							</div>
						{/if}
					</div>
				</div>
			</div>
		{/if}
	{/if}
</div>

<style>
	.note-edit-page {
		max-width: 900px;
		margin: 0 auto;
	}

	.form-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e0e0e0;
	}

	.header-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-share {
		background: #f3f4f6;
		color: #374151;
		border: 1px solid #d1d5db;
	}

	.btn-share:hover {
		background: #e5e7eb;
	}

	.btn-share.shared {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border: none;
	}

	.loading {
		text-align: center;
		padding: 4rem;
		color: #666;
		font-size: 1.1rem;
	}

	.note-meta {
		margin-top: 1.5rem;
		padding-top: 1rem;
		border-top: 1px solid #e0e0e0;
		font-size: 0.85rem;
		color: #666;
	}

	.note-meta p {
		margin: 0.3rem 0;
	}

	.share-dialog-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 0.2s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.share-dialog {
		width: 90%;
		max-width: 500px;
		animation: slideUp 0.3s ease;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.dialog-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.5rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.dialog-header h3 {
		margin: 0;
		color: #111827;
		font-size: 1.25rem;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: #6b7280;
		cursor: pointer;
		padding: 0;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
	}

	.close-btn:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.share-success {
		text-align: center;
		padding: 1rem;
		background: #f0fdf4;
		border-radius: 8px;
		margin-bottom: 1.5rem;
	}

	.success-icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}

	.share-success p {
		margin: 0;
		color: #166534;
		font-weight: 500;
	}

	.share-date {
		font-size: 0.875rem;
		color: #15803d;
		font-weight: 400;
	}

	.share-link-section {
		margin-bottom: 1.5rem;
	}

	.share-link-section label {
		display: block;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.5rem;
	}

	.link-input-wrapper {
		display: flex;
		gap: 0.5rem;
	}

	.link-input-wrapper input {
		flex: 1;
		font-size: 0.875rem;
		background: #f9fafb;
	}

	.copy-success {
		background: #16a34a;
		color: white;
	}

	.link-hint {
		font-size: 0.8125rem;
		color: #6b7280;
		margin: 0.5rem 0 0;
	}

	.share-prompt {
		text-align: center;
		padding: 2rem 1rem;
	}

	.prompt-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.share-prompt h4 {
		margin: 0 0 0.5rem;
		color: #111827;
		font-size: 1.125rem;
	}

	.share-prompt p {
		margin: 0;
		color: #6b7280;
		line-height: 1.5;
	}

	.dialog-actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.dialog-actions.centered {
		justify-content: center;
	}
</style>
