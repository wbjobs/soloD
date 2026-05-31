package com.flink.statebackend;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.CacheStatistics;
import com.flink.statebackend.model.StateValue;
import org.junit.*;
import org.rocksdb.RocksDBException;
import redis.clients.jedis.Jedis;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.Assert.*;

public class HybridStateBackendResilienceTest {

    private HybridStateBackend stateBackend;
    private HybridStateBackendConfig config;
    private static boolean redisAvailable = false;

    @BeforeClass
    public static void checkRedis() {
        try (Jedis jedis = new Jedis("localhost", 6379, 5000)) {
            jedis.ping();
            redisAvailable = true;
            System.out.println("Redis is available for resilience tests");
        } catch (Exception e) {
            System.out.println("Redis is not available, skipping resilience tests: " + e.getMessage());
        }
    }

    @Before
    public void setUp() throws Exception {
        Assume.assumeTrue("Redis not available", redisAvailable);

        config = new HybridStateBackendConfig();
        config.setRocksDbPath("/tmp/flink/test-rocksdb-resilience-" + System.currentTimeMillis());
        config.setRedisHost("localhost");
        config.setRedisPort(6379);
        config.setRedisDatabase(5);
        config.setHotDataTTL(Duration.ofMinutes(5));

        config.setWriteBufferCapacity(1000);
        config.setBackPressureHighWaterMark(800);
        config.setBackPressureLowWaterMark(200);
        config.setBackPressureTimeoutMs(5000);

        config.setRedisMaxFailureCount(3);
        config.setRedisFailureRetryInterval(Duration.ofSeconds(5));
        config.setEnableDegradation(true);

        config.setEnableFailureQueue(true);
        config.setFailureQueueCapacity(10000);
        config.setEnableFailureReplay(true);
        config.setFailureReplayBatchSize(500);

        config.setRedisPipelineFlushInterval(Duration.ofMillis(10));
        config.setPipelineBatchSize(100);

        stateBackend = new HybridStateBackend(config);
        stateBackend.initialize();

        try (Jedis jedis = new Jedis("localhost", 6379)) {
            jedis.select(5);
            jedis.flushDB();
        }
    }

    @After
    public void tearDown() {
        if (stateBackend != null) {
            stateBackend.close();
        }
    }

