package com.flink.statebackend;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.CacheStatistics;
import com.flink.statebackend.model.StateValue;
import org.junit.*;
import org.rocksdb.RocksDBException;
import redis.clients.jedis.Jedis;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

import static org.junit.Assert.*;

public class HybridStateBackendTest {

    private HybridStateBackend stateBackend;
    private HybridStateBackendConfig config;
    private String testRocksDbPath;
    private static boolean redisAvailable = false;

    @BeforeClass
    public static void checkRedis() {
        try (Jedis jedis = new Jedis("localhost", 6379, 5000)) {
            jedis.ping();
            redisAvailable = true;
            System.out.println("Redis is available");
        } catch (Exception e) {
            System.out.println("Redis is not available, some tests will be skipped: " + e.getMessage());
        }
    }

    @Before
    public void setUp() throws Exception {
        testRocksDbPath = "/tmp/flink/test-rocksdb-" + UUID.randomUUID();
        config = new HybridStateBackendConfig();
        config.setRocksDbPath(testRocksDbPath);
        config.setRedisHost("localhost");
        config.setRedisPort(6379);
        config.setRedisDatabase(2);
        config.setHotDataTTL(Duration.ofMinutes(5));
        config.setHdfsCheckpointPath("file:///tmp/flink/test-checkpoints");
        config.setHdfsSnapshotPath("file:///tmp/flink/test-snapshots");

        stateBackend = new HybridStateBackend(config);
        stateBackend.initialize();
    }

    @After
    public void tearDown() {
        if (stateBackend != null) {
            stateBackend.close();
        }
        try {
            Files.walk(java.nio.file.Paths.get(testRocksDbPath))
                    .sorted(java.util.Comparator.reverseOrder())
                    .map(java.nio.file.Path::toFile)
                    .forEach(java.io.File::delete);
        } catch (IOException e) {
        }
    }

    @Test
    public void testPutAndGetState() throws RocksDBException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        String key = "test:user:1";
        byte[] value = "test-value".getBytes(StandardCharsets.UTF_8);

        stateBackend.put(key, value);

        StateValue result = stateBackend.get(key);
        assertNotNull(result);
        assertArrayEquals(value, result.getValue());
        assertTrue(result.getAccessCount() >= 1);
    }

    @Test
    public void testGetNonExistentKey() throws RocksDBException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        StateValue result = stateBackend.get("nonexistent:key");
        assertNull(result);
    }

    @Test
    public void testContainsKey() throws RocksDBException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        String key = "test:exists:check";
        byte[] value = "exists-value".getBytes(StandardCharsets.UTF_8);

        stateBackend.put(key, value);

        assertTrue(stateBackend.containsKey(key));
        assertFalse(stateBackend.containsKey("test:not:exists"));
    }

    @Test
    public void testDeleteState() throws RocksDBException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        String key = "test:delete:me";
        byte[] value = "delete-me".getBytes(StandardCharsets.UTF_8);

        stateBackend.put(key, value);
        assertTrue(stateBackend.containsKey(key));

        stateBackend.delete(key);
        assertFalse(stateBackend.containsKey(key));
    }

    @Test
    public void testCacheStatistics() throws RocksDBException, InterruptedException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        String key1 = "test:stats:1";
        String key2 = "test:stats:2";
        byte[] value = "value".getBytes(StandardCharsets.UTF_8);

        stateBackend.put(key1, value);

        Thread.sleep(100);

        StateValue result1 = stateBackend.get(key1);
        assertNotNull(result1);

        StateValue result2 = stateBackend.get(key2);
        assertNull(result2);

        CacheStatistics stats = stateBackend.getStatistics();
        assertTrue(stats.getRedisHits() >= 0);
        assertTrue(stats.getTotalWrites() >= 1);
    }

    @Test
    public void testTTLExpiration() throws RocksDBException, InterruptedException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        HybridStateBackendConfig shortTTLConfig = new HybridStateBackendConfig();
        shortTTLConfig.setRocksDbPath(testRocksDbPath + "-ttl");
        shortTTLConfig.setRedisHost("localhost");
        shortTTLConfig.setRedisPort(6379);
        shortTTLConfig.setRedisDatabase(3);
        shortTTLConfig.setHotDataTTL(Duration.ofSeconds(1));
        shortTTLConfig.setHdfsCheckpointPath("file:///tmp/flink/test-checkpoints-ttl");
        shortTTLConfig.setHdfsSnapshotPath("file:///tmp/flink/test-snapshots-ttl");

        HybridStateBackend shortTTLBackend = new HybridStateBackend(shortTTLConfig);
        shortTTLBackend.initialize();

        try {
            String key = "test:ttl:expire";
            byte[] value = "expire-me".getBytes(StandardCharsets.UTF_8);

            shortTTLBackend.put(key, value);
            assertNotNull(shortTTLBackend.get(key));

            Thread.sleep(2000);

            StateValue fromRocks = shortTTLBackend.getRocksDBManager().get(key);
            assertNotNull(fromRocks);
        } finally {
            shortTTLBackend.close();
        }
    }

    @Test
    public void testBatchOperations() throws RocksDBException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        java.util.Map<String, StateValue> batch = new java.util.HashMap<>();
        for (int i = 0; i < 10; i++) {
            String key = "test:batch:" + i;
            byte[] value = ("batch-value-" + i).getBytes(StandardCharsets.UTF_8);
            batch.put(key, new StateValue(value, config.getHotDataTTL().toMillis()));
        }

        stateBackend.putBatch(batch);

        for (int i = 0; i < 10; i++) {
            String key = "test:batch:" + i;
            StateValue value = stateBackend.get(key);
            assertNotNull("Key should exist: " + key, value);
        }
    }

    @Test
    public void testScanWithPrefix() throws RocksDBException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        for (int i = 0; i < 20; i++) {
            String prefix = i < 10 ? "test:scan:a:" : "test:scan:b:";
            String key = prefix + i;
            byte[] value = ("scan-value-" + i).getBytes(StandardCharsets.UTF_8);
            stateBackend.put(key, value);
        }

        java.util.Map<String, StateValue> results = stateBackend.scan("test:scan:a:", 15);
        assertEquals(10, results.size());

        for (String key : results.keySet()) {
            assertTrue(key.startsWith("test:scan:a:"));
        }
    }

    @Test
    public void testAccessCountTracking() throws RocksDBException, InterruptedException {
        Assume.assumeTrue("Redis not available", redisAvailable);

        String key = "test:access:count";
        byte[] value = "access-value".getBytes(StandardCharsets.UTF_8);

        stateBackend.put(key, value);

        for (int i = 0; i < 5; i++) {
            StateValue result = stateBackend.get(key);
            assertNotNull(result);
            Thread.sleep(10);
        }

        StateValue finalResult = stateBackend.getRocksDBManager().get(key);
        assertNotNull(finalResult);
        assertTrue(finalResult.getAccessCount() >= 5);
    }
}
