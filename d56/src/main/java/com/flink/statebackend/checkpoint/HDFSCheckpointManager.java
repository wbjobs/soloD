package com.flink.statebackend.checkpoint;

import com.flink.statebackend.config.HybridStateBackendConfig;
import com.flink.statebackend.model.StateValue;
import com.flink.statebackend.util.StateSerializer;
import org.apache.hadoop.conf.Configuration;
import org.apache.hadoop.fs.FileSystem;
import org.apache.hadoop.fs.Path;
import org.rocksdb.Checkpoint;
import org.rocksdb.RocksDB;
import org.rocksdb.RocksDBException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.net.URI;
import java.util.Map;

public class HDFSCheckpointManager implements AutoCloseable {

    private static final Logger LOG = LoggerFactory.getLogger(HDFSCheckpointManager.class);

    private final HybridStateBackendConfig config;
    private FileSystem hdfs;
    private final String checkpointBasePath;
    private final String snapshotBasePath;

    public HDFSCheckpointManager(HybridStateBackendConfig config) throws IOException {
        this.config = config;
        this.checkpointBasePath = config.getHdfsCheckpointPath();
        this.snapshotBasePath = config.getHdfsSnapshotPath();
        initializeHDFS();
    }

    private void initializeHDFS() throws IOException {
        Configuration conf = new Configuration();
        conf.set("fs.hdfs.impl", org.apache.hadoop.hdfs.DistributedFileSystem.class.getName());
        conf.set("fs.file.impl", org.apache.hadoop.fs.LocalFileSystem.class.getName());

        URI hdfsUri = URI.create(checkpointBasePath);
        this.hdfs = FileSystem.get(hdfsUri, conf);

        Path checkpointPath = new Path(checkpointBasePath);
        Path snapshotPath = new Path(snapshotBasePath);

        if (!hdfs.exists(checkpointPath)) {
            hdfs.mkdirs(checkpointPath);
        }
        if (!hdfs.exists(snapshotPath)) {
            hdfs.mkdirs(snapshotPath);
        }

        LOG.info("HDFS Checkpoint Manager initialized. Checkpoint path: {}, Snapshot path: {}",
                checkpointBasePath, snapshotBasePath);
    }

    public CheckpointSnapshot createCheckpoint(long checkpointId,
                                               String operatorName,
                                               int subtaskIndex,
                                               RocksDB rocksDB,
                                               Map<String, StateValue> hotData)
            throws RocksDBException, IOException {

        CheckpointSnapshot snapshot = new CheckpointSnapshot(checkpointId, operatorName, subtaskIndex);

        String checkpointDir = String.format("%s/chk-%d/%s_%d",
                checkpointBasePath, checkpointId, operatorName, subtaskIndex);
        Path checkpointPath = new Path(checkpointDir);

        if (!hdfs.exists(checkpointPath)) {
            hdfs.mkdirs(checkpointPath);
        }

        String localRocksDBCheckpointPath = config.getRocksDbPath() +
                "/checkpoint/" + checkpointId + "_" + operatorName + "_" + subtaskIndex;

        Path localCheckpointPath = new Path(localRocksDBCheckpointPath);
        java.nio.file.Path localPath = java.nio.file.Paths.get(localRocksDBCheckpointPath);
        if (!java.nio.file.Files.exists(localPath.getParent())) {
            java.nio.file.Files.createDirectories(localPath.getParent());
        }

        try (Checkpoint rocksDBCheckpoint = Checkpoint.create(rocksDB)) {
            rocksDBCheckpoint.createCheckpoint(localRocksDBCheckpointPath);
            LOG.info("RocksDB checkpoint created locally: {}", localRocksDBCheckpointPath);
        }

        Path hdfsRocksDBPath = new Path(checkpointDir + "/rocksdb");
        copyToHDFS(localRocksDBCheckpointPath, hdfsRocksDBPath.toString());
        snapshot.setRocksDBSnapshotPath(hdfsRocksDBPath.toString());
        LOG.info("RocksDB checkpoint uploaded to HDFS: {}", hdfsRocksDBPath);

        String hotDataPath = checkpointDir + "/hotdata.snapshot";
        saveHotDataToHDFS(hotData, hotDataPath);
        snapshot.setHotDataSnapshot(hotData);

        snapshot.setHotKeys(hotData.size());

        snapshot.setTimestamp(System.currentTimeMillis());

        LOG.info("Checkpoint {} created successfully: {}", checkpointId, snapshot);

        deleteLocalDirectory(new File(localRocksDBCheckpointPath));

        return snapshot;
    }

    private void saveHotDataToHDFS(Map<String, StateValue> hotData, String hdfsPath) throws IOException {
        Path path = new Path(hdfsPath);
        try (OutputStream os = hdfs.create(path, true);
             ObjectOutputStream oos = new ObjectOutputStream(os)) {

            oos.writeInt(hotData.size());
            for (Map.Entry<String, StateValue> entry : hotData.entrySet()) {
                oos.writeUTF(entry.getKey());
                byte[] serializedValue = StateSerializer.serialize(entry.getValue());
                oos.writeInt(serializedValue.length);
                oos.write(serializedValue);
            }

            oos.flush();
        }

        LOG.info("Hot data snapshot saved to HDFS: {}, size: {}", hdfsPath, hotData.size());
    }

