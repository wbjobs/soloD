<script lang="ts">
	import { onMount, derived } from 'svelte';
	import '$lib/styles/global.css';
	import { isOnline } from '$lib/stores/network';
	import { syncStatus } from '$lib/stores/sync';
	import {
		initPWA,
		subscribeToServiceWorkerState,
		activateWaitingServiceWorker,
		type ServiceWorkerState
	} from '$lib/pwa/serviceWorker';

	let swState: ServiceWorkerState | null = null;

	onMount(async () => {
		await initPWA();
		subscribeToServiceWorkerState((state) => {
			swState = state;
		});
	});

	$: swUpdateAvailable = swState?.waiting !== null;

	function handleActivateUpdate() {
		activateWaitingServiceWorker();
	}
</script>

<div class="app-container">
	<header class="app-header">
		<h1>PWA 笔记应用</h1>
		<div class="header-status">
			<div class="network-status {$isOnline ? 'online' : 'offline'}">
				{$isOnline ? '在线' : '离线'}
			</div>
			{#if swState?.active}
				<div class="sw-status">PWA 已启用</div>
			{/if}
		</div>
	</header>
	<main class="app-main">
		<slot />
	</main>

	{#if swUpdateAvailable}
		<div class="update-banner">
			<span>新版本可用！</span>
			<button class="btn btn-primary" on:click={handleActivateUpdate}>立即更新</button>
		</div>
	{/if}

	{#if $syncStatus !== 'idle'}
		<div class="sync-status {$syncStatus}">
			{#if $syncStatus === 'syncing'}
				正在同步...
			{:else if $syncStatus === 'synced'}
				同步完成 ✓
			{:else}
				同步失败，请重试
			{/if}
		</div>
	{/if}
</div>

<style>
	.header-status {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}

	.sw-status {
		padding: 0.3rem 0.8rem;
		border-radius: 20px;
		font-size: 0.85rem;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.2);
		color: white;
	}

	.update-banner {
		position: fixed;
		top: 20px;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.5rem;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		color: white;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 1001;
		animation: slideDown 0.3s ease;
	}

	@keyframes slideDown {
		from {
			transform: translateX(-50%) translateY(-100px);
			opacity: 0;
		}
		to {
			transform: translateX(-50%) translateY(0);
			opacity: 1;
		}
	}
</style>
