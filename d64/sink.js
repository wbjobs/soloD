const zmq = require('zeromq');

class WorkerTracker {
    constructor(timeout = 15) {
        this.workers = new Map();
        this.timeout = timeout * 1000;
    }

    updateHeartbeat(workerId, timestamp) {
        const now = Date.now();
        if (!this.workers.has(workerId)) {
            console.log(`\n[新 Worker 上线] ${workerId}`);
        }
        this.workers.set(workerId, {
            lastSeen: now,
            firstSeen: this.workers.get(workerId)?.firstSeen || now,
            tasksCompleted: this.workers.get(workerId)?.tasksCompleted || 0
        });
    }

    incrementTask(workerId) {
        const worker = this.workers.get(workerId);
        if (worker) {
            worker.tasksCompleted++;
        }
    }

    checkTimeouts() {
        const now = Date.now();
        const timedOut = [];
        
        for (const [workerId, data] of this.workers.entries()) {
            if (now - data.lastSeen > this.timeout) {
                timedOut.push(workerId);
            }
        }
        
        for (const workerId of timedOut) {
            console.log(`\n[Worker 超时下线] ${workerId}`);
            this.workers.delete(workerId);
        }
    }

    printStatus() {
        const now = Date.now();
        console.log('\n' + '='.repeat(60));
        console.log('活跃 Worker 状态:');
        console.log('='.repeat(60));
        
        if (this.workers.size === 0) {
            console.log('  暂无活跃的 Worker');
        } else {
            for (const [workerId, data] of this.workers.entries()) {
                const age = ((now - data.firstSeen) / 1000).toFixed(1);
                const lastSeen = ((now - data.lastSeen) / 1000).toFixed(1);
                console.log(`  - Worker [${workerId}]: 运行 ${age}s, 完成 ${data.tasksCompleted} 任务, 最后心跳 ${lastSeen}s 前`);
            }
        }
        console.log('='.repeat(60) + '\n');
    }

    getActiveCount() {
        return this.workers.size;
    }
}

async function runSink() {
    const sink = new zmq.Pull();
    const workerTracker = new WorkerTracker(15);
    
    await sink.bind('tcp://*:5558');
    console.log('='.repeat(60));
    console.log('Sink 已启动，监听 tcp://*:5558');
    console.log('等待 Worker 发送结果...');
    console.log('='.repeat(60));
    console.log();
    
    let results = [];
    let startTime = Date.now();
    const expectedTasks = 7;
    let statusPrintInterval = null;
    
    statusPrintInterval = setInterval(() => {
        workerTracker.checkTimeouts();
        workerTracker.printStatus();
    }, 10000);
    
    for await (const [msg] of sink) {
        const message = msg.toString();
        
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'heartbeat') {
                workerTracker.updateHeartbeat(data.worker_id, data.timestamp);
            } else if (data.type === 'result') {
                workerTracker.updateHeartbeat(data.worker_id, Date.now());
                workerTracker.incrementTask(data.worker_id);
                
                results.push({
                    taskId: data.task_id,
                    number: data.number,
                    result: data.result,
                    elapsed: data.elapsed,
                    workerId: data.worker_id
                });
                
                console.log(`[${results.length}/${expectedTasks}] 任务 #${data.task_id}: ` +
                    `Fibonacci(${data.number}) = ${data.result} ` +
                    `(${data.elapsed.toFixed(4)}s) ` +
                    `[Worker: ${data.worker_id}]`);
                
                if (results.length >= expectedTasks) {
                    const totalTime = (Date.now() - startTime) / 1000;
                    const totalElapsed = results.reduce((sum, r) => sum + r.elapsed, 0);
                    
                    clearInterval(statusPrintInterval);
                    
                    console.log();
                    console.log('='.repeat(60));
                    console.log('所有任务完成! 统计信息:');
                    console.log('='.repeat(60));
                    console.log(`总任务数: ${results.length}`);
                    console.log(`总计算时间: ${totalElapsed.toFixed(4)}秒`);
                    console.log(`实际耗时: ${totalTime.toFixed(4)}秒`);
                    console.log(`平均任务时间: ${(totalElapsed / results.length).toFixed(4)}秒`);
                    console.log(`加速比: ${(totalElapsed / totalTime).toFixed(2)}x`);
                    console.log(`活跃 Worker 数: ${workerTracker.getActiveCount()}`);
                    console.log('='.repeat(60));
                    
                    workerTracker.printStatus();
                    
                    await sink.close();
                    process.exit(0);
                }
            }
        } catch (e) {
            console.log(`收到无效消息: ${message}`);
        }
    }
}

process.on('SIGINT', async () => {
    console.log('\n正在退出...');
    process.exit(0);
});

runSink().catch(err => {
    console.error('错误:', err.message);
    process.exit(1);
});
