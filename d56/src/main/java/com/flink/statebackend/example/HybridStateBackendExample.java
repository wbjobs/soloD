package com.flink.statebackend.example;

import com.flink.statebackend.HybridStateBackend;
import com.flink.statebackend.HybridStateBackendFunction;
import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.CacheStatistics;
import com.flink.statebackend.model.StateValue;
import org.apache.flink.api.common.functions.MapFunction;
import org.apache.flink.api.java.tuple.Tuple2;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.rocksdb.RocksDBException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

public class HybridStateBackendExample {

    private static final Logger LOG = LoggerFactory.getLogger(HybridStateBackendExample.class);

    public static void main(String[] args) throws Exception {
        StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

        env.enableCheckpointing(5000);
        env.getCheckpointConfig().setCheckpointTimeout(60000);

        HybridStateBackendConfig config = createConfig();

        DataStream<String> input = env.socketTextStream("localhost", 9999);

        DataStream<Tuple2<String, Long>> processed = input
                .map(new UserActivityProcessor(config))
                .setParallelism(2);

        processed.print();

        env.execute("Hybrid State Backend Example");
    }

    private static HybridStateBackendConfig createConfig() {
        HybridStateBackendConfig config = new HybridStateBackendConfig();

        config.setRocksDbPath("/tmp/flink/rocksdb-example");
        config.setRedisHost("localhost");
        config.setRedisPort(6379);
        config.setRedisDatabase(1);

        config.setHotDataTTL(Duration.ofMinutes(5));
        config.setHotDataRatioThreshold(0.3);
        config.setRedisBatchSize(100);
        config.setRedisBatchInterval(Duration.ofMillis(100));

        config.setHdfsCheckpointPath("file:///tmp/flink/checkpoints-example");
        config.setHdfsSnapshotPath("file:///tmp/flink/snapshots-example");

        config.setMaxRedisConnections(8);
        config.setConnectionTimeout(Duration.ofSeconds(5));
        config.setSocketTimeout(Duration.ofSeconds(5));

        config.setEnableAutoTuning(true);
        config.setTuningInterval(Duration.ofMinutes(1));
        config.setTargetCacheHitRate(0.85);

        return config;
    }

    public static class UserActivityProcessor
            extends HybridStateBackendFunction<String, Tuple2<String, Long>>
            implements MapFunction<String, Tuple2<String, Long>> {

        private static final long serialVersionUID = 1L;

        public UserActivityProcessor(HybridStateBackendConfig config) {
            super(config);
        }

        @Override
        public Tuple2<String, Long> map(String input) throws Exception {
            String[] parts = input.split(",");
            if (parts.length < 2) {
                LOG.warn("Invalid input format: {}", input);
                return Tuple2.of("invalid", 0L);
            }

            String userId = parts[0].trim();
            long timestamp = Long.parseLong(parts[1].trim());

            long activityCount = updateUserActivity(userId, timestamp);

            logStatistics(userId);

            return Tuple2.of(userId, activityCount);
        }

        private long updateUserActivity(String userId, long timestamp) throws RocksDBException {
            String key = "user:" + userId + ":activity";

            StateValue stateValue = getState(key);
            long count = 1;

            if (stateValue != null) {
                byte[] value = stateValue.getValue();
                if (value != null) {
                    count = Long.parseLong(new String(value, StandardCharsets.UTF_8)) + 1;
                }
            }

            byte[] newValue = String.valueOf(count).getBytes(StandardCharsets.UTF_8);
            putState(key, newValue);

            return count;
        }

        private void logStatistics(String userId) {
            CacheStatistics stats = stateBackend.getStatistics();
            if (userId.hashCode() % 100 == 0) {
                LOG.info("Cache Statistics - Hit Rate: {:.2f}%, Redis Hits: {}, " +
                                "RocksDB Hits: {}, Total Writes: {}, Hot Keys: {}",
                        stats.getRedisHitRate() * 100,
                        stats.getRedisHits(),
                        stats.getRocksdbHits(),
                        stats.getTotalWrites(),
                        stats.getHotDataCount());
            }
        }
    }
}