    public Map<String, StateValue> loadHotDataFromHDFS(String hdfsPath) throws IOException {
        Path path = new Path(hdfsPath);
        if (!hdfs.exists(path)) {
            throw new FileNotFoundException("Hot data snapshot not found: " + hdfsPath);
        }

        try (InputStream is = hdfs.open(path);
             ObjectInputStream ois = new ObjectInputStream(is)) {

            int size = ois.readInt();
            Map<String, StateValue> hotData = new java.util.HashMap<>();

            for (int i = 0; i < size; i++) {
                String key = ois.readUTF();
                int valueLength = ois.readInt();
                byte[] valueBytes = new byte[valueLength];
                ois.readFully(valueBytes);

                StateValue stateValue = StateSerializer.deserialize(valueBytes);
                hotData.put(key, stateValue);
            }

            LOG.info("Hot data snapshot loaded from HDFS: {}, size: {}", hdfsPath, hotData.size());
            return hotData;
        }
    }

    public void restoreRocksDBCheckpoint(String hdfsPath, String localPath) throws IOException {
        Path hdfsSourcePath = new Path(hdfsPath);
        if (!hdfs.exists(hdfsSourcePath)) {
            throw new FileNotFoundException("RocksDB checkpoint not found: " + hdfsPath);
        }

        File localDir = new File(localPath);
        if (!localDir.exists()) {
            localDir.mkdirs();
        }

        copyFromHDFS(hdfsPath, localPath);
        LOG.info("RocksDB checkpoint restored from HDFS to: {}", localPath);
    }

    public CheckpointSnapshot loadCheckpointSnapshot(String checkpointPath) throws IOException, ClassNotFoundException {
        Path snapshotFile = new Path(checkpointPath + "/snapshot.metadata");
        if (!hdfs.exists(snapshotFile)) {
            throw new FileNotFoundException("Checkpoint metadata not found: " + snapshotFile);
        }

        try (InputStream is = hdfs.open(snapshotFile);
             ObjectInputStream ois = new ObjectInputStream(is)) {

            CheckpointSnapshot snapshot = (CheckpointSnapshot) ois.readObject();
            LOG.info("Checkpoint snapshot loaded: {}", snapshot);
            return snapshot;
        }
    }

    public void saveCheckpointMetadata(CheckpointSnapshot snapshot) throws IOException {
        String checkpointDir = String.format("%s/chk-%d/%s_%d",
                checkpointBasePath, snapshot.getCheckpointId(),
                snapshot.getOperatorName(), snapshot.getSubtaskIndex());

        Path metadataPath = new Path(checkpointDir + "/snapshot.metadata");
        try (OutputStream os = hdfs.create(metadataPath, true);
             ObjectOutputStream oos = new ObjectOutputStream(os)) {

            oos.writeObject(snapshot);
            oos.flush();
        }

        LOG.info("Checkpoint metadata saved: {}", metadataPath);
    }

    private void copyToHDFS(String localPath, String hdfsPath) throws IOException {
        Path srcPath = new Path(localPath);
        Path dstPath = new Path(hdfsPath);

        File localFile = new File(localPath);
        if (localFile.isDirectory()) {
            hdfs.mkdirs(dstPath);
            File[] files = localFile.listFiles();
            if (files != null) {
                for (File file : files) {
                    copyToHDFS(file.getAbsolutePath(), hdfsPath + "/" + file.getName());
                }
            }
        } else {
            try (InputStream is = new FileInputStream(localPath);
                 OutputStream os = hdfs.create(dstPath, true)) {

                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = is.read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
            }
        }
    }

    private void copyFromHDFS(String hdfsPath, String localPath) throws IOException {
        Path srcPath = new Path(hdfsPath);
        File dstFile = new File(localPath);

        org.apache.hadoop.fs.FileStatus status = hdfs.getFileStatus(srcPath);
        if (status.isDirectory()) {
            if (!dstFile.exists()) {
                dstFile.mkdirs();
            }

            org.apache.hadoop.fs.FileStatus[] files = hdfs.listStatus(srcPath);
            for (org.apache.hadoop.fs.FileStatus file : files) {
                copyFromHDFS(file.getPath().toString(),
                        localPath + File.separator + file.getPath().getName());
            }
        } else {
            try (InputStream is = hdfs.open(srcPath);
                 OutputStream os = new FileOutputStream(dstFile)) {

                byte[] buffer = new byte[8192];
                int bytesRead;
                while ((bytesRead = is.read(buffer)) != -1) {
                    os.write(buffer, 0, bytesRead);
                }
            }
        }
    }

    private void deleteLocalDirectory(File directory) {
        if (directory.isDirectory()) {
            File[] files = directory.listFiles();
            if (files != null) {
                for (File file : files) {
                    deleteLocalDirectory(file);
                }
            }
        }
        if (directory.delete()) {
            LOG.debug("Deleted local file: {}", directory);
        }
    }

    public void cleanupOldCheckpoints(long retainCount) throws IOException {
        Path checkpointPath = new Path(checkpointBasePath);
        org.apache.hadoop.fs.FileStatus[] checkpoints = hdfs.listStatus(checkpointPath);

        if (checkpoints == null || checkpoints.length <= retainCount) {
            return;
        }

        java.util.Arrays.sort(checkpoints, (a, b) -> {
            long aTime = a.getModificationTime();
            long bTime = b.getModificationTime();
            return Long.compare(aTime, bTime);
        });

        int deleteCount = checkpoints.length - (int) retainCount;
        for (int i = 0; i < deleteCount; i++) {
            Path chkPath = checkpoints[i].getPath();
            hdfs.delete(chkPath, true);
            LOG.info("Deleted old checkpoint: {}", chkPath);
        }
    }

    public boolean checkpointExists(long checkpointId) throws IOException {
        String checkpointDir = String.format("%s/chk-%d", checkpointBasePath, checkpointId);
        return hdfs.exists(new Path(checkpointDir));
    }

    @Override
    public void close() {
        if (hdfs != null) {
            try {
                hdfs.close();
                hdfs = null;
                LOG.info("HDFS Checkpoint Manager closed");
            } catch (IOException e) {
                LOG.error("Error closing HDFS FileSystem", e);
            }
        }
    }
}
