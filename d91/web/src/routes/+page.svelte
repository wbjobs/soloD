<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Shield, Activity, Database, Terminal, Globe, AlertCircle, AlertTriangle, AlertOctagon, CheckCircle } from 'lucide-svelte';

	type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

	interface RiskInfo {
		level: RiskLevel;
		score: number;
		reason: string;
	}

	interface SyscallEvent {
		timestamp: number;
		pid: number;
		comm: string;
		syscall: 'openat' | 'execve' | 'connect';
		args: Record<string, any>;
		risk: RiskInfo;
		id: number;
	}

	let events: SyscallEvent[] = [];
	let eventId = 0;
	let connected = false;
	let ws: WebSocket | null = null;
	let reconnectAttempts = 0;
	let activeFilter: string | null = null;
	let activeRiskFilter: RiskLevel | null = null;

	$: filteredEvents = events.filter(e => {
		if (activeFilter && e.syscall !== activeFilter) return false;
		if (activeRiskFilter && e.risk?.level !== activeRiskFilter) return false;
		return true;
	});

	$: stats = {
		total: events.length,
		openat: events.filter(e => e.syscall === 'openat').length,
		execve: events.filter(e => e.syscall === 'execve').length,
		connect: events.filter(e => e.syscall === 'connect').length,
		critical: events.filter(e => e.risk?.level === 'critical').length,
		high: events.filter(e => e.risk?.level === 'high').length,
		medium: events.filter(e => e.risk?.level === 'medium').length,
		low: events.filter(e => e.risk?.level === 'low').length
	};

	function getRiskColor(level: RiskLevel): string {
		switch (level) {
			case 'critical': return '#ff3b30';
			case 'high': return '#ff9500';
			case 'medium': return '#ffcc00';
			case 'low': return '#34c759';
			default: return '#34c759';
		}
	}

	function getRiskLabel(level: RiskLevel): string {
		switch (level) {
			case 'critical': return '严重';
			case 'high': return '高危';
			case 'medium': return '中危';
			case 'low': return '低危';
			default: return '低危';
		}
	}

	function formatTimestamp(ns: number): string {
		const ms = Math.floor(ns / 1000000);
		const date = new Date(ms);
		return date.toLocaleTimeString('en-US', {
			hour12: false,
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			fractionalSecondDigits: 3
		});
	}

	// Safely decode binary data to UTF-8 string
	function decodeBinaryToString(data: any): string {
		if (typeof data === 'string') {
			return data;
		}
		if (Array.isArray(data)) {
			// Handle byte array
			try {
				const uint8 = new Uint8Array(data);
				const decoder = new TextDecoder('utf-8', { fatal: false });
				return decoder.decode(uint8).replace(/\0/g, '');
			} catch {
				return String(data);
			}
		}
		return String(data || '');
	}

	function formatArgs(args: Record<string, any>, syscall: string): string {
		switch (syscall) {
			case 'openat':
				const openFilename = decodeBinaryToString(args.filename);
				return `dfd: ${args.dfd}, filename: "${openFilename}", flags: ${args.flags}, mode: ${args.mode}`;
			case 'execve':
				const execFilename = decodeBinaryToString(args.filename);
				return `filename: "${execFilename}"`;
			case 'connect':
				let connectStr = `fd: ${args.fd}, addrlen: ${args.addrlen}`;
				if (args.addr_hex) {
					connectStr += `, addr: ${args.addr_hex}`;
				}
				return connectStr;
			default:
				return JSON.stringify(args);
		}
	}

	function connect() {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const host = window.location.hostname;
		const wsUrl = `${protocol}//${host}:3030/ws`;

		console.log('Attempting to connect to WebSocket:', wsUrl);
		ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			connected = true;
			reconnectAttempts = 0;
			console.log('WebSocket connected successfully');
		};

		ws.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				const newEvent: SyscallEvent = {
					...data,
					id: eventId++
				};
				events = [newEvent, ...events].slice(0, 1000);
			} catch (e) {
				console.error('Failed to parse event:', e);
				console.error('Raw event data:', event.data);
			}
		};

		ws.onclose = (event) => {
			connected = false;
			console.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
			
			if (reconnectAttempts < 10) {
				reconnectAttempts++;
				const delay = Math.min(1000 * reconnectAttempts, 10000);
				console.log(`Reconnecting in ${delay/1000}s... (attempt ${reconnectAttempts}/10)`);
				setTimeout(connect, delay);
			} else {
				console.error('Max reconnect attempts reached. Please check if backend is running.');
			}
		};

		ws.onerror = (error) => {
			console.error('WebSocket error occurred. Is the backend running at ws://localhost:3030?');
			console.error('Error:', error);
		};
	}

	function clearEvents() {
		events = [];
		eventId = 0;
	}

	function setFilter(filter: string | null) {
		activeFilter = activeFilter === filter ? null : filter;
	}

	onMount(() => {
		connect();
	});

	onDestroy(() => {
		if (ws) {
			ws.close();
		}
	});
</script>

