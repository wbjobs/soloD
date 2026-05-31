package com.finance;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.finance.model.AggregatedData;
import com.finance.model.TickData;
import org.apache.flink.api.common.eventtime.WatermarkStrategy;
import org.apache.flink.api.common.functions.AggregateFunction;
import org.apache.flink.api.common.functions.RichMapFunction;
import org.apache.flink.api.common.restartstrategy.RestartStrategies;
import org.apache.flink.api.common.serialization.SimpleStringSchema;
import org.apache.flink.api.common.time.Time;
import org.apache.flink.configuration.CheckpointingOptions;
import org.apache.flink.configuration.Configuration;
import org.apache.flink.configuration.MemorySize;
import org.apache.flink.connector.base.DeliveryGuarantee;
import org.apache.flink.connector.kafka.sink.KafkaRecordSerializationSchema;
import org.apache.flink.connector.kafka.sink.KafkaSink;
import org.apache.flink.connector.kafka.source.KafkaSource;
import org.apache.flink.connector.kafka.source.enumerator.initializer.OffsetsInitializer;
import org.apache.flink.metrics.Counter;
import org.apache.flink.streaming.api.datastream.DataStream;
import org.apache.flink.streaming.api.datastream.SingleOutputStreamOperator;
import org.apache.flink.streaming.api.environment.CheckpointConfig;
import org.apache.flink.streaming.api.environment.StreamExecutionEnvironment;
import org.apache.flink.streaming.api.windowing.assigners.TumblingProcessingTimeWindows;
import org.apache.flink.util.OutputTag;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Properties;

public class FlinkJob {

    private static final Logger LOG = LoggerFactory.getLogger(FlinkJob.class);
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    private static final OutputTag<String> DEAD_LETTER_TAG = new OutputTag<String>("dead-letter") {};
    private static final int MAX_PARSE_ERRORS = 1000;
    private static final long PARSE_ERROR_RESET_INTERVAL = 60000;

