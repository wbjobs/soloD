package com.flink.statebackend.checkpoint;

import com.flink.statebackend.model.StateValue;
import java.io.Serializable;
import java.util.HashMap;
import java.util.Map;

public class CheckpointSnapshot implements Serializable {

    private static final long serialVersionUID = 1L;

    private long checkpointId;
    private long timestamp;
    private String rocksDBSnapshotPath;
    private Map<String, StateValue> hotDataSnapshot;
    private long totalKeys;
    private long hotKeys;
    private long coldKeys;
    private String operatorName;
    private int subtaskIndex;

    public CheckpointSnapshot() {
        this.hotDataSnapshot = new HashMap<>();
    }

    public CheckpointSnapshot(long checkpointId, String operatorName, int subtaskIndex) {
        this.checkpointId = checkpointId;
        this.timestamp = System.currentTimeMillis();
        this.operatorName = operatorName;
        this.subtaskIndex = subtaskIndex;
        this.hotDataSnapshot = new HashMap<>();
    }

    public long getCheckpointId() {
        return checkpointId;
    }

    public void setCheckpointId(long checkpointId) {
        this.checkpointId = checkpointId;
    }

    public long getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(long timestamp) {
        this.timestamp = timestamp;
    }

    public String getRocksDBSnapshotPath() {
        return rocksDBSnapshotPath;
    }

    public void setRocksDBSnapshotPath(String rocksDBSnapshotPath) {
        this.rocksDBSnapshotPath = rocksDBSnapshotPath;
    }

    public Map<String, StateValue> getHotDataSnapshot() {
        return hotDataSnapshot;
    }

    public void setHotDataSnapshot(Map<String, StateValue> hotDataSnapshot) {
        this.hotDataSnapshot = hotDataSnapshot;
    }

    public long getTotalKeys() {
        return totalKeys;
    }

    public void setTotalKeys(long totalKeys) {
        this.totalKeys = totalKeys;
    }

    public long getHotKeys() {
        return hotKeys;
    }

    public void setHotKeys(long hotKeys) {
        this.hotKeys = hotKeys;
    }

    public long getColdKeys() {
        return coldKeys;
    }

    public void setColdKeys(long coldKeys) {
        this.coldKeys = coldKeys;
    }

    public String getOperatorName() {
        return operatorName;
    }

    public void setOperatorName(String operatorName) {
        this.operatorName = operatorName;
    }

    public int getSubtaskIndex() {
        return subtaskIndex;
    }

    public void setSubtaskIndex(int subtaskIndex) {
        this.subtaskIndex = subtaskIndex;
    }

    @Override
    public String toString() {
        return String.format(
                "CheckpointSnapshot{id=%d, timestamp=%d, operator='%s', subtask=%d, " +
                        "totalKeys=%d, hotKeys=%d, coldKeys=%d, rocksDBPath='%s'}",
                checkpointId, timestamp, operatorName, subtaskIndex,
                totalKeys, hotKeys, coldKeys, rocksDBSnapshotPath
        );
    }
}