<svelte:head>
	<title>Security Monitor - eBPF Syscall Tracer</title>
</svelte:head>

<div class="container">
	<header class="header">
		<h1>
			<Shield size={32} />
			Security Monitor
		</h1>
		<p>Real-time system call monitoring powered by eBPF</p>
	</header>

	<div class="status-bar">
		<div class="status-item">
			<span class="status-dot {connected ? 'connected' : 'disconnected'}"></span>
			<span>{connected ? 'Connected' : 'Disconnected'}</span>
		</div>
		<div class="status-item">
			<Activity size={14} />
			<span>Monitoring syscalls: openat, execve, connect</span>
		</div>
	</div>

	<div class="stats-grid">
		<div class="stat-card">
			<div class="label">Total Events</div>
			<div class="value">{stats.total}</div>
		</div>
		<div class="stat-card risk-critical" style="--risk-color: #ff3b30">
			<div class="label">严重风险</div>
			<div class="value">{stats.critical}</div>
		</div>
		<div class="stat-card risk-high" style="--risk-color: #ff9500">
			<div class="label">高风险</div>
			<div class="value">{stats.high}</div>
		</div>
		<div class="stat-card risk-medium" style="--risk-color: #ffcc00">
			<div class="label">中风险</div>
			<div class="value">{stats.medium}</div>
		</div>
	</div>

	<div class="filters">
		<div class="filter-group">
			<span class="filter-label">系统调用:</span>
			<button 
				class="filter-btn {activeFilter === null ? 'active' : ''}"
				on:click={() => activeFilter = null}
			>
				All
			</button>
			<button 
				class="filter-btn {activeFilter === 'openat' ? 'active' : ''}"
				on:click={() => activeFilter = 'openat'}
			>
				<Database size={14} />
				openat
			</button>
			<button 
				class="filter-btn {activeFilter === 'execve' ? 'active' : ''}"
				on:click={() => activeFilter = 'execve'}
			>
				<Terminal size={14} />
				execve
			</button>
			<button 
				class="filter-btn {activeFilter === 'connect' ? 'active' : ''}"
				on:click={() => activeFilter = 'connect'}
			>
				<Globe size={14} />
				connect
			</button>
		</div>
		<div class="filter-group">
			<span class="filter-label">风险级别:</span>
			<button 
				class="filter-btn risk-filter {activeRiskFilter === null ? 'active' : ''}"
				on:click={() => activeRiskFilter = null}
			>
				全部
			</button>
			<button 
				class="filter-btn risk-filter critical {activeRiskFilter === 'critical' ? 'active' : ''}"
				on:click={() => activeRiskFilter = 'critical'}
			>
				<AlertOctagon size={14} />
				严重
			</button>
			<button 
				class="filter-btn risk-filter high {activeRiskFilter === 'high' ? 'active' : ''}"
				on:click={() => activeRiskFilter = 'high'}
			>
				<AlertTriangle size={14} />
				高危
			</button>
			<button 
				class="filter-btn risk-filter medium {activeRiskFilter === 'medium' ? 'active' : ''}"
				on:click={() => activeRiskFilter = 'medium'}
			>
				中危
			</button>
		</div>
		<button class="filter-btn clear-btn" on:click={clearEvents}>
			Clear
		</button>
	</div>

	<div class="events-table">
		<div class="table-header">
			<div style="width: 80px;">Time</div>
			<div style="width: 60px;">PID</div>
			<div style="width: 100px;">Process</div>
			<div style="width: 80px;">Syscall</div>
			<div style="width: 100px;">风险</div>
			<div>Arguments</div>
		</div>
		<div class="table-body">
			{#if filteredEvents.length === 0}
				<div class="no-events">
					<AlertCircle size={48} />
					<p>No events received yet...</p>
					<p>Start the backend server to begin monitoring</p>
				</div>
			{/if}
			{#each filteredEvents as event (event.id)}
				<div class="table-row risk-{event.risk?.level || 'low'}" title={event.risk?.reason}>
					<div class="timestamp">{formatTimestamp(event.timestamp)}</div>
					<div class="pid">{event.pid}</div>
					<div class="comm">{event.comm}</div>
					<div>
						<span class="syscall-badge {event.syscall}">{event.syscall}</span>
					</div>
					<div>
						{#if event.risk}
							<span 
								class="risk-badge" 
								style="--risk-color: {getRiskColor(event.risk.level)}"
								title={event.risk.reason}
							>
								{#if event.risk.level === 'critical'}
									<AlertOctagon size={12} />
								{:else if event.risk.level === 'high'}
									<AlertTriangle size={12} />
								{:else if event.risk.level === 'medium'}
									<AlertCircle size={12} />
								{:else}
									<CheckCircle size={12} />
								{/if}
								{getRiskLabel(event.risk.level)}
								<span class="risk-score">{event.risk.score}</span>
							</span>
						{/if}
					</div>
					<div class="args">{formatArgs(event.args, event.syscall)}</div>
				</div>
			{/each}
		</div>
	</div>
</div>
