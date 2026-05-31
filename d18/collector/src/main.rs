use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::sync::mpsc;
use tokio::time::interval;
use rdkafka::producer::{FutureProducer, FutureRecord};
use rdkafka::util::Timeout;
use rdkafka::ClientConfig;
use serde_json;

const UDP_PORT: u16 = 9000;
const KAFKA_BROKER: &str = "localhost:9092";
const KAFKA_TOPIC: &str = "logs";
const BATCH_SIZE: usize = 100;
const BATCH_TIMEOUT: u64 = 1;
const MAX_PACKET_SIZE: usize = 65535;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let socket = UdpSocket::bind(format!("0.0.0.0:{}", UDP_PORT)).await?;
    println!("Log collector listening on UDP port {}", UDP_PORT);

    let producer: FutureProducer = ClientConfig::new()
        .set("bootstrap.servers", KAFKA_BROKER)
        .set("message.timeout.ms", "5000")
        .set("queue.buffering.max.messages", "100000")
        .set("queue.buffering.max.ms", "10")
        .create()?;

    println!("Connected to Kafka broker at {}", KAFKA_BROKER);

    let (tx, mut rx) = mpsc::channel::<String>(10000);

    tokio::spawn(async move {
        let mut received_count: u64 = 0;
        let mut invalid_count: u64 = 0;
        
        loop {
            let mut buf = vec![0u8; MAX_PACKET_SIZE];
            
            match socket.recv(&mut buf).await {
                Ok(len) => {
                    if len > 0 {
                        let packet_data = &buf[..len];
                        match String::from_utf8(packet_data.to_vec()) {
                            Ok(log_str) => {
                                if serde_json::from_str::<serde_json::Value>(&log_str).is_ok() {
                                    received_count += 1;
                                    if received_count % 1000 == 0 {
                                        println!("Total received logs: {}", received_count);
                                    }
                                    if let Err(e) = tx.send(log_str).await {
                                        eprintln!("Error sending to channel: {}", e);
                                    }
                                } else {
                                    invalid_count += 1;
                                    eprintln!("Invalid JSON received (count: {}): {}...", 
                                              invalid_count, &log_str.chars().take(50).collect::<String>());
                                }
                            }
                            Err(e) => {
                                eprintln!("UTF-8 decode error: {}", e);
                            }
                        }
                    }
                }
                Err(e) => {
                    eprintln!("Error receiving UDP packet: {}", e);
                    tokio::time::sleep(Duration::from_millis(100)).await;
                }
            }
        }
    });

    let mut batch = Vec::with_capacity(BATCH_SIZE);
    let mut ticker = interval(Duration::from_secs(BATCH_TIMEOUT));

    loop {
        tokio::select! {
            Some(log) = rx.recv() => {
                batch.push(log);
                if batch.len() >= BATCH_SIZE {
                    send_batch(&producer, &mut batch).await;
                }
            }
            _ = ticker.tick() => {
                if !batch.is_empty() {
                    send_batch(&producer, &mut batch).await;
                }
            }
        }
    }
}

async fn send_batch(producer: &FutureProducer, batch: &mut Vec<String>) {
    let count = batch.len();
    for log in batch.drain(..) {
        let record: FutureRecord<String, String> = FutureRecord::to(KAFKA_TOPIC)
            .payload(&log);
        
        if let Err((e, _)) = producer.send(record, Timeout::After(Duration::from_secs(5))).await {
            eprintln!("Error sending to Kafka: {}", e);
        }
    }
    println!("Sent {} logs to Kafka topic '{}'", count, KAFKA_TOPIC);
}
