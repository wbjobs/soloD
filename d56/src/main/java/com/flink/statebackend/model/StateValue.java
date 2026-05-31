package com.flink.statebackend.model;

import java.io.Serializable;
import java.util.Objects;

public class StateValue implements Serializable {

    private static final long serialVersionUID = 1L;

    private byte[] value;
    private long lastAccessTime;
    private long ttl;
    private int accessCount;
    private AccessPattern accessPattern;
    private boolean alwaysHot;

    public StateValue() {
        this.accessPattern = new AccessPattern();
    }

    public StateValue(byte[] value, long ttl) {
        this.value = value;
        this.ttl = ttl;
        this.lastAccessTime = System.currentTimeMillis();
        this.accessCount = 1;
        this.accessPattern = new AccessPattern();
        this.alwaysHot = false;
    }

    public StateValue(byte[] value, long lastAccessTime, long ttl, int accessCount) {
        this.value = value;
        this.lastAccessTime = lastAccessTime;
        this.ttl = ttl;
        this.accessCount = accessCount;
        this.accessPattern = new AccessPattern();
        this.alwaysHot = false;
    }

    public void access() {
        this.lastAccessTime = System.currentTimeMillis();
        this.accessCount++;
        if (accessPattern != null) {
            accessPattern.recordAccess();
        }
    }

    public boolean isExpired() {
        if (ttl <= 0) {
            return false;
        }
        return System.currentTimeMillis() - lastAccessTime > ttl;
    }

    public long getRemainingTTL() {
        if (ttl <= 0) {
            return Long.MAX_VALUE;
        }
        long elapsed = System.currentTimeMillis() - lastAccessTime;
        return Math.max(0, ttl - elapsed);
    }

    public byte[] getValue() {
        return value;
    }

    public void setValue(byte[] value) {
        this.value = value;
    }

    public long getLastAccessTime() {
        return lastAccessTime;
    }

    public void setLastAccessTime(long lastAccessTime) {
        this.lastAccessTime = lastAccessTime;
    }

    public long getTtl() {
        return ttl;
    }

    public void setTtl(long ttl) {
        this.ttl = ttl;
    }

    public int getAccessCount() {
        return accessCount;
    }

    public void setAccessCount(int accessCount) {
        this.accessCount = accessCount;
    }

    public AccessPattern getAccessPattern() {
        if (accessPattern == null) {
            accessPattern = new AccessPattern();
        }
        return accessPattern;
    }

    public void setAccessPattern(AccessPattern accessPattern) {
        this.accessPattern = accessPattern;
    }

    public boolean isAlwaysHot() {
        return alwaysHot || (accessPattern != null && accessPattern.isAlwaysHot());
    }

    public void setAlwaysHot(boolean alwaysHot) {
        this.alwaysHot = alwaysHot;
        if (accessPattern != null) {
            accessPattern.setAlwaysHot(alwaysHot);
        }
    }

    public boolean hasPeriodicPattern() {
        return accessPattern != null && accessPattern.hasPeriodicPattern();
    }

    public Long predictNextAccessTime() {
        return accessPattern != null ? accessPattern.predictNextAccessTime() : null;
    }

    public double getPatternConfidence() {
        return accessPattern != null ? accessPattern.getPatternConfidence() : 0.0;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        StateValue that = (StateValue) o;
        return lastAccessTime == that.lastAccessTime &&
                ttl == that.ttl &&
                accessCount == that.accessCount &&
                java.util.Arrays.equals(value, that.value);
    }

    @Override
    public int hashCode() {
        int result = Objects.hash(lastAccessTime, ttl, accessCount);
        result = 31 * result + java.util.Arrays.hashCode(value);
        return result;
    }
}
