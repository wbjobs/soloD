package com.flink.statebackend.model;

import java.io.Serializable;
import java.util.ArrayList;
import java.util.List;

public class HotColdDistribution implements Serializable {

    private static final long serialVersionUID = 1L;

    private long totalKeys;
    private long hotKeys;
    private long coldKeys;
    private long alwaysHotKeys;
    private long periodicPatternKeys;

    private double hotKeyPercentage;
    private double coldKeyPercentage;
    private double alwaysHotPercentage;
    private double periodicPatternPercentage;

    private long totalAccessCount;
    private double avgAccessCount;
    private List<KeyInfo> topHotKeys;

    public HotColdDistribution() {
        this.topHotKeys = new ArrayList<>();
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
        this.hotKeyPercentage = totalKeys > 0 ? (double) hotKeys / totalKeys * 100 : 0;
    }

    public long getColdKeys() {
        return coldKeys;
    }

    public void setColdKeys(long coldKeys) {
        this.coldKeys = coldKeys;
        this.coldKeyPercentage = totalKeys > 0 ? (double) coldKeys / totalKeys * 100 : 0;
    }

    public long getAlwaysHotKeys() {
        return alwaysHotKeys;
    }

    public void setAlwaysHotKeys(long alwaysHotKeys) {
        this.alwaysHotKeys = alwaysHotKeys;
        this.alwaysHotPercentage = totalKeys > 0 ? (double) alwaysHotKeys / totalKeys * 100 : 0;
    }

    public long getPeriodicPatternKeys() {
        return periodicPatternKeys;
    }

    public void setPeriodicPatternKeys(long periodicPatternKeys) {
        this.periodicPatternKeys = periodicPatternKeys;
        this.periodicPatternPercentage = totalKeys > 0 ? (double) periodicPatternKeys / totalKeys * 100 : 0;
    }

    public double getHotKeyPercentage() {
        return hotKeyPercentage;
    }

    public double getColdKeyPercentage() {
        return coldKeyPercentage;
    }

    public double getAlwaysHotPercentage() {
        return alwaysHotPercentage;
    }

    public double getPeriodicPatternPercentage() {
        return periodicPatternPercentage;
    }

    public long getTotalAccessCount() {
        return totalAccessCount;
    }

    public void setTotalAccessCount(long totalAccessCount) {
        this.totalAccessCount = totalAccessCount;
        this.avgAccessCount = totalKeys > 0 ? (double) totalAccessCount / totalKeys : 0;
    }

    public double getAvgAccessCount() {
        return avgAccessCount;
    }

    public List<KeyInfo> getTopHotKeys() {
        return topHotKeys;
    }

    public void setTopHotKeys(List<KeyInfo> topHotKeys) {
        this.topHotKeys = topHotKeys;
    }

    public void addTopHotKey(String key, int accessCount, boolean alwaysHot, boolean hasPeriod) {
        this.topHotKeys.add(new KeyInfo(key, accessCount, alwaysHot, hasPeriod));
    }

    public static class KeyInfo implements Serializable {
        private static final long serialVersionUID = 1L;
        private String key;
        private int accessCount;
        private boolean alwaysHot;
        private boolean hasPeriodicPattern;

        public KeyInfo(String key, int accessCount, boolean alwaysHot, boolean hasPeriodicPattern) {
            this.key = key;
            this.accessCount = accessCount;
            this.alwaysHot = alwaysHot;
            this.hasPeriodicPattern = hasPeriodicPattern;
        }

        public String getKey() {
            return key;
        }

        public int getAccessCount() {
            return accessCount;
        }

        public boolean isAlwaysHot() {
            return alwaysHot;
        }

        public boolean isHasPeriodicPattern() {
            return hasPeriodicPattern;
        }
    }

    @Override
    public String toString() {
        return String.format(
            "HotColdDistribution{total=%d, hot=%d (%.1f%%), cold=%d (%.1f%%), " +
            "alwaysHot=%d (%.1f%%), periodic=%d (%.1f%%), avgAccess=%.1f}",
            totalKeys, hotKeys, hotKeyPercentage,
            coldKeys, coldKeyPercentage,
            alwaysHotKeys, alwaysHotPercentage,
            periodicPatternKeys, periodicPatternPercentage,
            avgAccessCount
        );
    }
}
