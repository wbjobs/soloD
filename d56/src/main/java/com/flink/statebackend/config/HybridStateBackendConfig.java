package com.flink.statebackend.config;

import java.io.Serializable;
import java.time.Duration;

public class HybridStateBackendConfig implements Serializable {

    private static final long serialVersionUID = 1L;

    private String rocksDbPath = "/tmp/flink/rocksdb";
    private String redisHost = "localhost";
    private int redisPort = 6379;
    private String redisPassword = null;
    private int redisDatabase = 0;

    private Duration hotDataTTL = Duration.ofMinutes(5);
    private double hotDataRatioThreshold = 0.3;
    private int redisBatchSize = 100;
    private Duration redisBatchInterval = Duration.ofMillis(100);

    private String hdfsCheckpointPath = "hdfs://localhost:9000/flink/checkpoints";
    private String hdfsSnapshotPath = "hdfs://localhost:9000/flink/snapshots";

    private int maxRedisConnections = 8;
    private Duration connectionTimeout = Duration.ofSeconds(5);
    private Duration socketTimeout = Duration.ofSeconds(5);

    private boolean enableAutoTuning = true;
    private Duration tuningInterval = Duration.ofMinutes(1);
    private double targetCacheHitRate = 0.85;

    private int writeBufferCapacity = 10000;
    private int backPressureHighWaterMark = 8000;
    private int backPressureLowWaterMark = 3000;
    private int backPressureTimeoutMs = 5000;

    private int redisMaxFailureCount = 3;
    private Duration redisFailureRetryInterval = Duration.ofSeconds(30);
    private boolean enableDegradation = true;

    private boolean enableFailureQueue = true;
    private int failureQueueCapacity = 100000;
    private boolean enableFailureReplay = true;
    private int failureReplayBatchSize = 500;

    private Duration redisPipelineFlushInterval = Duration.ofMillis(10);
    private int pipelineBatchSize = 100;

    public HybridStateBackendConfig() {
    }

    public String getRocksDbPath() {
        return rocksDbPath;
    }

    public void setRocksDbPath(String rocksDbPath) {
        this.rocksDbPath = rocksDbPath;
    }

    public String getRedisHost() {
        return redisHost;
    }

    public void setRedisHost(String redisHost) {
        this.redisHost = redisHost;
    }

    public int getRedisPort() {
        return redisPort;
    }

    public void setRedisPort(int redisPort) {
        this.redisPort = redisPort;
    }

    public String getRedisPassword() {
        return redisPassword;
    }

    public void setRedisPassword(String redisPassword) {
        this.redisPassword = redisPassword;
    }

    public int getRedisDatabase() {
        return redisDatabase;
    }

    public void setRedisDatabase(int redisDatabase) {
        this.redisDatabase = redisDatabase;
    }

    public Duration getHotDataTTL() {
        return hotDataTTL;
    }

    public void setHotDataTTL(Duration hotDataTTL) {
        this.hotDataTTL = hotDataTTL;
    }

    public double getHotDataRatioThreshold() {
        return hotDataRatioThreshold;
    }

    public void setHotDataRatioThreshold(double hotDataRatioThreshold) {
        this.hotDataRatioThreshold = hotDataRatioThreshold;
    }

    public int getRedisBatchSize() {
        return redisBatchSize;
    }

    public void setRedisBatchSize(int redisBatchSize) {
        this.redisBatchSize = redisBatchSize;
    }

    public Duration getRedisBatchInterval() {
        return redisBatchInterval;
    }

    public void setRedisBatchInterval(Duration redisBatchInterval) {
        this.redisBatchInterval = redisBatchInterval;
    }

    public String getHdfsCheckpointPath() {
        return hdfsCheckpointPath;
    }

    public void setHdfsCheckpointPath(String hdfsCheckpointPath) {
        this.hdfsCheckpointPath = hdfsCheckpointPath;
    }

    public String getHdfsSnapshotPath() {
        return hdfsSnapshotPath;
    }

    public void setHdfsSnapshotPath(String hdfsSnapshotPath) {
        this.hdfsSnapshotPath = hdfsSnapshotPath;
    }

    public int getMaxRedisConnections() {
        return maxRedisConnections;
    }

