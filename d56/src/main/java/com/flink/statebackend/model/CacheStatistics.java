package com.flink.statebackend.model;

import java.io.Serializable;
import java.util.concurrent.atomic.AtomicLong;

public class CacheStatistics implements Serializable {

    private static final long serialVersionUID = 1L;

    private final AtomicLong redisHits = new AtomicLong(0);
    private final AtomicLong redisMisses = new AtomicLong(0);
    private final AtomicLong rocksdbHits = new AtomicLong(0);
    private final AtomicLong rocksdbMisses = new AtomicLong(0);
    private final AtomicLong totalWrites = new AtomicLong(0);
    private final AtomicLong evictions = new AtomicLong(0);
    private final AtomicLong hotDataCount = new AtomicLong(0);
    private final AtomicLong coldDataCount = new AtomicLong(0);

    private final AtomicLong backPressureEvents = new AtomicLong(0);
    private final AtomicLong backPressureTotalTimeMs = new AtomicLong(0);
    private final AtomicLong redisWriteFailures = new AtomicLong(0);
    private final AtomicLong redisWriteSuccesses = new AtomicLong(0);
    private final AtomicLong failureQueueSize = new AtomicLong(0);
    private final AtomicLong failureReplayCount = new AtomicLong(0);
    private final AtomicLong degradationEvents = new AtomicLong(0);
    private final AtomicLong recoveryEvents = new AtomicLong(0);

    private volatile boolean isDegraded = false;
    private long lastResetTime;

    public CacheStatistics() {
        this.lastResetTime = System.currentTimeMillis();
    }

    public void recordRedisHit() {
        redisHits.incrementAndGet();
    }

    public void recordRedisMiss() {
        redisMisses.incrementAndGet();
    }

    public void recordRocksdbHit() {
        rocksdbHits.incrementAndGet();
    }

    public void recordRocksdbMiss() {
        rocksdbMisses.incrementAndGet();
    }

    public void recordWrite() {
        totalWrites.incrementAndGet();
    }

    public void recordEviction() {
        evictions.incrementAndGet();
    }

    public void setHotDataCount(long count) {
        hotDataCount.set(count);
    }

    public void setColdDataCount(long count) {
        coldDataCount.set(count);
    }

    public void recordBackPressure(long durationMs) {
        backPressureEvents.incrementAndGet();
        backPressureTotalTimeMs.addAndGet(durationMs);
    }

    public void recordRedisWriteFailure() {
        redisWriteFailures.incrementAndGet();
    }

    public void recordRedisWriteSuccess() {
        redisWriteSuccesses.incrementAndGet();
    }

    public void setFailureQueueSize(long size) {
        failureQueueSize.set(size);
    }

    public void recordFailureReplay(int count) {
        failureReplayCount.addAndGet(count);
    }

    public void recordDegradation() {
        degradationEvents.incrementAndGet();
        isDegraded = true;
    }

    public void recordRecovery() {
        recoveryEvents.incrementAndGet();
        isDegraded = false;
    }

    public long getBackPressureEvents() {
        return backPressureEvents.get();
    }

    public long getBackPressureTotalTimeMs() {
        return backPressureTotalTimeMs.get();
    }

    public long getRedisWriteFailures() {
        return redisWriteFailures.get();
    }

    public long getRedisWriteSuccesses() {
        return redisWriteSuccesses.get();
    }

    public long getFailureQueueSize() {
        return failureQueueSize.get();
    }

    public long getFailureReplayCount() {
        return failureReplayCount.get();
    }

    public long getDegradationEvents() {
        return degradationEvents.get();
    }

    public long getRecoveryEvents() {
        return recoveryEvents.get();
    }

    public boolean isDegraded() {
        return isDegraded;
    }

    public double getRedisHitRate() {
        long total = redisHits.get() + redisMisses.get();
        if (total == 0) {
            return 0.0;
        }
        return (double) redisHits.get() / total;
    }

    public double getOverallHitRate() {
        long total = redisHits.get() + redisMisses.get();
        if (total == 0) {
            return 0.0;
        }
        return (double) (redisHits.get() + rocksdbHits.get()) / total;
    }

    public long getRedisHits() {
        return redisHits.get();
    }

    public long getRedisMisses() {
        return redisMisses.get();
    }

    public long getRocksdbHits() {
        return rocksdbHits.get();
    }

    public long getRocksdbMisses() {
        return rocksdbMisses.get();
    }

    public long getTotalWrites() {
        return totalWrites.get();
    }

    public long getEvictions() {
        return evictions.get();
    }

    public long getHotDataCount() {
        return hotDataCount.get();
    }

    public long getColdDataCount() {
        return coldDataCount.get();
    }

    public void reset() {
        redisHits.set(0);
        redisMisses.set(0);
        rocksdbHits.set(0);
        rocksdbMisses.set(0);
        totalWrites.set(0);
        evictions.set(0);
        lastResetTime = System.currentTimeMillis();
    }

    public long getLastResetTime() {
        return lastResetTime;
    }

    @Override
    public String toString() {
        return String.format(
                "CacheStatistics{redisHitRate=%.2f%%, overallHitRate=%.2f%%, " +
                        "redisHits=%d, redisMisses=%d, rocksdbHits=%d, rocksdbMisses=%d, " +
                        "totalWrites=%d, evictions=%d, hotDataCount=%d, coldDataCount=%d, " +
                        "backPressureEvents=%d, backPressureTime=%dms, " +
                        "redisWriteSuccesses=%d, redisWriteFailures=%d, " +
                        "failureQueueSize=%d, failureReplayCount=%d, " +
                        "degradationEvents=%d, recoveryEvents=%d, isDegraded=%s}",
                getRedisHitRate() * 100, getOverallHitRate() * 100,
                getRedisHits(), getRedisMisses(), getRocksdbHits(), getRocksdbMisses(),
                getTotalWrites(), getEvictions(), getHotDataCount(), getColdDataCount(),
                getBackPressureEvents(), getBackPressureTotalTimeMs(),
                getRedisWriteSuccesses(), getRedisWriteFailures(),
                getFailureQueueSize(), getFailureReplayCount(),
                getDegradationEvents(), getRecoveryEvents(), isDegraded()
        );
    }
}