    public static void main(String[] args) throws Exception {
        Configuration config = new Configuration();
        config.set(CheckpointingOptions.CHECKPOINTS_DIRECTORY, "file:///tmp/flink-checkpoints");
        config.set(CheckpointingOptions.SAVEPOINT_DIRECTORY, "file:///tmp/flink-savepoints");
        config.set(CheckpointingOptions.INCREMENTAL_CHECKPOINTS, true);
        
        final StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment(config);

        env.enableCheckpointing(30000);
        env.getCheckpointConfig().setCheckpointingMode(
                org.apache.flink.streaming.api.CheckpointingMode.EXACTLY_ONCE);
        env.getCheckpointConfig().setMinPauseBetweenCheckpoints(15000);
        env.getCheckpointConfig().setCheckpointTimeout(60000);
        env.getCheckpointConfig().setMaxConcurrentCheckpoints(1);
        env.getCheckpointConfig().setTolerableCheckpointFailureNumber(3);
        env.getCheckpointConfig().setExternalizedCheckpointCleanup(
                CheckpointConfig.ExternalizedCheckpointCleanup.RETAIN_ON_CANCELLATION);

        env.setRestartStrategy(RestartStrategies.fixedDelayRestart(
                10,
                Time.of(30, java.util.concurrent.TimeUnit.SECONDS)
        ));

        env.setBufferTimeout(100);
        env.getConfig().setAutoWatermarkInterval(500);
        env.getConfig().setLatencyTrackingInterval(1000);

        KafkaSource<String> kafkaSource = KafkaSource.<String>builder()
                .setBootstrapServers("localhost:9092")
                .setTopics("tick-data")
                .setGroupId("flink-group")
                .setStartingOffsets(OffsetsInitializer.committedOffsets())
                .setValueOnlyDeserializer(new SimpleStringSchema())
                .setProperty("fetch.min.bytes", "1024")
                .setProperty("fetch.max.wait.ms", "500")
                .setProperty("max.partition.fetch.bytes", "1048576")
                .build();

        WatermarkStrategy<String> watermarkStrategy = WatermarkStrategy
                .<String>forBoundedOutOfOrderness(Duration.ofSeconds(10))
                .withIdleness(Duration.ofMinutes(1))
                .withTimestampAssigner((element, timestamp) -> System.currentTimeMillis());

        DataStream<String> stream = env.fromSource(
                kafkaSource,
                watermarkStrategy,
                "Kafka Source"
        );

        SingleOutputStreamOperator<TickData> tickDataStream = stream
                .map(new TickDataParserFunction())
                .name("Parse TickData")
                .uid("parse-tick-data");

        DataStream<String> deadLetterStream = tickDataStream.getSideOutput(DEAD_LETTER_TAG);
        deadLetterStream
                .countWindowAll(100)
                .process(new DeadLetterLogger())
                .name("Dead Letter Logger")
                .uid("dead-letter-logger");

        DataStream<AggregatedData> aggregatedStream = tickDataStream
                .keyBy(TickData::getSymbol)
                .window(TumblingProcessingTimeWindows.of(Time.minutes(1)))
                .aggregate(new VWAPAggregator())
                .name("1-Minute VWAP Aggregation")
                .uid("vwap-aggregation");

        Properties producerProps = new Properties();
        producerProps.setProperty("acks", "all");
        producerProps.setProperty("retries", "3");
        producerProps.setProperty("retry.backoff.ms", "1000");
        producerProps.setProperty("enable.idempotence", "true");
        producerProps.setProperty("max.in.flight.requests.per.connection", "5");
        producerProps.setProperty("compression.type", "snappy");
        producerProps.setProperty("linger.ms", "10");
        producerProps.setProperty("batch.size", "65536");

        KafkaSink<String> kafkaSink = KafkaSink.<String>builder()
                .setBootstrapServers("localhost:9092")
                .setKafkaProducerConfig(producerProps)
                .setRecordSerializer(KafkaRecordSerializationSchema.builder()
                        .setTopic("aggregated-data")
                        .setValueSerializationSchema(new SimpleStringSchema())
                        .build()
                )
                .setDeliveryGuarantee(DeliveryGuarantee.AT_LEAST_ONCE)
                .setTransactionalIdPrefix("flink-finance-")
                .build();

        aggregatedStream
                .map(data -> objectMapper.writeValueAsString(data))
                .name("Serialize AggregatedData")
                .uid("serialize-aggregated-data")
                .sinkTo(kafkaSink)
                .name("Kafka Sink")
                .uid("kafka-sink");

        env.execute("Finance Data Real-time Aggregation Job");
    }

    public static class TickDataParserFunction extends RichMapFunction<String, TickData> {
        private transient Counter parseErrorCounter;
        private transient long lastErrorResetTime;
        private int parseErrorCount = 0;

        @Override
        public void open(Configuration parameters) {
            parseErrorCounter = getRuntimeContext()
                    .getMetricGroup()
                    .counter("parseErrors");
            lastErrorResetTime = System.currentTimeMillis();
        }

        @Override
        public TickData map(String value) {
            try {
                return objectMapper.readValue(value, TickData.class);
            } catch (Exception e) {
                parseErrorCounter.inc();
                parseErrorCount++;

                long now = System.currentTimeMillis();
                if (now - lastErrorResetTime > PARSE_ERROR_RESET_INTERVAL) {
                    parseErrorCount = 0;
                    lastErrorResetTime = now;
                }

                if (parseErrorCount < MAX_PARSE_ERRORS) {
                    LOG.warn("Failed to parse tick data: {}", e.getMessage());
                } else if (parseErrorCount == MAX_PARSE_ERRORS) {
                    LOG.error("Too many parse errors ({}), suppressing further logs", MAX_PARSE_ERRORS);
                }

                return null;
            }
        }
    }

