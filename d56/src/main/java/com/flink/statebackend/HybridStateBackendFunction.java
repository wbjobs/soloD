package com.flink.statebackend;

import com.flink.statebackend.checkpoint.CheckpointSnapshot;
import com.flink.statebackend.checkpoint.HDFSCheckpointManager;
import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.StateValue;
import org.apache.flink.api.common.state.ListState;
import org.apache.flink.api.common.state.ListStateDescriptor;
import org.apache.flink.api.common.typeinfo.TypeHint;
import org.apache.flink.api.common.typeinfo.TypeInformation;
import org.apache.flink.runtime.state.FunctionInitializationContext;
import org.apache.flink.runtime.state.FunctionSnapshotContext;
import org.apache.flink.streaming.api.checkpoint.CheckpointedFunction;
import org.rocksdb.RocksDB;
import org.rocksdb.RocksDBException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

public abstract class HybridStateBackendFunction<T, R>
        implements CheckpointedFunction, AutoCloseable {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(HybridStateBackendFunction.class);

    protected HybridStateBackend stateBackend;
    protected HybridStateBackendConfig config;
    protected transient HDFSCheckpointManager checkpointManager;

    private transient ListState<CheckpointSnapshot> checkpointState;
    protected String operatorName;
    protected int subtaskIndex;

    private transient volatile boolean restoreCompleted = false;
    private transient volatile long lastCheckpointId = -1;

    static {
        RocksDB.loadLibrary();
    }

    public HybridStateBackendFunction(HybridStateBackendConfig config) {
        this.config = config;
    }

    @Override
    public void initializeState(FunctionInitializationContext context) throws Exception {
        this.operatorName = context.getOperatorStateStore().toString();
        this.subtaskIndex = context.getIndexOfThisSubtask();

        LOG.info("Initializing state for operator: {}, subtask: {}", operatorName, subtaskIndex);

        ListStateDescriptor<CheckpointSnapshot> descriptor =
                new ListStateDescriptor<>(
                        "hybrid-state-backend-checkpoint",
                        TypeInformation.of(new TypeHint<CheckpointSnapshot>() {})
                );

        checkpointState = context.getOperatorStateStore().getListState(descriptor);

        stateBackend = new HybridStateBackend(config);
        stateBackend.initialize();

        checkpointManager = new HDFSCheckpointManager(config);

        if (context.isRestored()) {
            restoreState();
        }

        restoreCompleted = true;
        LOG.info("State initialization completed for operator: {}, subtask: {}",
                operatorName, subtaskIndex);
    }

    private void restoreState() throws Exception {
        LOG.info("Restoring state from checkpoint...");

        CheckpointSnapshot latestSnapshot = null;
        for (CheckpointSnapshot snapshot : checkpointState.get()) {
            if (latestSnapshot == null ||
                    snapshot.getCheckpointId() > latestSnapshot.getCheckpointId()) {
                latestSnapshot = snapshot;
            }
        }

        if (latestSnapshot != null) {
            LOG.info("Found latest checkpoint snapshot: {}", latestSnapshot);
            restoreFromCheckpoint(latestSnapshot);
        } else {
            LOG.warn("No checkpoint snapshot found, starting with empty state");
        }
    }

    private void restoreFromCheckpoint(CheckpointSnapshot snapshot) throws IOException, RocksDBException {
        String rocksDBRestorePath = stateBackend.getRocksDBManager().getDbPath();

        checkpointManager.restoreRocksDBCheckpoint(
                snapshot.getRocksDBSnapshotPath(),
                rocksDBRestorePath
        );

        String hotDataPath = snapshot.getRocksDBSnapshotPath().replace("/rocksdb", "/hotdata.snapshot");
        Map<String, StateValue> hotData = checkpointManager.loadHotDataFromHDFS(hotDataPath);

        stateBackend.getRocksDBManager().close();

        stateBackend.getRocksDBManager().initialize();

        if (hotData != null && !hotData.isEmpty()) {
            stateBackend.getRedisManager().putBatchSync(hotData);
            LOG.info("Restored {} hot keys to Redis cache", hotData.size());
        }

        this.lastCheckpointId = snapshot.getCheckpointId();
        LOG.info("State restored successfully from checkpoint: {}", snapshot.getCheckpointId());
    }

    @Override
    public void snapshotState(FunctionSnapshotContext context) throws Exception {
        if (!restoreCompleted) {
            LOG.warn("Cannot snapshot state: restore not completed yet");
            return;
        }

        long checkpointId = context.getCheckpointId();
        LOG.info("Starting checkpoint: {}, operator: {}, subtask: {}",
                checkpointId, operatorName, subtaskIndex);

        stateBackend.flush();

        Map<String, StateValue> hotData = stateBackend.getAllHotData();

        RocksDB rocksDB = stateBackend.getRocksDBManager().getRocksDB();

        CheckpointSnapshot snapshot = checkpointManager.createCheckpoint(
                checkpointId,
                operatorName != null ? operatorName : "hybrid-operator",
                subtaskIndex,
                rocksDB,
                hotData
        );

        snapshot.setTotalKeys(stateBackend.getStatistics().getHotDataCount() +
                stateBackend.getStatistics().getColdDataCount());
        snapshot.setHotKeys(hotData.size());
        snapshot.setColdKeys(stateBackend.getStatistics().getColdDataCount());

        checkpointState.clear();
        checkpointState.add(snapshot);

        checkpointManager.saveCheckpointMetadata(snapshot);

        this.lastCheckpointId = checkpointId;

        checkpointManager.cleanupOldCheckpoints(3);

        LOG.info("Checkpoint completed successfully: {}", snapshot);
    }

    protected StateValue getState(String key) throws RocksDBException {
        return stateBackend.get(key);
    }

    protected void putState(String key, byte[] value) throws RocksDBException {
        stateBackend.put(key, value);
    }

    protected void putState(String key, StateValue value) throws RocksDBException {
        stateBackend.put(key, value);
    }

    public boolean isDegraded() {
        return stateBackend != null && stateBackend.isDegraded();
    }

    public int getWriteBufferSize() {
        return stateBackend != null ? stateBackend.getWriteBufferSize() : 0;
    }

    public int getFailureQueueSize() {
        return stateBackend != null ? stateBackend.getFailureQueueSize() : 0;
    }

    protected void deleteState(String key) throws RocksDBException {
        stateBackend.delete(key);
    }

    protected boolean containsState(String key) throws RocksDBException {
        return stateBackend.containsKey(key);
    }

    protected Map<String, StateValue> scanStates(String prefix, int limit) throws RocksDBException {
        return stateBackend.scan(prefix, limit);
    }

    public long getLastCheckpointId() {
        return lastCheckpointId;
    }

    public HybridStateBackend getStateBackend() {
        return stateBackend;
    }

    public HDFSCheckpointManager getCheckpointManager() {
        return checkpointManager;
    }

    @Override
    public void close() {
        LOG.info("Closing HybridStateBackendFunction...");

        if (stateBackend != null) {
            stateBackend.close();
        }

        if (checkpointManager != null) {
            checkpointManager.close();
        }

        LOG.info("HybridStateBackendFunction closed successfully");
    }
}
