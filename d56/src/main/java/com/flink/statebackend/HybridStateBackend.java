package com.flink.statebackend;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.manager.StateBackendManager;
import com.flink.statebackend.model.CacheStatistics;
import com.flink.statebackend.model.StateValue;
import com.flink.statebackend.predictive.PredictiveWarmUpManager;
import com.flink.statebackend.store.RocksDBStoreManager;
import com.flink.statebackend.store.RedisCacheManager;
import org.rocksdb.RocksDBException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.ObjectInputStream;
import java.io.ObjectOutputStream;
import java.io.Serializable;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class HybridStateBackend implements Serializable, AutoCloseable {

    private static final long serialVersionUID = 1L;
    private static final Logger LOG = LoggerFactory.getLogger(HybridStateBackend.class);

    private HybridStateBackendConfig config;
    private transient RocksDBStoreManager rocksDBManager;
    private transient RedisCacheManager redisManager;
    private transient CacheStatistics statistics;
    private transient ScheduledExecutorService maintenanceExecutor;
    private transient AtomicBoolean initialized;

    private transient PredictiveWarmUpManager warmUpManager;
    private transient StateBackendManager manager;

    public HybridStateBackend(HybridStateBackendConfig config) {
        this.config = config;
        this.statistics = new CacheStatistics();
        this.initialized = new AtomicBoolean(false);
    }

    public void initialize() throws RocksDBException {
        if (initialized.compareAndSet(false, true)) {
            this.rocksDBManager = new RocksDBStoreManager(config);
            this.rocksDBManager.initialize();

            this.redisManager = new RedisCacheManager(config, statistics);
            this.redisManager.initialize();

            this.warmUpManager = new PredictiveWarmUpManager(config, rocksDBManager, redisManager);
            this.manager = new StateBackendManager(this, warmUpManager);

            startMaintenanceTasks();

            LOG.info("HybridStateBackend initialized successfully with predictive warm-up");
        }
    }

    private void startMaintenanceTasks() {
        this.maintenanceExecutor = Executors.newScheduledThreadPool(2, r -> {
            Thread t = new Thread(r, "state-backend-maintenance");
            t.setDaemon(true);
            return t;
        });

        maintenanceExecutor.scheduleAtFixedRate(
                this::cleanupExpiredData,
                5,
                5,
                TimeUnit.MINUTES
        );

        if (config.isEnableAutoTuning()) {
            maintenanceExecutor.scheduleAtFixedRate(
                    this::tuneHotDataRatio,
                    config.getTuningInterval().toMillis(),
                    config.getTuningInterval().toMillis(),
                    TimeUnit.MILLISECONDS
            );
        }

        maintenanceExecutor.scheduleAtFixedRate(
                this::updateStatistics,
                1,
                1,
                TimeUnit.MINUTES
        );
    }

    public byte[] getState(String key) throws RocksDBException {
        StateValue stateValue = get(key);
        if (stateValue == null) {
            return null;
        }
        return stateValue.getValue();
    }

    public StateValue get(String key) throws RocksDBException {
        ensureInitialized();

        StateValue value = redisManager.get(key);
        if (value != null) {
            statistics.recordRedisHit();
            value.access();
            redisManager.refreshTTL(key);
            return value;
        }

        statistics.recordRedisMiss();
        value = rocksDBManager.get(key);

        if (value != null) {
            statistics.recordRocksdbHit();
            value.access();
            try {
                redisManager.putAsync(key, value);
            } catch (Exception e) {
                LOG.debug("Failed to async populate Redis cache for key: {}, error: {}", key, e.getMessage());
            }
        } else {
            statistics.recordRocksdbMiss();
        }

        return value;
    }

    public void put(String key, byte[] value) throws RocksDBException {
        ensureInitialized();
        StateValue stateValue = new StateValue(value, config.getHotDataTTL().toMillis());
        put(key, stateValue);
    }

    public void put(String key, StateValue value) throws RocksDBException {
        ensureInitialized();

        rocksDBManager.put(key, value);

        try {
            redisManager.putAsync(key, value);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            LOG.warn("Interrupted while putting to Redis cache: {}", key);
        } catch (Exception e) {
            LOG.debug("Failed to async put to Redis cache for key: {}, error: {}", key, e.getMessage());
        }

        statistics.recordWrite();
    }

    public void putBatch(Map<String, StateValue> batch) throws RocksDBException {
        ensureInitialized();

        if (batch == null || batch.isEmpty()) {
            return;
        }

        rocksDBManager.putBatch(batch);
        redisManager.putBatchSync(batch);

        for (int i = 0; i < batch.size(); i++) {
            statistics.recordWrite();
        }
    }

    public void delete(String key) throws RocksDBException {
        ensureInitialized();

        rocksDBManager.delete(key);
        redisManager.delete(key);
    }

    public boolean containsKey(String key) throws RocksDBException {
        ensureInitialized();

        if (redisManager.exists(key)) {
            return true;
        }
        return rocksDBManager.containsKey(key);
    }

    public Map<String, StateValue> scan(String prefix, int limit) throws RocksDBException {
        ensureInitialized();
        return rocksDBManager.scan(prefix, limit);
    }

    public void evictFromCache(String key) {
        if (redisManager != null) {
            redisManager.delete(key);
            statistics.recordEviction();
        }
    }

    private void cleanupExpiredData() {
        try {
            rocksDBManager.cleanupExpiredData();
            LOG.debug("Expired data cleanup completed");
        } catch (Exception e) {
            LOG.error("Failed to cleanup expired data", e);
        }
    }

    private void tuneHotDataRatio() {
        try {
            double currentHitRate = statistics.getRedisHitRate();
            double targetHitRate = config.getTargetCacheHitRate();

            if (currentHitRate < targetHitRate * 0.9) {
                increaseHotDataRatio();
            } else if (currentHitRate > targetHitRate * 1.1) {
                decreaseHotDataRatio();
            }

            LOG.info("Auto tuning completed. Current hit rate: {:.2f}%, Target: {:.2f}%",
                    currentHitRate * 100, targetHitRate * 100);
        } catch (Exception e) {
            LOG.error("Failed to tune hot data ratio", e);
        }
    }

    private void increaseHotDataRatio() {
        double newRatio = Math.min(0.8, config.getHotDataRatioThreshold() + 0.05);
        config.setHotDataRatioThreshold(newRatio);
        LOG.info("Increased hot data ratio to: {}", newRatio);
    }

    private void decreaseHotDataRatio() {
        double newRatio = Math.max(0.1, config.getHotDataRatioThreshold() - 0.05);
        config.setHotDataRatioThreshold(newRatio);
        LOG.info("Decreased hot data ratio to: {}", newRatio);
    }

    private void updateStatistics() {
        try {
            long hotCount = redisManager.getHotDataCount();
            long coldCount = rocksDBManager.getApproximateKeyCount();

            statistics.setHotDataCount(hotCount);
            statistics.setColdDataCount(coldCount);

            LOG.debug("Statistics updated: {}", statistics);
        } catch (Exception e) {
            LOG.error("Failed to update statistics", e);
        }
    }

    public CacheStatistics getStatistics() {
        return statistics;
    }

    public void flush() {
        if (redisManager != null) {
            redisManager.flush();
        }
    }

    public Map<String, StateValue> getAllHotData() {
        ensureInitialized();
        return redisManager.getAllHotData();
    }

    public RocksDBStoreManager getRocksDBManager() {
        return rocksDBManager;
    }

    public RedisCacheManager getRedisManager() {
        return redisManager;
    }

    public HybridStateBackendConfig getConfig() {
        return config;
    }

    public StateBackendManager getManager() {
        return manager;
    }

    public PredictiveWarmUpManager getWarmUpManager() {
        return warmUpManager;
    }

    public boolean isDegraded() {
        return redisManager != null && redisManager.isDegraded();
    }

    public int getWriteBufferSize() {
        return redisManager != null ? redisManager.getWriteBufferSize() : 0;
    }

    public int getFailureQueueSize() {
        return redisManager != null ? redisManager.getFailureQueueSize() : 0;
    }

    public int getConsecutiveFailures() {
        return redisManager != null ? redisManager.getConsecutiveFailures() : 0;
    }

    private void ensureInitialized() {
        if (!initialized.get()) {
            throw new IllegalStateException("HybridStateBackend not initialized");
        }
    }

    private void writeObject(ObjectOutputStream oos) throws IOException {
        oos.defaultWriteObject();
    }

    private void readObject(ObjectInputStream ois) throws IOException, ClassNotFoundException {
        ois.defaultReadObject();
        this.statistics = new CacheStatistics();
        this.initialized = new AtomicBoolean(false);
    }

    @Override
    public void close() {
        if (initialized.compareAndSet(true, false)) {
            if (maintenanceExecutor != null) {
                maintenanceExecutor.shutdown();
                try {
                    if (!maintenanceExecutor.awaitTermination(5, TimeUnit.SECONDS)) {
                        maintenanceExecutor.shutdownNow();
                    }
                } catch (InterruptedException e) {
                    maintenanceExecutor.shutdownNow();
                    Thread.currentThread().interrupt();
                }
            }

            if (warmUpManager != null) {
                warmUpManager.close();
                warmUpManager = null;
            }

            if (redisManager != null) {
                redisManager.close();
                redisManager = null;
            }

            if (rocksDBManager != null) {
                rocksDBManager.close();
                rocksDBManager = null;
            }

            LOG.info("HybridStateBackend closed successfully");
        }
    }
}