    public static class DeadLetterLogger extends org.apache.flink.streaming.api.functions.windowing.ProcessAllWindowFunction<String, Void, org.apache.flink.streaming.api.windowing.windows.GlobalWindow> {
        @Override
        public void process(Context context, Iterable<String> elements, org.apache.flink.util.Collector<Void> out) {
            int count = 0;
            for (String element : elements) {
                count++;
            }
            LOG.warn("Received {} dead-letter messages", count);
        }
    }

    public static class VWAPAggregator implements AggregateFunction<TickData, VWAPAccumulator, AggregatedData> {
        private static final Logger AGG_LOG = LoggerFactory.getLogger(VWAPAggregator.class);

        @Override
        public VWAPAccumulator createAccumulator() {
            return new VWAPAccumulator();
        }

        @Override
        public VWAPAccumulator add(TickData tick, VWAPAccumulator acc) {
            if (tick == null) {
                return acc;
            }

            try {
                if (acc.count == 0) {
                    acc.symbol = tick.getSymbol();
                    acc.open = tick.getPrice();
                    acc.high = tick.getPrice();
                    acc.low = tick.getPrice();
                    acc.windowStart = LocalDateTime.now();
                }
                
                acc.close = tick.getPrice();
                if (tick.getPrice().compareTo(acc.high) > 0) {
                    acc.high = tick.getPrice();
                }
                if (tick.getPrice().compareTo(acc.low) < 0) {
                    acc.low = tick.getPrice();
                }
                
                acc.priceVolumeSum = acc.priceVolumeSum.add(
                        tick.getPrice().multiply(BigDecimal.valueOf(tick.getVolume()))
                );
                acc.totalVolume += tick.getVolume();
                acc.count++;
            } catch (Exception e) {
                AGG_LOG.error("Error aggregating tick data: {}", e.getMessage());
            }
            
            return acc;
        }

        @Override
        public AggregatedData getResult(VWAPAccumulator acc) {
            if (acc.count == 0 || acc.symbol == null) {
                return null;
            }

            BigDecimal vwap = acc.totalVolume > 0
                    ? acc.priceVolumeSum.divide(BigDecimal.valueOf(acc.totalVolume), 4, RoundingMode.HALF_UP)
                    : BigDecimal.ZERO;

            return AggregatedData.builder()
                    .symbol(acc.symbol)
                    .open(acc.open)
                    .high(acc.high)
                    .low(acc.low)
                    .close(acc.close)
                    .vwap(vwap)
                    .volume(acc.totalVolume)
                    .windowStart(acc.windowStart)
                    .windowEnd(LocalDateTime.now())
                    .build();
        }

        @Override
        public VWAPAccumulator merge(VWAPAccumulator a, VWAPAccumulator b) {
            if (a.symbol == null) return b;
            if (b.symbol == null) return a;

            VWAPAccumulator merged = new VWAPAccumulator();
            merged.symbol = a.symbol;
            merged.open = a.open;
            merged.high = a.high.compareTo(b.high) > 0 ? a.high : b.high;
            merged.low = a.low.compareTo(b.low) < 0 ? a.low : b.low;
            merged.close = b.close;
            merged.priceVolumeSum = a.priceVolumeSum.add(b.priceVolumeSum);
            merged.totalVolume = a.totalVolume + b.totalVolume;
            merged.count = a.count + b.count;
            merged.windowStart = a.windowStart.isBefore(b.windowStart) ? a.windowStart : b.windowStart;
            return merged;
        }
    }

    public static class VWAPAccumulator implements java.io.Serializable {
        public String symbol;
        public BigDecimal open = BigDecimal.ZERO;
        public BigDecimal high = BigDecimal.ZERO;
        public BigDecimal low = BigDecimal.ZERO;
        public BigDecimal close = BigDecimal.ZERO;
        public BigDecimal priceVolumeSum = BigDecimal.ZERO;
        public long totalVolume = 0;
        public long count = 0;
        public LocalDateTime windowStart;
    }
}
