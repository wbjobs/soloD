package com.flink.statebackend.store;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.StateValue;
import com.flink.statebackend.util.StateSerializer;
import org.rocksdb.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.*;
import java.util.concurrent.locks.ReadWriteLock;
import java.util.concurrent.locks.ReentrantReadWriteLock;

public class RocksDBStoreManager implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(RocksDBStoreManager.class);

    static {
        RocksDB.loadLibrary();
    }

    private final HybridStateBackendConfig config;
    private RocksDB rocksDB;
    private Options options;
    private final ReadWriteLock rwLock = new ReentrantReadWriteLock();

    private final String dbPath;

    public RocksDBStoreManager(HybridStateBackendConfig config) {
        this.config = config;
        this.dbPath = config.getRocksDbPath() + File.separator + UUID.randomUUID();
    }

    public void initialize() throws RocksDBException {
        rwLock.writeLock().lock();
        try {
            File dbDir = new File(dbPath);
            if (!dbDir.exists()) {
                dbDir.mkdirs();
            }

            options = new Options()
                    .setCreateIfMissing(true)
                    .setIncreaseParallelism(Runtime.getRuntime().availableProcessors())
                    .setCompactionStyle(CompactionStyle.LEVEL)
                    .setLevelCompactionDynamicLevelBytes(true)
                    .setMaxBackgroundJobs(4)
                    .setWriteBufferSize(64 * 1024 * 1024)
                    .setMaxWriteBufferNumber(3)
                    .setMinWriteBufferNumberToMerge(2)
                    .setTargetFileSizeBase(64 * 1024 * 1024)
                    .setMaxBytesForLevelBase(512 * 1024 * 1024)
                    .setCompressionType(CompressionType.LZ4_COMPRESSION)
                    .setBottommostCompressionType(CompressionType.ZSTD_COMPRESSION);

            rocksDB = RocksDB.open(options, dbPath);
            LOG.info("RocksDB initialized at path: {}", dbPath);
        } finally {
            rwLock.writeLock().unlock();
        }
    }

    public void put(String key, StateValue value) throws RocksDBException {
        rwLock.writeLock().lock();
        try {
            byte[] keyBytes = StateSerializer.serializeKey(key);
            byte[] valueBytes = StateSerializer.serialize(value);
            rocksDB.put(keyBytes, valueBytes);
        } finally {
            rwLock.writeLock().unlock();
        }
    }

    public void putBatch(Map<String, StateValue> batch) throws RocksDBException {
        if (batch == null || batch.isEmpty()) {
            return;
        }

        rwLock.writeLock().lock();
        try (WriteOptions writeOptions = new WriteOptions();
             WriteBatch writeBatch = new WriteBatch()) {

            for (Map.Entry<String, StateValue> entry : batch.entrySet()) {
                byte[] keyBytes = StateSerializer.serializeKey(entry.getKey());
                byte[] valueBytes = StateSerializer.serialize(entry.getValue());
                writeBatch.put(keyBytes, valueBytes);
            }

            rocksDB.write(writeOptions, writeBatch);
        } finally {
            rwLock.writeLock().unlock();
        }
    }

    public StateValue get(String key) throws RocksDBException {
        rwLock.readLock().lock();
        try {
            byte[] keyBytes = StateSerializer.serializeKey(key);
            byte[] valueBytes = rocksDB.get(keyBytes);
            if (valueBytes == null) {
                return null;
            }
            return StateSerializer.deserialize(valueBytes);
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public boolean containsKey(String key) throws RocksDBException {
        rwLock.readLock().lock();
        try {
            byte[] keyBytes = StateSerializer.serializeKey(key);
            byte[] value = rocksDB.get(keyBytes);
            return value != null;
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public void delete(String key) throws RocksDBException {
        rwLock.writeLock().lock();
        try {
            byte[] keyBytes = StateSerializer.serializeKey(key);
            rocksDB.delete(keyBytes);
        } finally {
            rwLock.writeLock().unlock();
        }
    }

    public Map<String, StateValue> scan(String prefix, int limit) throws RocksDBException {
        rwLock.readLock().lock();
        Map<String, StateValue> results = new HashMap<>();
        try (ReadOptions readOptions = new ReadOptions();
             RocksIterator iterator = rocksDB.newIterator(readOptions)) {

            byte[] prefixBytes = StateSerializer.serializeKey(prefix);
            iterator.seek(prefixBytes);

            int count = 0;
            while (iterator.isValid() && count < limit) {
                byte[] keyBytes = iterator.key();
                String key = StateSerializer.deserializeKey(keyBytes);

                if (!key.startsWith(prefix)) {
                    break;
                }

                byte[] valueBytes = iterator.value();
                StateValue value = StateSerializer.deserialize(valueBytes);
                results.put(key, value);

                iterator.next();
                count++;
            }
        } finally {
            rwLock.readLock().unlock();
        }
        return results;
    }

    public List<String> getExpiredKeys(long cutoffTime) throws RocksDBException {
        List<String> expiredKeys = new ArrayList<>();
        rwLock.readLock().lock();
        try (ReadOptions readOptions = new ReadOptions();
             RocksIterator iterator = rocksDB.newIterator(readOptions)) {

            iterator.seekToFirst();
            while (iterator.isValid()) {
                byte[] keyBytes = iterator.key();
                byte[] valueBytes = iterator.value();

                try {
                    StateValue value = StateSerializer.deserialize(valueBytes);
                    if (value != null && value.isExpired()) {
                        String key = StateSerializer.deserializeKey(keyBytes);
                        expiredKeys.add(key);
                    }
                } catch (Exception e) {
                    LOG.warn("Failed to deserialize value for key, skipping", e);
                }

                iterator.next();
            }
        } finally {
            rwLock.readLock().unlock();
        }
        return expiredKeys;
    }

    public void cleanupExpiredData() throws RocksDBException {
        List<String> expiredKeys = getExpiredKeys(System.currentTimeMillis());
        if (!expiredKeys.isEmpty()) {
            rwLock.writeLock().lock();
            try (WriteBatch writeBatch = new WriteBatch();
                 WriteOptions writeOptions = new WriteOptions()) {

                for (String key : expiredKeys) {
                    byte[] keyBytes = StateSerializer.serializeKey(key);
                    writeBatch.delete(keyBytes);
                }
                rocksDB.write(writeOptions, writeBatch);
                LOG.info("Cleaned up {} expired keys from RocksDB", expiredKeys.size());
            } finally {
                rwLock.writeLock().unlock();
            }
        }
    }

    public long getApproximateKeyCount() throws RocksDBException {
        rwLock.readLock().lock();
        try {
            long[] sizes = rocksDB.getLongProperty("rocksdb.estimate-num-keys");
            return sizes.length > 0 ? sizes[0] : 0;
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public Snapshot createSnapshot() {
        rwLock.readLock().lock();
        try {
            return rocksDB.getSnapshot();
        } finally {
            rwLock.readLock().unlock();
        }
    }

    public void releaseSnapshot(Snapshot snapshot) {
        if (snapshot != null) {
            rocksDB.releaseSnapshot(snapshot);
        }
    }

    public String getDbPath() {
        return dbPath;
    }

    public RocksDB getRocksDB() {
        return rocksDB;
    }

    @Override
    public void close() {
        rwLock.writeLock().lock();
        try {
            if (rocksDB != null) {
                rocksDB.close();
                rocksDB = null;
                LOG.info("RocksDB closed");
            }
            if (options != null) {
                options.close();
                options = null;
            }
        } finally {
            rwLock.writeLock().unlock();
        }
    }
}