    @Test
    public void testPutAndGetState() throws RocksDBException {
        String key = "test:resilience:key1";
        byte[] value = "test-value".getBytes(StandardCharsets.UTF_8);

        stateBackend.put(key, value);

        try {
            Thread.sleep(100);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        StateValue result = stateBackend.get(key);
        assertNotNull(result);
        assertArrayEquals(value, result.getValue());
    }

    @Test
    public void testHighThroughputWrites() throws RocksDBException, InterruptedException {
        int numWrites = 5000;
        CountDownLatch latch = new CountDownLatch(numWrites);
        ExecutorService executor = Executors.newFixedThreadPool(4);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failureCount = new AtomicInteger(0);

        long startTime = System.currentTimeMillis();

        for (int i = 0; i < numWrites; i++) {
            final int index = i;
            executor.submit(() -> {
                try {
                    String key = "test:highthroughput:" + index;
                    byte[] value = ("value-" + index).getBytes(StandardCharsets.UTF_8);
                    stateBackend.put(key, value);
                    successCount.incrementAndGet();
                } catch (Exception e) {
                    failureCount.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        boolean completed = latch.await(30, TimeUnit.SECONDS);
        long endTime = System.currentTimeMillis();

        executor.shutdown();

        System.out.println(String.format(
                "High throughput test: %d writes, %d successes, %d failures in %d ms (%.2f ops/sec)",
                numWrites, successCount.get(), failureCount.get(),
                endTime - startTime,
                successCount.get() * 1000.0 / (endTime - startTime)
        ));

        CacheStatistics stats = stateBackend.getStatistics();
        System.out.println(String.format(
                "Statistics: totalWrites=%d, redisSuccess=%d, redisFailures=%d, backPressureEvents=%d",
                stats.getTotalWrites(), stats.getRedisWriteSuccesses(), stats.getRedisWriteFailures(),
                stats.getBackPressureEvents()
        ));

        assertTrue("Should have successful writes", successCount.get() > 0);
    }

    @Test
    public void testWriteBufferMetrics() throws RocksDBException, InterruptedException {
        for (int i = 0; i < 100; i++) {
            String key = "test:buffer:" + i;
            byte[] value = ("value-" + i).getBytes(StandardCharsets.UTF_8);
            stateBackend.put(key, value);
        }

        Thread.sleep(500);

        int bufferSize = stateBackend.getWriteBufferSize();
        System.out.println("Write buffer size: " + bufferSize);

        CacheStatistics stats = stateBackend.getStatistics();
        assertEquals("Total writes should be 100", 100, stats.getTotalWrites());
    }

    @Test
    public void testFailureQueue() throws RocksDBException, InterruptedException {
        stateBackend.flush();
        Thread.sleep(100);

        int initialQueueSize = stateBackend.getFailureQueueSize();
        System.out.println("Initial failure queue size: " + initialQueueSize);

        for (int i = 0; i < 100; i++) {
            String key = "test:failure:" + i;
            byte[] value = ("value-" + i).getBytes(StandardCharsets.UTF_8);
            stateBackend.put(key, value);
        }

        Thread.sleep(1000);

        int queueSize = stateBackend.getFailureQueueSize();
        System.out.println("Failure queue size after writes: " + queueSize);

        CacheStatistics stats = stateBackend.getStatistics();
        System.out.println("Redis write failures: " + stats.getRedisWriteFailures());
        System.out.println("Redis write successes: " + stats.getRedisWriteSuccesses());
    }

    @Test
    public void testStatisticsMetrics() throws RocksDBException, InterruptedException {
        for (int i = 0; i < 100; i++) {
            String key = "test:stats:" + i;
            byte[] value = ("value-" + i).getBytes(StandardCharsets.UTF_8);
            stateBackend.put(key, value);
        }

        Thread.sleep(500);

        for (int i = 0; i < 50; i++) {
            String key = "test:stats:" + i;
            stateBackend.get(key);
        }

        CacheStatistics stats = stateBackend.getStatistics();
        System.out.println("Statistics: " + stats);

        assertTrue("Total writes should be at least 100", stats.getTotalWrites() >= 100);
        assertTrue("Redis hits should be at least 0", stats.getRedisHits() >= 0);
        assertTrue("Redis misses should be at least 0", stats.getRedisMisses() >= 0);
    }

    @Test
    public void testBatchWritePerformance() throws RocksDBException, InterruptedException {
        int batchSize = 1000;
        java.util.Map<String, StateValue> batch = new java.util.HashMap<>();

        for (int i = 0; i < batchSize; i++) {
            String key = "test:batch:" + i;
            byte[] value = ("value-" + i).getBytes(StandardCharsets.UTF_8);
            batch.put(key, new StateValue(value, config.getHotDataTTL().toMillis()));
        }

        long startTime = System.currentTimeMillis();
        stateBackend.putBatch(batch);
        long endTime = System.currentTimeMillis();

        Thread.sleep(500);

        System.out.println(String.format(
                "Batch write of %d entries took %d ms (%.2f ops/sec)",
                batchSize, endTime - startTime, batchSize * 1000.0 / (endTime - startTime)
        ));

        CacheStatistics stats = stateBackend.getStatistics();
        assertEquals("Total writes should match batch size", batchSize, stats.getTotalWrites());
    }

    @Test
    public void testReadWriteMixedWorkload() throws RocksDBException, InterruptedException {
        int numOperations = 1000;
        CountDownLatch latch = new CountDownLatch(numOperations);
        ExecutorService executor = Executors.newFixedThreadPool(4);

        for (int i = 0; i < numOperations; i++) {
            final int index = i;
            final boolean isWrite = index % 2 == 0;
            executor.submit(() -> {
                try {
                    String key = "test:mixed:" + (index % 100);
                    if (isWrite) {
                        byte[] value = ("value-" + index).getBytes(StandardCharsets.UTF_8);
                        stateBackend.put(key, value);
                    } else {
                        stateBackend.get(key);
                    }
                } catch (Exception e) {
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await(30, TimeUnit.SECONDS);
        executor.shutdown();

        CacheStatistics stats = stateBackend.getStatistics();
        System.out.println("Mixed workload statistics: " + stats);

        assertTrue("Should have some writes", stats.getTotalWrites() > 0);
    }

    @Test
    public void testDegradationStatus() throws RocksDBException, InterruptedException {
        boolean degraded = stateBackend.isDegraded();
        System.out.println("Initial degradation status: " + degraded);

        assertFalse("Should not be degraded initially", degraded);

        CacheStatistics stats = stateBackend.getStatistics();
        assertEquals("Should have 0 degradation events", 0, stats.getDegradationEvents());
    }

    @Test
    public void testFlushOperation() throws RocksDBException, InterruptedException {
        for (int i = 0; i < 50; i++) {
            String key = "test:flush:" + i;
            byte[] value = ("value-" + i).getBytes(StandardCharsets.UTF_8);
            stateBackend.put(key, value);
        }

        Thread.sleep(100);
        stateBackend.flush();

        int bufferSize = stateBackend.getWriteBufferSize();
        System.out.println("Buffer size after flush: " + bufferSize);
    }
}