    public void setMaxRedisConnections(int maxRedisConnections) {
        this.maxRedisConnections = maxRedisConnections;
    }

    public Duration getConnectionTimeout() {
        return connectionTimeout;
    }

    public void setConnectionTimeout(Duration connectionTimeout) {
        this.connectionTimeout = connectionTimeout;
    }

    public Duration getSocketTimeout() {
        return socketTimeout;
    }

    public void setSocketTimeout(Duration socketTimeout) {
        this.socketTimeout = socketTimeout;
    }

    public boolean isEnableAutoTuning() {
        return enableAutoTuning;
    }

    public void setEnableAutoTuning(boolean enableAutoTuning) {
        this.enableAutoTuning = enableAutoTuning;
    }

    public Duration getTuningInterval() {
        return tuningInterval;
    }

    public void setTuningInterval(Duration tuningInterval) {
        this.tuningInterval = tuningInterval;
    }

    public double getTargetCacheHitRate() {
        return targetCacheHitRate;
    }

    public void setTargetCacheHitRate(double targetCacheHitRate) {
        this.targetCacheHitRate = targetCacheHitRate;
    }

    public int getWriteBufferCapacity() {
        return writeBufferCapacity;
    }

    public void setWriteBufferCapacity(int writeBufferCapacity) {
        this.writeBufferCapacity = writeBufferCapacity;
    }

    public int getBackPressureHighWaterMark() {
        return backPressureHighWaterMark;
    }

    public void setBackPressureHighWaterMark(int backPressureHighWaterMark) {
        this.backPressureHighWaterMark = backPressureHighWaterMark;
    }

    public int getBackPressureLowWaterMark() {
        return backPressureLowWaterMark;
    }

    public void setBackPressureLowWaterMark(int backPressureLowWaterMark) {
        this.backPressureLowWaterMark = backPressureLowWaterMark;
    }

    public int getBackPressureTimeoutMs() {
        return backPressureTimeoutMs;
    }

    public void setBackPressureTimeoutMs(int backPressureTimeoutMs) {
        this.backPressureTimeoutMs = backPressureTimeoutMs;
    }

    public int getRedisMaxFailureCount() {
        return redisMaxFailureCount;
    }

    public void setRedisMaxFailureCount(int redisMaxFailureCount) {
        this.redisMaxFailureCount = redisMaxFailureCount;
    }

    public Duration getRedisFailureRetryInterval() {
        return redisFailureRetryInterval;
    }

    public void setRedisFailureRetryInterval(Duration redisFailureRetryInterval) {
        this.redisFailureRetryInterval = redisFailureRetryInterval;
    }

    public boolean isEnableDegradation() {
        return enableDegradation;
    }

    public void setEnableDegradation(boolean enableDegradation) {
        this.enableDegradation = enableDegradation;
    }

    public boolean isEnableFailureQueue() {
        return enableFailureQueue;
    }

    public void setEnableFailureQueue(boolean enableFailureQueue) {
        this.enableFailureQueue = enableFailureQueue;
    }

    public int getFailureQueueCapacity() {
        return failureQueueCapacity;
    }

    public void setFailureQueueCapacity(int failureQueueCapacity) {
        this.failureQueueCapacity = failureQueueCapacity;
    }

    public boolean isEnableFailureReplay() {
        return enableFailureReplay;
    }

    public void setEnableFailureReplay(boolean enableFailureReplay) {
        this.enableFailureReplay = enableFailureReplay;
    }

    public int getFailureReplayBatchSize() {
        return failureReplayBatchSize;
    }

    public void setFailureReplayBatchSize(int failureReplayBatchSize) {
        this.failureReplayBatchSize = failureReplayBatchSize;
    }

    public Duration getRedisPipelineFlushInterval() {
        return redisPipelineFlushInterval;
    }

    public void setRedisPipelineFlushInterval(Duration redisPipelineFlushInterval) {
        this.redisPipelineFlushInterval = redisPipelineFlushInterval;
    }

    public int getPipelineBatchSize() {
        return pipelineBatchSize;
    }

    public void setPipelineBatchSize(int pipelineBatchSize) {
        this.pipelineBatchSize = pipelineBatchSize;
    }
}
