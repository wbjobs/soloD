package com.flink.statebackend.model;

import java.io.Serializable;
import java.util.Deque;
import java.util.LinkedList;
import java.util.concurrent.locks.ReentrantLock;

public class AccessPattern implements Serializable {

    private static final long serialVersionUID = 1L;
    private static final int MAX_HISTORY_SIZE = 24;
    private static final long MIN_CYCLE_MS = 3600000;      // 1小时
    private static final long MAX_CYCLE_MS = 86400000;     // 24小时

    private final Deque<Long> accessTimestamps;
    private final ReentrantLock lock = new ReentrantLock();
    private boolean hasPeriodicPattern = false;
    private long detectedCycleMs = 0;
    private long lastPredictedAccessTime = 0;
    private double patternConfidence = 0.0;
    private boolean alwaysHot = false;

    public AccessPattern() {
        this.accessTimestamps = new LinkedList<>();
    }

    public void recordAccess() {
        lock.lock();
        try {
            long now = System.currentTimeMillis();
            accessTimestamps.addLast(now);

            while (accessTimestamps.size() > MAX_HISTORY_SIZE) {
                accessTimestamps.removeFirst();
            }

            if (accessTimestamps.size() >= 4) {
                detectPeriodicPattern();
            }
        } finally {
            lock.unlock();
        }
    }

    private void detectPeriodicPattern() {
        if (accessTimestamps.size() < 4) {
            return;
        }

        Long[] timestamps = accessTimestamps.toArray(new Long[0]);
        long[] intervals = new long[timestamps.length - 1];

        for (int i = 0; i < intervals.length; i++) {
            intervals[i] = timestamps[i + 1] - timestamps[i];
        }

        double[] simplifiedFFT = simplifiedFFT(intervals);
        double dominantFreq = findDominantFrequency(simplifiedFFT);

        if (dominantFreq > 0) {
            long cycleMs = (long) (1.0 / dominantFreq * 1000);
            if (cycleMs >= MIN_CYCLE_MS && cycleMs <= MAX_CYCLE_MS) {
                double variance = calculateVariance(intervals);
                double mean = calculateMean(intervals);
                double cv = mean > 0 ? Math.sqrt(variance) / mean : Double.MAX_VALUE;

                if (cv < 0.3) {
                    hasPeriodicPattern = true;
                    detectedCycleMs = cycleMs;
                    patternConfidence = Math.max(0, 1.0 - cv * 2);
                }
            }
        }
    }

    private double[] simplifiedFFT(long[] intervals) {
        int n = intervals.length;
        double[] magnitudes = new double[n / 2 + 1];

        for (int k = 0; k < magnitudes.length; k++) {
            double real = 0;
            double imag = 0;

            for (int t = 0; t < n; t++) {
                double angle = 2 * Math.PI * k * t / n;
                real += intervals[t] * Math.cos(angle);
                imag -= intervals[t] * Math.sin(angle);
            }

            magnitudes[k] = Math.sqrt(real * real + imag * imag);
        }

        return magnitudes;
    }

    private double findDominantFrequency(double[] magnitudes) {
        if (magnitudes.length < 2) {
            return 0;
        }

        double maxMagnitude = 0;
        int dominantIndex = 1;

        for (int i = 1; i < magnitudes.length; i++) {
            if (magnitudes[i] > maxMagnitude) {
                maxMagnitude = magnitudes[i];
                dominantIndex = i;
            }
        }

        double totalEnergy = 0;
        for (double m : magnitudes) {
            totalEnergy += m;
        }

        if (totalEnergy > 0 && (magnitudes[dominantIndex] / totalEnergy) > 0.3) {
            return (double) dominantIndex / magnitudes.length;
        }

        return 0;
    }

    private double calculateMean(long[] values) {
        if (values.length == 0) return 0;
        double sum = 0;
        for (long v : values) sum += v;
        return sum / values.length;
    }

    private double calculateVariance(long[] values) {
        if (values.length == 0) return 0;
        double mean = calculateMean(values);
        double sumSq = 0;
        for (long v : values) {
            double diff = v - mean;
            sumSq += diff * diff;
        }
        return sumSq / values.length;
    }

    public Long predictNextAccessTime() {
        lock.lock();
        try {
            if (alwaysHot) {
                return System.currentTimeMillis();
            }

            if (!hasPeriodicPattern || detectedCycleMs == 0) {
                return null;
            }

            if (accessTimestamps.isEmpty()) {
                return null;
            }

            long lastAccess = accessTimestamps.getLast();
            long predicted = lastAccess + detectedCycleMs;
            lastPredictedAccessTime = predicted;
            return predicted;

        } finally {
            lock.unlock();
        }
    }

    public boolean shouldWarmUp(long warmUpTimeMs) {
        Long predictedTime = predictNextAccessTime();
        if (predictedTime == null) {
            return false;
        }

        long now = System.currentTimeMillis();
        long warmUpThreshold = predictedTime - warmUpTimeMs;
        return now >= warmUpThreshold && now <= predictedTime + warmUpTimeMs;
    }

    public boolean hasPeriodicPattern() {
        return hasPeriodicPattern;
    }

    public long getDetectedCycleMs() {
        return detectedCycleMs;
    }

    public double getPatternConfidence() {
        return patternConfidence;
    }

    public int getAccessHistorySize() {
        return accessTimestamps.size();
    }

    public boolean isAlwaysHot() {
        return alwaysHot;
    }

    public void setAlwaysHot(boolean alwaysHot) {
        this.alwaysHot = alwaysHot;
        if (alwaysHot) {
            this.hasPeriodicPattern = false;
        }
    }

    public long getLastAccessTime() {
        lock.lock();
        try {
            return accessTimestamps.isEmpty() ? 0 : accessTimestamps.getLast();
        } finally {
            lock.unlock();
        }
    }

    public long getLastPredictedAccessTime() {
        return lastPredictedAccessTime;
    }
}
