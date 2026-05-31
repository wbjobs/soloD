export interface OCRTask {
  id: string;
  imageData: ImageData;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  statusText: string;
  result?: {
    text: string;
    confidence: number;
    words: any[];
  };
  error?: string;
}

type WorkerMessage =
  | { type: 'PROCESS'; imageData: ImageData; id: string }
  | { type: 'CANCEL'; id: string };

type WorkerResult =
  | { type: 'PROGRESS'; id: string; progress: number; status: string }
  | { type: 'RESULT'; id: string; text: string; confidence: number; words: any[] }
  | { type: 'ERROR'; id: string; error: string };

export class WorkerPool {
  private workers: Worker[] = [];
  private workerStatus: Map<Worker, 'idle' | 'busy'> = new Map();
  private taskQueue: OCRTask[] = [];
  private taskMap: Map<string, OCRTask> = new Map();
  private maxWorkers: number;
  private onUpdate: (tasks: OCRTask[]) => void;
  private workerUrl: string;

  constructor(workerUrl: string, maxWorkers: number, onUpdate: (tasks: OCRTask[]) => void) {
    this.workerUrl = workerUrl;
    this.maxWorkers = Math.min(maxWorkers, navigator.hardwareConcurrency || 4);
    this.onUpdate = onUpdate;
  }

  private createWorker(): Worker {
    const worker = new Worker(this.workerUrl, { type: 'module' });

    worker.onmessage = (e: MessageEvent<WorkerResult>) => {
      const task = this.taskMap.get(e.data.id);
      if (!task) return;

      if (e.data.type === 'PROGRESS') {
        task.progress = e.data.progress;
        task.statusText = e.data.status;
      } else if (e.data.type === 'RESULT') {
        task.status = 'completed';
        task.progress = 1;
        task.statusText = '完成';
        task.result = {
          text: e.data.text,
          confidence: e.data.confidence,
          words: e.data.words,
        };
        this.workerStatus.set(worker, 'idle');
        this.processNextTask();
      } else if (e.data.type === 'ERROR') {
        task.status = 'error';
        task.statusText = '失败';
        task.error = e.data.error;
        this.workerStatus.set(worker, 'idle');
        this.processNextTask();
      }

      this.notifyUpdate();
    };

    worker.onerror = (error) => {
      console.error('Worker error:', error);
      this.workerStatus.set(worker, 'idle');
      this.processNextTask();
    };

    return worker;
  }

  private processNextTask() {
    const idleWorker = Array.from(this.workerStatus.entries()).find(
      ([, status]) => status === 'idle'
    );

    if (!idleWorker) return;

    const pendingTask = this.taskQueue.find((t) => t.status === 'pending');
    if (!pendingTask) return;

    const [worker] = idleWorker;
    this.workerStatus.set(worker, 'busy');
    pendingTask.status = 'processing';
    pendingTask.statusText = '处理中';

    worker.postMessage({
      type: 'PROCESS',
      imageData: pendingTask.imageData,
      id: pendingTask.id,
    } as WorkerMessage);

    this.notifyUpdate();
  }

  private notifyUpdate() {
    this.onUpdate(Array.from(this.taskMap.values()));
  }

  addTask(task: OCRTask) {
    this.taskMap.set(task.id, task);
    this.taskQueue.push(task);

    if (this.workers.length < this.maxWorkers) {
      const worker = this.createWorker();
      this.workers.push(worker);
      this.workerStatus.set(worker, 'idle');
    }

    this.processNextTask();
    this.notifyUpdate();
  }

  addTasks(tasks: OCRTask[]) {
    tasks.forEach((task) => {
      this.taskMap.set(task.id, task);
      this.taskQueue.push(task);
    });

    while (this.workers.length < this.maxWorkers) {
      const worker = this.createWorker();
      this.workers.push(worker);
      this.workerStatus.set(worker, 'idle');
    }

    for (let i = 0; i < this.maxWorkers; i++) {
      this.processNextTask();
    }

    this.notifyUpdate();
  }

  cancelAll() {
    this.workers.forEach((worker) => {
      worker.postMessage({ type: 'CANCEL' } as WorkerMessage);
    });

    this.taskQueue.forEach((task) => {
      if (task.status === 'pending' || task.status === 'processing') {
        task.status = 'error';
        task.statusText = '已取消';
      }
    });

    this.notifyUpdate();
  }

  terminate() {
    this.workers.forEach((worker) => worker.terminate());
    this.workers = [];
    this.workerStatus.clear();
  }

  getTasks(): OCRTask[] {
    return Array.from(this.taskMap.values());
  }

  clearCompleted() {
    const completedIds = Array.from(this.taskMap.entries())
      .filter(([, task]) => task.status === 'completed' || task.status === 'error')
      .map(([id]) => id);

    completedIds.forEach((id) => {
      const task = this.taskMap.get(id);
      if (task) {
        this.taskMap.delete(id);
        const index = this.taskQueue.indexOf(task);
        if (index > -1) {
          this.taskQueue.splice(index, 1);
        }
      }
    });

    this.notifyUpdate();
  }
}
