package com.flink.statebackend.util;

import com.flink.statebackend.model.StateValue;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.*;
import java.nio.ByteBuffer;

public class StateSerializer {

    private static final Logger LOG = LoggerFactory.getLogger(StateSerializer.class);

    private static final int VERSION = 1;

    public static byte[] serialize(StateValue stateValue) {
        try (ByteArrayOutputStream baos = new ByteArrayOutputStream();
             DataOutputStream dos = new DataOutputStream(baos)) {

            dos.writeInt(VERSION);

            byte[] value = stateValue.getValue();
            if (value == null) {
                dos.writeInt(-1);
            } else {
                dos.writeInt(value.length);
                dos.write(value);
            }

            dos.writeLong(stateValue.getLastAccessTime());
            dos.writeLong(stateValue.getTtl());
            dos.writeInt(stateValue.getAccessCount());

            dos.flush();
            return baos.toByteArray();

        } catch (IOException e) {
            LOG.error("Failed to serialize StateValue", e);
            throw new RuntimeException("Serialization failed", e);
        }
    }

    public static StateValue deserialize(byte[] data) {
        if (data == null || data.length == 0) {
            return null;
        }

        try (ByteArrayInputStream bais = new ByteArrayInputStream(data);
             DataInputStream dis = new DataInputStream(bais)) {

            int version = dis.readInt();
            if (version != VERSION) {
                LOG.warn("Unexpected version: {}, expected: {}", version, VERSION);
            }

            int valueLength = dis.readInt();
            byte[] value = null;
            if (valueLength >= 0) {
                value = new byte[valueLength];
                dis.readFully(value);
            }

            long lastAccessTime = dis.readLong();
            long ttl = dis.readLong();
            int accessCount = dis.readInt();

            return new StateValue(value, lastAccessTime, ttl, accessCount);

        } catch (IOException e) {
            LOG.error("Failed to deserialize StateValue", e);
            throw new RuntimeException("Deserialization failed", e);
        }
    }

    public static byte[] serializeKey(String key) {
        if (key == null) {
            return new byte[0];
        }
        return key.getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }

    public static String deserializeKey(byte[] data) {
        if (data == null || data.length == 0) {
            return null;
        }
        return new String(data, java.nio.charset.StandardCharsets.UTF_8);
    }

    public static byte[] longToBytes(long value) {
        return ByteBuffer.allocate(Long.BYTES).putLong(value).array();
    }

    public static long bytesToLong(byte[] bytes) {
        return ByteBuffer.wrap(bytes).getLong();
    }
}
