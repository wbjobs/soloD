package com.flink.statebackend.manager;

import com.flink.statebackend.HybridStateBackend;
import com.flink.statebackend.model.HotColdDistribution;
import com.flink.statebackend.model.StateValue;
import com.flink.statebackend.predictive.PredictiveWarmUpManager;
import org.rocksdb.RocksDBException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class StateBackendManager {

    private static final Logger LOG = LoggerFactory.getLogger(StateBackendManager.class);

    private final HybridStateBackend stateBackend;
    private final PredictiveWarmUpManager warmUpManager;

    public StateBackendManager(HybridStateBackend stateBackend,
                               PredictiveWarmUpManager warmUpManager) {
        this.stateBackend = stateBackend;
        this.warmUpManager = warmUpManager;
    }

    public void markAsAlwaysHot(String key) {
        if (warmUpManager != null) {
            warmUpManager.markAsAlwaysHot(key);
            LOG.info("Key marked as always-hot: {}", key);
        }
    }

    public void unmarkAsAlwaysHot(String key) {
        if (warmUpManager != null) {
            warmUpManager.unmarkAsAlwaysHot(key);
            LOG.info("Key unmarked as always-hot: {}", key);
        }
    }

    public boolean isAlwaysHot(String key) {
        return warmUpManager != null && warmUpManager.isAlwaysHot(key);
    }

    public Set<String> getAllAlwaysHotKeys() {
        if (warmUpManager == null) {
            return Collections.emptySet();
        }
        return warmUpManager.getAllAlwaysHotKeys();
    }

    public int getAlwaysHotKeyCount() {
        if (warmUpManager == null) {
            return 0;
        }
        return warmUpManager.getAlwaysHotKeyCount();
    }

    public void triggerWarmUp(String key) {
        if (warmUpManager != null) {
            warmUpManager.triggerImmediateWarmUp(key);
            LOG.info("Triggered immediate warm-up for key: {}", key);
        }
    }

    public void triggerBatchWarmUp(Set<String> keys) {
        if (warmUpManager != null && keys != null && !keys.isEmpty()) {
            warmUpManager.triggerBatchWarmUp(keys);
            LOG.info("Triggered batch warm-up for {} keys", keys.size());
        }
    }

    public HotColdDistribution getHotColdDistribution() {
        HotColdDistribution distribution = new HotColdDistribution();

        try {
            Map<String, StateValue> allKeys = stateBackend.scan("", Integer.MAX_VALUE);

            long total = allKeys.size();
            long hotCount = 0;
            long coldCount = 0;
            long alwaysHotCount = 0;
            long periodicCount = 0;
            long totalAccessCount = 0;

            List<HotColdDistribution.KeyInfo> topKeys = new ArrayList<>();

            for (Map.Entry<String, StateValue> entry : allKeys.entrySet()) {
                String key = entry.getKey();
                StateValue value = entry.getValue();

                if (value == null) {
                    continue;
                }

                boolean isAlwaysHot = value.isAlwaysHot() || isAlwaysHot(key);
                boolean hasPeriod = value.hasPeriodicPattern();
                int accessCount = value.getAccessCount();
                totalAccessCount += accessCount;

                if (isAlwaysHot) {
                    alwaysHotCount++;
                    hotCount++;
                } else if (hasPeriod) {
                    periodicCount++;
                    hotCount++;
                } else {
                    long timeSinceAccess = System.currentTimeMillis() - value.getLastAccessTime();
                    long ttl = stateBackend.getConfig().getHotDataTTL().toMillis();
                    if (timeSinceAccess < ttl) {
                        hotCount++;
                    } else {
                        coldCount++;
                    }
                }

                topKeys.add(new HotColdDistribution.KeyInfo(key, accessCount, isAlwaysHot, hasPeriod));
            }

            Collections.sort(topKeys, (a, b) -> Integer.compare(b.getAccessCount(), a.getAccessCount()));
            if (topKeys.size() > 20) {
                topKeys = topKeys.subList(0, 20);
            }

            distribution.setTotalKeys(total);
            distribution.setHotKeys(hotCount);
            distribution.setColdKeys(coldCount);
            distribution.setAlwaysHotKeys(alwaysHotCount);
            distribution.setPeriodicPatternKeys(periodicCount);
            distribution.setTotalAccessCount(totalAccessCount);
            distribution.setTopHotKeys(topKeys);

        } catch (Exception e) {
            LOG.error("Failed to get hot-cold distribution", e);
        }

        return distribution;
    }

    public String getKeyInfo(String key) {
        try {
            StateValue value = stateBackend.getRocksDBManager().get(key);
            if (value == null) {
                return "Key not found: " + key;
            }

            boolean isAlwaysHotFlag = isAlwaysHot(key);
            boolean isInRedis = stateBackend.getRedisManager().exists(key);
            Long nextAccessTime = value.predictNextAccessTime();
            double confidence = value.getPatternConfidence();

            return String.format(
                "Key: %s\n" +
                "  Access count: %d\n" +
                "  Last access: %d ms ago\n" +
                "  Always-hot: %b\n" +
                "  In Redis: %b\n" +
                "  Has periodic pattern: %b\n" +
                "  Pattern confidence: %.2f\n" +
                "  Predicted next access: %s",
                key,
                value.getAccessCount(),
                System.currentTimeMillis() - value.getLastAccessTime(),
                isAlwaysHotFlag,
                isInRedis,
                value.hasPeriodicPattern(),
                confidence,
                nextAccessTime != null ? new Date(nextAccessTime) : "N/A"
            );

        } catch (RocksDBException e) {
            return "Error getting key info: " + e.getMessage();
        }
    }

    public Map<String, Object> getWarmUpStatistics() {
        Map<String, Object> stats = new LinkedHashMap<>();
        if (warmUpManager != null) {
            stats.put("totalWarmUps", warmUpManager.getTotalWarmUps());
            stats.put("predictiveWarmUps", warmUpManager.getPredictiveWarmUps());
            stats.put("alwaysHotWarmUps", warmUpManager.getAlwaysHotWarmUps());
            stats.put("alwaysHotKeyCount", warmUpManager.getAlwaysHotKeyCount());
        }
        return stats;
    }

    public void evictFromRedis(String key) {
        stateBackend.evictFromCache(key);
    }

    public void evictAllFromRedis() {
        try {
            Set<String> keys = stateBackend.getRedisManager().getAllHotData().keySet();
            for (String key : keys) {
                stateBackend.evictFromCache(key);
            }
            LOG.info("Evicted all {} keys from Redis cache", keys.size());
        } catch (Exception e) {
            LOG.error("Failed to evict all keys from Redis", e);
        }
    }

    public Map<String, Object> getCacheStatistics() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("redisHits", stateBackend.getStatistics().getRedisHits());
        stats.put("redisMisses", stateBackend.getStatistics().getRedisMisses());
        stats.put("rocksdbHits", stateBackend.getStatistics().getRocksdbHits());
        stats.put("rocksdbMisses", stateBackend.getStatistics().getRocksdbMisses());
        stats.put("totalWrites", stateBackend.getStatistics().getTotalWrites());
        stats.put("cacheHitRate", stateBackend.getStatistics().getRedisHitRate());
        stats.put("overallHitRate", stateBackend.getStatistics().getOverallHitRate());
        stats.put("isDegraded", stateBackend.isDegraded());
        stats.put("backPressureEvents", stateBackend.getStatistics().getBackPressureEvents());
        stats.put("redisWriteFailures", stateBackend.getStatistics().getRedisWriteFailures());
        stats.put("degradationEvents", stateBackend.getStatistics().getDegradationEvents());
        return stats;
    }
}
