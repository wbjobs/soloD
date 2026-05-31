use p2p_cdn::node::KademliaNode;
use p2p_cdn::id::NodeId;
use std::net::SocketAddr;
use std::env;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
    
    let args: Vec<String> = env::args().collect();
    
    let bind_port: u16 = args.get(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(8081);
    
    let bootstrap_addr: SocketAddr = args.get(2)
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| "127.0.0.1:8080".parse().unwrap());
    
    let bind_addr = format!("0.0.0.0:{}", bind_port).parse()?;
    
    let node = KademliaNode::new(bind_addr, vec![bootstrap_addr]).await?;
    
    println!("Node running on: {}", node.address());
    println!("Node ID: {}", node.id());
    println!("Bootstrap node: {}", bootstrap_addr);
    
    node.bootstrap().await?;
    println!("Bootstrap completed!");
    
    let test_key = NodeId::from_data(b"test_key");
    let test_value = b"Hello, Kademlia!".to_vec();
    
    println!("\nStoring test value...");
    let stored_count = node.store(test_key, test_value.clone()).await?;
    println!("Value stored on {} nodes", stored_count);
    
    println!("\nRetrieving test value...");
    let retrieved = node.find_value(test_key).await?;
    
    match retrieved {
        Some(value) => {
            println!("Retrieved value: {}", String::from_utf8_lossy(&value));
            assert_eq!(value, test_value);
            println!("✓ Value matches!");
        }
        None => {
            println!("✗ Value not found!");
        }
    }
    
    println!("\nNode is running. Press Ctrl+C to exit...");
    node.run().await?;
    
    Ok(())
}
