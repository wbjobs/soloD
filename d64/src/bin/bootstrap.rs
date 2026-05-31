use p2p_cdn::node::KademliaNode;
use std::net::SocketAddr;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::INFO)
        .init();
    
    let bind_addr: SocketAddr = "0.0.0.0:8080".parse()?;
    
    let node = KademliaNode::new(bind_addr, Vec::new()).await?;
    
    println!("Bootstrap node running on: {}", node.address());
    println!("Node ID: {}", node.id());
    
    node.run().await?;
    
    Ok(())
}
