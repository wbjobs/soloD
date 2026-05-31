package com.flink.statebackend.store;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.CacheStatistics;
import com.flink.statebackend.model.FailedWriteEntry;
import com.flink.statebackend.model.StateValue;
import com.flink.statebackend.util.StateSerializer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import redis.clients.jedis.*;

import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.locks.Condition;
import java.util.concurrent.locks.ReentrantLock;

public class RedisCacheManager implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(RedisCacheManager.class);

    private final HybridStateBackendConfig config;
    private JedisPool jedisPool;
    private final long ttlMillis;
    private final String keyPrefix = "flink:state:";
    private final CacheStatistics statistics;

    private final ArrayBlockingQueue<Map.Entry<String, StateValue>> writeBuffer;
    private final ArrayBlockingQueue<FailedWriteEntry> failureQueue;
    private final ExecutorService writeExecutor;
    private final ScheduledExecutorService scheduledExecutor;
    private final AtomicBoolean running = new AtomicBoolean(true);

    private final ReentrantLock backPressureLock = new ReentrantLock();
    private final Condition backPressureCondition = backPressureLock.newCondition();
    private final AtomicBoolean backPressureActive = new AtomicBoolean(false);

    private final AtomicInteger consecutiveFailures = new AtomicInteger(0);
    private volatile boolean isDegraded = false;
    private volatile long lastDegradedTime = 0;
    private volatile long lastHealthCheckTime = 0;

    private final AtomicInteger pipelineBatchCount = new AtomicInteger(0);
    private volatile long lastPipelineFlushTime = 0;

    public RedisCacheManager(HybridStateBackendConfig config, CacheStatistics statistics) {
        this.config = config;
        this.statistics = statistics;
        this.ttlMillis = config.getHotDataTTL().toMillis();
        this.writeBuffer = new ArrayBlockingQueue<>(config.getWriteBufferCapacity());
        this.failureQueue = new ArrayBlockingQueue<>(config.getFailureQueueCapacity());

        this.writeExecutor = Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "redis-write-executor");
            t.setDaemon(true);
            return t;
        });

        this.scheduledExecutor = Executors.newScheduledThreadPool(2, r -> {
            Thread t = new Thread(r, "redis-scheduled-" + r.hashCode());
            t.setDaemon(true);
            return t;
        });
    }

    public void initialize() {
        JedisPoolConfig poolConfig = new JedisPoolConfig();
        poolConfig.setMaxTotal(config.getMaxRedisConnections());
        poolConfig.setMaxIdle(config.getMaxRedisConnections() / 2);
        poolConfig.setMinIdle(1);
        poolConfig.setTestOnBorrow(true);
        poolConfig.setTestOnReturn(true);
        poolConfig.setTestWhileIdle(true);
        poolConfig.setBlockWhenExhausted(true);
        poolConfig.setMaxWaitMillis(config.getConnectionTimeout().toMillis());

        String host = config.getRedisHost();
        int port = config.getRedisPort();
        int timeout = (int) config.getConnectionTimeout().toMillis();
        String password = config.getRedisPassword();
        int database = config.getRedisDatabase();

        if (password != null && !password.isEmpty()) {
            this.jedisPool = new JedisPool(poolConfig, host, port, timeout, password, database);
        } else {
            this.jedisPool = new JedisPool(poolConfig, host, port, timeout, null, database);
        }

        LOG.info("Redis pool initialized: {}:{}, database: {}", host, port, database);

        writeExecutor.submit(this::processWriteQueueWithPipeline);

        scheduledExecutor.scheduleAtFixedRate(
                this::periodicPipelineFlush,
                config.getRedisPipelineFlushInterval().toMillis(),
                config.getRedisPipelineFlushInterval().toMillis(),
                TimeUnit.MILLISECONDS
        );

        scheduledExecutor.scheduleAtFixedRate(
                this::healthCheckAndRecovery,
                config.getRedisFailureRetryInterval().toMillis(),
                config.getRedisFailureRetryInterval().toMillis(),
                TimeUnit.MILLISECONDS
        );

        if (config.isEnableFailureReplay()) {
            scheduledExecutor.scheduleAtFixedRate(
                    this::replayFailureQueue,
                    10000,
                    5000,
                    TimeUnit.MILLISECONDS
            );
        }

        LOG.info("RedisCacheManager initialized with back pressure, pipeline, degradation and failure recovery");
    }

    private void processWriteQueueWithPipeline() {
        List<Map.Entry<String, StateValue>> batch = new ArrayList<>(config.getPipelineBatchSize());

        while (running.get() || !writeBuffer.isEmpty()) {
            try {
                checkBackPressure();

                Map.Entry<String, StateValue> entry = writeBuffer.poll(10, TimeUnit.MILLISECONDS);
                if (entry != null) {
                    batch.add(entry);
                    pipelineBatchCount.incrementAndGet();
                }

                boolean shouldFlush = batch.size() >= config.getPipelineBatchSize() ||
                        (System.currentTimeMillis() - lastPipelineFlushTime >= config.getRedisPipelineFlushInterval().toMillis());

                if (shouldFlush && !batch.isEmpty()) {
                    if (!isDegraded) {
                        executePipelineWrite(batch);
                    } else {
                        moveBatchToFailureQueue(batch, "System is degraded");
                    }
                    batch.clear();
                    pipelineBatchCount.set(0);
                    lastPipelineFlushTime = System.currentTimeMillis();
                }

            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                LOG.warn("Write queue processor interrupted");
                break;
            } catch (Exception e) {
                LOG.error("Error processing write queue with pipeline", e);
            }
        }

        if (!batch.isEmpty()) {
            if (!isDegraded) {
                executePipelineWrite(batch);
            } else {
                moveBatchToFailureQueue(batch, "System shutdown with degradation");
            }
        }
    }

    private void executePipelineWrite(List<Map.Entry<String, StateValue>> batch) {
        if (batch.isEmpty()) {
            return;
        }

        try (Jedis jedis = jedisPool.getResource()) {
            Pipeline pipeline = jedis.pipelined();
            int ttlSeconds = (int) (ttlMillis / 1000);

            for (Map.Entry<String, StateValue> entry : batch) {
                String redisKey = getRedisKey(entry.getKey());
                byte[] valueBytes = StateSerializer.serialize(entry.getValue());
                pipeline.setex(redisKey.getBytes(), ttlSeconds, valueBytes);
            }

            pipeline.sync();

            consecutiveFailures.set(0);
            statistics.recordRedisWriteSuccess();
            statistics.recordRedisWriteSuccess();

            if (isDegraded && config.isEnableDegradation()) {
                attemptRecovery();
            }

        } catch (Exception e) {
            LOG.error("Failed to execute pipeline write with {} entries", batch.size(), e);
            handlePipelineFailure(batch, e);
        }
    }

    private void handlePipelineFailure(List<Map.Entry<String, StateValue>> batch, Exception e) {
        int failures = consecutiveFailures.incrementAndGet();
        statistics.recordRedisWriteFailure();

        if (config.isEnableFailureQueue()) {
            moveBatchToFailureQueue(batch, e.getMessage());
        }

        if (failures >= config.getRedisMaxFailureCount() && !isDegraded && config.isEnableDegradation()) {
            enterDegradedMode();
        }
    }

    private void moveBatchToFailureQueue(List<Map.Entry<String, StateValue>> batch, String reason) {
        if (!config.isEnableFailureQueue()) {
            return;
        }

        for (Map.Entry<String, StateValue> entry : batch) {
            FailedWriteEntry failedEntry = new FailedWriteEntry(entry.getKey(), entry.getValue(), reason);
            if (!failureQueue.offer(failedEntry)) {
                LOG.warn("Failure queue is full, dropping failed write for key: {}", entry.getKey());
            }
        }
        statistics.setFailureQueueSize(failureQueue.size());
        LOG.debug("Moved {} entries to failure queue, reason: {}", batch.size(), reason);
    }

    private void enterDegradedMode() {
        isDegraded = true;
        lastDegradedTime = System.currentTimeMillis();
        statistics.recordDegradation();
        LOG.warn("Entering degraded mode after {} consecutive failures. " +
                "Redis writes will be queued locally.", consecutiveFailures.get());
    }

    private void attemptRecovery() {
        if (!isDegraded) {
            return;
        }

        long timeSinceDegraded = System.currentTimeMillis() - lastDegradedTime;
        if (timeSinceDegraded < config.getRedisFailureRetryInterval().toMillis()) {
            return;
        }

        try (Jedis jedis = jedisPool.getResource()) {
            String response = jedis.ping();
            if ("PONG".equals(response)) {
                isDegraded = false;
                consecutiveFailures.set(0);
                statistics.recordRecovery();
                LOG.info("Redis connection recovered, exiting degraded mode after {} ms", timeSinceDegraded);

                if (config.isEnableFailureReplay() && !failureQueue.isEmpty()) {
                    scheduledExecutor.submit(this::replayFailureQueue);
                }
            }
        } catch (Exception e) {
            LOG.debug("Recovery attempt failed, still in degraded mode", e);
        }
    }

    private void healthCheckAndRecovery() {
        if (!running.get()) {
            return;
        }

        lastHealthCheckTime = System.currentTimeMillis();

        if (isDegraded) {
            attemptRecovery();
        }

        statistics.setFailureQueueSize(failureQueue.size());
    }

    private void replayFailureQueue() {
        if (!running.get() || isDegraded || failureQueue.isEmpty()) {
            return;
        }

        int replayCount = 0;
        List<FailedWriteEntry> toRetry = new ArrayList<>(config.getFailureReplayBatchSize());

        failureQueue.drainTo(toRetry, config.getFailureReplayBatchSize());

        if (toRetry.isEmpty()) {
            return;
        }

        List<Map.Entry<String, StateValue>> pipelineBatch = new ArrayList<>();
        List<FailedWriteEntry> failedAgain = new ArrayList<>();

        for (FailedWriteEntry entry : toRetry) {
            entry.incrementRetryCount();
            pipelineBatch.add(new AbstractMap.SimpleEntry<>(entry.getKey(), entry.getStateValue()));
        }

        try (Jedis jedis = jedisPool.getResource()) {
            Pipeline pipeline = jedis.pipelined();
            int ttlSeconds = (int) (ttlMillis / 1000);

            for (Map.Entry<String, StateValue> entry : pipelineBatch) {
                String redisKey = getRedisKey(entry.getKey());
                byte[] valueBytes = StateSerializer.serialize(entry.getValue());
                pipeline.setex(redisKey.getBytes(), ttlSeconds, valueBytes);
            }

            pipeline.sync();
            replayCount = pipelineBatch.size();
            statistics.recordFailureReplay(replayCount);
            LOG.info("Successfully replayed {} entries from failure queue", replayCount);

        } catch (Exception e) {
            LOG.error("Failed to replay failure queue entries", e);
            for (FailedWriteEntry entry : toRetry) {
                if (!failureQueue.offer(entry)) {
                    LOG.warn("Failure queue full during replay, dropping entry: {}", entry.getKey());
                }
            }
        }

        statistics.setFailureQueueSize(failureQueue.size());
    }

    private void periodicPipelineFlush() {
        if (writeBuffer.isEmpty() || isDegraded) {
            return;
        }

        long timeSinceLastFlush = System.currentTimeMillis() - lastPipelineFlushTime;
        if (timeSinceLastFlush >= config.getRedisPipelineFlushInterval().toMillis()) {
            List<Map.Entry<String, StateValue>> batch = new ArrayList<>();
            writeBuffer.drainTo(batch, config.getPipelineBatchSize());
            if (!batch.isEmpty()) {
                if (!isDegraded) {
                    executePipelineWrite(batch);
                } else {
                    moveBatchToFailureQueue(batch, "Periodic flush during degradation");
                }
                pipelineBatchCount.addAndGet(-batch.size());
                lastPipelineFlushTime = System.currentTimeMillis();
            }
        }
    }

    private void checkBackPressure() {
        int currentSize = writeBuffer.size();
        int highWaterMark = config.getBackPressureHighWaterMark();
        int lowWaterMark = config.getBackPressureLowWaterMark();

        if (currentSize >= highWaterMark && !backPressureActive.get()) {
            backPressureActive.set(true);
            LOG.warn("Back pressure activated: write buffer size {} >= high water mark {}",
                    currentSize, highWaterMark);
        } else if (currentSize <= lowWaterMark && backPressureActive.get()) {
            backPressureActive.set(false);
            backPressureLock.lock();
            try {
                backPressureCondition.signalAll();
            } finally {
                backPressureLock.unlock();
            }
            LOG.info("Back pressure deactivated: write buffer size {} <= low water mark {}",
                    currentSize, lowWaterMark);
        }
    }

    public void putAsync(String key, StateValue value) throws InterruptedException, TimeoutException {
        Map.Entry<String, StateValue> entry = new AbstractMap.SimpleEntry<>(key, value);

        if (backPressureActive.get()) {
            long startTime = System.currentTimeMillis();
            backPressureLock.lock();
            try {
                while (backPressureActive.get() && running.get()) {
                    boolean signaled = backPressureCondition.await(
                            config.getBackPressureTimeoutMs(), TimeUnit.MILLISECONDS
                    );
                    long waited = System.currentTimeMillis() - startTime;
                    if (waited >= config.getBackPressureTimeoutMs()) {
                        statistics.recordBackPressure(waited);
                        throw new TimeoutException(
                                String.format("Back pressure timeout after %d ms, buffer size: %d",
                                        waited, writeBuffer.size())
                        );
                    }
                }
                long waited = System.currentTimeMillis() - startTime;
                if (waited > 0) {
                    statistics.recordBackPressure(waited);
                }
            } finally {
                backPressureLock.unlock();
            }
        }

        if (!writeBuffer.offer(entry, config.getBackPressureTimeoutMs(), TimeUnit.MILLISECONDS)) {
            if (config.isEnableFailureQueue()) {
                FailedWriteEntry failedEntry = new FailedWriteEntry(key, value, "Write buffer full");
                if (!failureQueue.offer(failedEntry)) {
                    LOG.warn("Write buffer and failure queue both full, dropping key: {}", key);
                }
            }
            throw new RejectedExecutionException(
                    String.format("Write buffer full (size: %d), rejected write for key: %s",
                            writeBuffer.size(), key)
            );
        }

        checkBackPressure();
    }

    public void putSync(String key, StateValue value) {
        if (isDegraded) {
            if (config.isEnableFailureQueue()) {
                FailedWriteEntry failedEntry = new FailedWriteEntry(key, value, "Degraded mode sync write");
                if (!failureQueue.offer(failedEntry)) {
                    LOG.warn("Failure queue full during sync write, dropping key: {}", key);
                }
            }
            return;
        }

        String redisKey = getRedisKey(key);
        try (Jedis jedis = jedisPool.getResource()) {
            byte[] valueBytes = StateSerializer.serialize(value);
            int ttlSeconds = (int) (ttlMillis / 1000);
            jedis.setex(redisKey.getBytes(), ttlSeconds, valueBytes);
            consecutiveFailures.set(0);
            statistics.recordRedisWriteSuccess();
        } catch (Exception e) {
            LOG.error("Failed to sync put to Redis: {}", key, e);
            consecutiveFailures.incrementAndGet();
            statistics.recordRedisWriteFailure();

            if (config.isEnableFailureQueue()) {
                FailedWriteEntry failedEntry = new FailedWriteEntry(key, value, e.getMessage());
                if (!failureQueue.offer(failedEntry)) {
                    LOG.warn("Failure queue full, dropping failed sync write for key: {}", key);
                }
            }

            if (consecutiveFailures.get() >= config.getRedisMaxFailureCount()
                    && !isDegraded && config.isEnableDegradation()) {
                enterDegradedMode();
            }
        }
    }

    public StateValue get(String key) {
        if (isDegraded) {
            return null;
        }

        String redisKey = getRedisKey(key);
        try (Jedis jedis = jedisPool.getResource()) {
            byte[] valueBytes = jedis.get(redisKey.getBytes());
            if (valueBytes == null) {
                return null;
            }
            return StateSerializer.deserialize(valueBytes);
        } catch (Exception e) {
            LOG.error("Failed to get key from Redis: {}", key, e);
            return null;
        }
    }

    public void refreshTTL(String key) {
        if (isDegraded) {
            return;
        }

        String redisKey = getRedisKey(key);
        try (Jedis jedis = jedisPool.getResource()) {
            int ttlSeconds = (int) (ttlMillis / 1000);
            jedis.expire(redisKey, ttlSeconds);
        } catch (Exception e) {
            LOG.error("Failed to refresh TTL for key: {}", key, e);
        }
    }

    public void delete(String key) {
        String redisKey = getRedisKey(key);
        try (Jedis jedis = jedisPool.getResource()) {
            jedis.del(redisKey);
        } catch (Exception e) {
            LOG.error("Failed to delete key from Redis: {}", key, e);
        }
    }

    public boolean exists(String key) {
        if (isDegraded) {
            return false;
        }

        String redisKey = getRedisKey(key);
        try (Jedis jedis = jedisPool.getResource()) {
            return jedis.exists(redisKey);
        } catch (Exception e) {
            LOG.error("Failed to check key existence in Redis: {}", key, e);
            return false;
        }
    }

    public Map<String, StateValue> getAllHotData() {
        Map<String, StateValue> result = new HashMap<>();
        if (isDegraded) {
            return result;
        }

        String pattern = getRedisKey("*");
        try (Jedis jedis = jedisPool.getResource()) {
            Set<String> keys = jedis.keys(pattern);
            if (keys.isEmpty()) {
                return result;
            }

            Pipeline pipeline = jedis.pipelined();
            List<Response<byte[]>> responses = new ArrayList<>();
            List<String> keyList = new ArrayList<>(keys);

            for (String key : keyList) {
                responses.add(pipeline.get(key.getBytes()));
            }

            pipeline.sync();

            for (int i = 0; i < keyList.size(); i++) {
                byte[] valueBytes = responses.get(i).get();
                if (valueBytes != null) {
                    String originalKey = extractOriginalKey(keyList.get(i));
                    StateValue stateValue = StateSerializer.deserialize(valueBytes);
                    if (stateValue != null) {
                        result.put(originalKey, stateValue);
                    }
                }
            }
        } catch (Exception e) {
            LOG.error("Failed to get all hot data from Redis", e);
        }

        return result;
    }

    public long getHotDataCount() {
        if (isDegraded) {
            return 0;
        }

        String pattern = getRedisKey("*");
        try (Jedis jedis = jedisPool.getResource()) {
            Set<String> keys = jedis.keys(pattern);
            return keys.size();
        } catch (Exception e) {
            LOG.error("Failed to get hot data count from Redis", e);
            return 0;
        }
    }

    public void flush() {
        List<Map.Entry<String, StateValue>> batch = new ArrayList<>();
        writeBuffer.drainTo(batch);
        if (!batch.isEmpty()) {
            if (!isDegraded) {
                executePipelineWrite(batch);
            } else {
                moveBatchToFailureQueue(batch, "Manual flush during degradation");
            }
        }
    }

    private String getRedisKey(String key) {
        return keyPrefix + key;
    }

    private String extractOriginalKey(String redisKey) {
        return redisKey.substring(keyPrefix.length());
    }

    public int getWriteBufferSize() {
        return writeBuffer.size();
    }

    public int getFailureQueueSize() {
        return failureQueue.size();
    }

    public boolean isDegraded() {
        return isDegraded;
    }

    public int getConsecutiveFailures() {
        return consecutiveFailures.get();
    }

    @Override
    public void close() {
        running.set(false);

        backPressureLock.lock();
        try {
            backPressureCondition.signalAll();
        } finally {
            backPressureLock.unlock();
        }

        scheduledExecutor.shutdown();
        try {
            if (!scheduledExecutor.awaitTermination(10, TimeUnit.SECONDS)) {
                scheduledExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            scheduledExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }

        writeExecutor.shutdown();
        try {
            if (!writeExecutor.awaitTermination(15, TimeUnit.SECONDS)) {
                writeExecutor.shutdownNow();
            }
        } catch (InterruptedException e) {
            writeExecutor.shutdownNow();
            Thread.currentThread().interrupt();
        }

        flush();

        if (!failureQueue.isEmpty()) {
            LOG.warn("Closing with {} entries still in failure queue", failureQueue.size());
        }

        if (jedisPool != null) {
            jedisPool.close();
            jedisPool = null;
            LOG.info("Redis pool closed");
        }
    }
}
