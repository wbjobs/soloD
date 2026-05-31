package com.flink.statebackend.model;

import java.io.Serializable;

public class FailedWriteEntry implements Serializable {

    private static final long serialVersionUID = 1L;

    private String key;
    private StateValue stateValue;
    private long failedTimestamp;
    private int retryCount;
    private String failureReason;

    public FailedWriteEntry() {
    }

    public FailedWriteEntry(String key, StateValue stateValue, String failureReason) {
        this.key = key;
        this.stateValue = stateValue;
        this.failedTimestamp = System.currentTimeMillis();
        this.retryCount = 0;
        this.failureReason = failureReason;
    }

    public String getKey() {
        return key;
    }

    public void setKey(String key) {
        this.key = key;
    }

    public StateValue getStateValue() {
        return stateValue;
    }

    public void setStateValue(StateValue stateValue) {
        this.stateValue = stateValue;
    }

    public long getFailedTimestamp() {
        return failedTimestamp;
    }

    public void setFailedTimestamp(long failedTimestamp) {
        this.failedTimestamp = failedTimestamp;
    }

    public int getRetryCount() {
        return retryCount;
    }

    public void setRetryCount(int retryCount) {
        this.retryCount = retryCount;
    }

    public void incrementRetryCount() {
        this.retryCount++;
    }

    public String getFailureReason() {
        return failureReason;
    }

    public void setFailureReason(String failureReason) {
        this.failureReason = failureReason;
    }

    public long getAgeMillis() {
        return System.currentTimeMillis() - failedTimestamp;
    }

    @Override
    public String toString() {
        return String.format(
                "FailedWriteEntry{key='%s', failedTimestamp=%d, retryCount=%d, reason='%s'}",
                key, failedTimestamp, retryCount, failureReason
        );
    }
}
