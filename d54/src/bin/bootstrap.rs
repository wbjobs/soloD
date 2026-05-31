use p2p_cdn::{DhtNode, NodeId, MIGRATION_INTERVAL};
use std::net::SocketAddr;
use std::time::Duration;
use tracing::info;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let listen_addr: SocketAddr = "0.0.0.0:8080".parse()?;
    let bootstrap_id = NodeId::from_hash(b"bootstrap-node-1");

    info!("Starting bootstrap node...");
    info!("Node ID: {:?}", bootstrap_id);
    info!("Listen address: {}", listen_addr);

    let (mut node, mut incoming_rx) = DhtNode::with_id(listen_addr, bootstrap_id, Vec::new()).await?;
    node.set_origin_peer(bootstrap_id);
    let node_arc = std::sync::Arc::new(node);

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        while let Some((request, addr)) = incoming_rx.recv().await {
            if let Err(e) = node_clone.handle_request(request, addr).await {
                tracing::warn!("Error handling request: {}", e);
            }
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(300));
        loop {
            interval.tick().await;
            let _ = node_clone.cleanup_routing_table().await;
            let _ = node_clone.republish_data().await;
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60));
        loop {
            interval.tick().await;
            let alive = node_clone.probe_suspected_nodes().await;
            if alive > 0 {
                info!("Probe completed: {} suspected nodes are alive", alive);
            }
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(MIGRATION_INTERVAL);
        loop {
            interval.tick().await;
            match node_clone.migrate_replicas().await {
                Ok((added, removed)) => {
                    if added > 0 || removed > 0 {
                        info!("Replica migration: added {}, removed {}", added, removed);
                    }
                }
                Err(e) => tracing::warn!("Migration error: {}", e),
            }
        }
    });

    let node_clone = node_arc.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(30));
        loop {
            interval.tick().await;
            let stats = node_clone.get_routing_table_stats().await;
            let storage = node_clone.storage();
            let all_data = storage.get_all_with_hotness();
            
            let hot_count = all_data.iter().filter(|(_, h, _)| matches!(h, p2p_cdn::HotnessLevel::Hot)).count();
            let warm_count = all_data.iter().filter(|(_, h, _)| matches!(h, p2p_cdn::HotnessLevel::Warm)).count();
            let cold_count = all_data.iter().filter(|(_, h, _)| matches!(h, p2p_cdn::HotnessLevel::Cold)).count();
            
            info!(
                "Routing table: alive={}, suspected={}, offline={}, replacement={}",
                stats.total_alive, stats.total_suspected, stats.total_offline, stats.total_replacement
            );
            info!(
                "Data hotness: hot={}, warm={}, cold={}, total={}",
                hot_count, warm_count, cold_count, all_data.len()
            );
        }
    });

    info!("Bootstrap node running. Press Ctrl+C to exit.");

    tokio::signal::ctrl_c().await?;
    info!("Shutting down...");

    Ok(())
}
