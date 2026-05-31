package com.flink.statebackend.predictive;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.StateValue;
import com.flink.statebackend.store.RocksDBStoreManager;
import com.flink.statebackend.store.RedisCacheManager;
import org.rocksdb.RocksDBException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.time.Duration;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

public class PredictiveWarmUpManager implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(PredictiveWarmUpManager.class);

    private final HybridStateBackendConfig config;
    private final RocksDBStoreManager rocksDBManager;
    private final RedisCacheManager redisManager;

    private final ScheduledExecutorService scheduler;
    private final ExecutorService warmUpExecutor;
    private final AtomicBoolean running = new AtomicBoolean(true);

    private final Set<String> alwaysHotKeys;
    private final Map<String, Long> lastWarmedUpTimes;

    private final long warmUpTimeMs;
    private final long scanIntervalMs;
    private final long minWarmUpIntervalMs;

    private final AtomicLong totalWarmUps = new AtomicLong(0);
    private final AtomicLong predictiveWarmUps = new AtomicLong(0);
    private final AtomicLong alwaysHotWarmUps = new AtomicLong(0);

    public PredictiveWarmUpManager(HybridStateBackendConfig config,
                                    RocksDBStoreManager rocksDBManager,
                                    RedisCacheManager redisManager) {
        this.config = config;
        this.rocksDBManager = rocksDBManager;
        this.redisManager = redisManager;

        this.warmUpTimeMs = Duration.ofMinutes(5).toMillis();
        this.scanIntervalMs = Duration.ofMinutes(1).toMillis();
        this.minWarmUpIntervalMs = Duration.ofMinutes(30).toMillis();

        this.alwaysHotKeys = ConcurrentHashMap.newKeySet();
        this.lastWarmedUpTimes = new ConcurrentHashMap<>();

        this.scheduler = Executors.newScheduledThreadPool(1, r -> {
            Thread t = new Thread(r, "predictive-warmup-scheduler");
            t.setDaemon(true);
            return t;
        });

        this.warmUpExecutor = Executors.newFixedThreadPool(2, r -> {
            Thread t = new Thread(r, "predictive-warmup-worker");
            t.setDaemon(true);
            return t;
        });

        startScheduledWarmUp();
        startAlwaysHotKeeper();

        LOG.info("PredictiveWarmUpManager initialized with 5min warm-up window, 1min scan interval");
    }

    private void startScheduledWarmUp() {
        scheduler.scheduleAtFixedRate(
            this::scanAndWarmUp,
            scanIntervalMs,
            scanIntervalMs,
            TimeUnit.MILLISECONDS
        );
        LOG.info("Scheduled predictive warm-up task started (interval: {}ms)", scanIntervalMs);
    }

    private void startAlwaysHotKeeper() {
        scheduler.scheduleAtFixedRate(
            this::refreshAlwaysHotKeys,
            Duration.ofMinutes(10).toMillis(),
            Duration.ofMinutes(10).toMillis(),
            TimeUnit.MILLISECONDS
        );
        LOG.info("Always-hot key keeper task started (interval: 10min)");
    }

    private void scanAndWarmUp() {
        if (!running.get() || redisManager.isDegraded()) {
            return;
        }

        warmUpExecutor.submit(this::doWarmUpScan);
    }

    private void doWarmUpScan() {
        try {
            int warmedCount = 0;
            long startTime = System.currentTimeMillis();

            warmedCount += warmUpAlwaysHotKeys();
            warmedCount += warmUpPeriodicKeys();

            long duration = System.currentTimeMillis() - startTime;
            if (warmedCount > 0) {
                LOG.debug("Warmed up {} keys in {}ms", warmedCount, duration);
            }
        } catch (Exception e) {
            LOG.error("Error during predictive warm-up scan", e);
        }
    }

    private int warmUpAlwaysHotKeys() {
        if (alwaysHotKeys.isEmpty()) {
            return 0;
        }

        int warmed = 0;
        long now = System.currentTimeMillis();

        for (String key : alwaysHotKeys) {
            Long lastWarmed = lastWarmedUpTimes.get(key);
            if (lastWarmed == null || (now - lastWarmed) >= minWarmUpIntervalMs) {
                if (warmUpKey(key)) {
                    lastWarmedUpTimes.put(key, now);
                    alwaysHotWarmUps.incrementAndGet();
                    totalWarmUps.incrementAndGet();
                    warmed++;
                }
            }
        }

        return warmed;
    }

    private int warmUpPeriodicKeys() {
        int warmed = 0;
        long now = System.currentTimeMillis();

        try {
            Map<String, StateValue> candidates = rocksDBManager.scan("", 1000);

            for (Map.Entry<String, StateValue> entry : candidates.entrySet()) {
                String key = entry.getKey();
                StateValue value = entry.getValue();

                if (value == null) {
                    continue;
                }

                if (value.isAlwaysHot()) {
                    markAsAlwaysHot(key);
                    continue;
                }

                if (value.hasPeriodicPattern()) {
                    Long predictedTime = value.predictNextAccessTime();
                    if (predictedTime == null) {
                        continue;
                    }

                    long warmUpThreshold = predictedTime - warmUpTimeMs;
                    if (now >= warmUpThreshold && now <= predictedTime + warmUpTimeMs) {
                        Long lastWarmed = lastWarmedUpTimes.get(key);
                        if (lastWarmed == null || (now - lastWarmed) >= minWarmUpIntervalMs) {
                            if (warmUpKey(key)) {
                                lastWarmedUpTimes.put(key, now);
                                predictiveWarmUps.incrementAndGet();
                                totalWarmUps.incrementAndGet();
                                warmed++;
                            }
                        }
                    }
                }
            }
        } catch (RocksDBException e) {
            LOG.error("Error scanning RocksDB for predictive warm-up", e);
        }

        return warmed;
    }

    private boolean warmUpKey(String key) {
        try {
            StateValue value = rocksDBManager.get(key);
            if (value == null) {
                return false;
            }

            redisManager.putSync(key, value);

            LOG.trace("Warmed up key: {}", key);
            return true;

        } catch (Exception e) {
            LOG.debug("Failed to warm up key: {}", key, e);
            return false;
        }
    }

    private void refreshAlwaysHotKeys() {
        if (!running.get() || redisManager.isDegraded()) {
            return;
        }

        for (String key : alwaysHotKeys) {
            try {
                StateValue value = rocksDBManager.get(key);
                if (value != null) {
                    redisManager.putSync(key, value);
                }
            } catch (Exception e) {
                LOG.debug("Failed to refresh always-hot key: {}", key, e);
            }
        }
    }

    public void markAsAlwaysHot(String key) {
        alwaysHotKeys.add(key);
        LOG.info("Marked key as always-hot: {}", key);

        warmUpExecutor.submit(() -> {
            try {
                StateValue value = rocksDBManager.get(key);
                if (value != null) {
                    value.setAlwaysHot(true);
                    rocksDBManager.put(key, value);
                    redisManager.putSync(key, value);
                }
            } catch (Exception e) {
                LOG.error("Failed to mark key as always-hot: {}", key, e);
            }
        });
    }

    public void unmarkAsAlwaysHot(String key) {
        alwaysHotKeys.remove(key);
        lastWarmedUpTimes.remove(key);
        LOG.info("Unmarked key as always-hot: {}", key);

        warmUpExecutor.submit(() -> {
            try {
                StateValue value = rocksDBManager.get(key);
                if (value != null) {
                    value.setAlwaysHot(false);
                    rocksDBManager.put(key, value);
                }
            } catch (Exception e) {
                LOG.error("Failed to unmark key as always-hot: {}", key, e);
            }
        });
    }

    public boolean isAlwaysHot(String key) {
        return alwaysHotKeys.contains(key);
    }

    public Set<String> getAllAlwaysHotKeys() {
        return new java.util.HashSet<>(alwaysHotKeys);
    }

    public void triggerImmediateWarmUp(String key) {
        warmUpExecutor.submit(() -> {
            if (warmUpKey(key)) {
                lastWarmedUpTimes.put(key, System.currentTimeMillis());
                totalWarmUps.incrementAndGet();
            }
        });
    }

    public void triggerBatchWarmUp(Set<String> keys) {
        warmUpExecutor.submit(() -> {
            long now = System.currentTimeMillis();
            int count = 0;

            for (String key : keys) {
                if (warmUpKey(key)) {
                    lastWarmedUpTimes.put(key, now);
                    totalWarmUps.incrementAndGet();
                    count++;
                }
            }

            LOG.info("Batch warm-up completed: {} keys", count);
        });
    }

    public long getTotalWarmUps() {
        return totalWarmUps.get();
    }

    public long getPredictiveWarmUps() {
        return predictiveWarmUps.get();
    }

    public long getAlwaysHotWarmUps() {
        return alwaysHotWarmUps.get();
    }

    public int getAlwaysHotKeyCount() {
        return alwaysHotKeys.size();
    }

    public void cleanUpOldWarmUpRecords() {
        long cutoff = System.currentTimeMillis() - Duration.ofHours(24).toMillis();
        Iterator<Map.Entry<String, Long>> iterator = lastWarmedUpTimes.entrySet().iterator();

        int removed = 0;
        while (iterator.hasNext()) {
            Map.Entry<String, Long> entry = iterator.next();
            if (entry.getValue() < cutoff && !alwaysHotKeys.contains(entry.getKey())) {
                iterator.remove();
                removed++;
            }
        }

        if (removed > 0) {
            LOG.debug("Cleaned up {} old warm-up records", removed);
        }
    }

    @Override
    public void close() {
        running.set(false);

        scheduler.shutdown();
        try {
            if (!scheduler.awaitTermination(10, TimeUnit.SECONDS)) {
                scheduler.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduler.shutdownNow();
            Thread.currentThread().interrupt();
        }

        warmUpExecutor.shutdown();
        try {
            if (!warmUpExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                warmUpExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            warmUpExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }

        LOG.info("PredictiveWarmUpManager closed. Total warm-ups: {}, predictive: {}, always-hot: {}",
            totalWarmUps.get(), predictiveWarmUps.get(), alwaysHotWarmUps.get());
    }
}
