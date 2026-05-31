use crate::id::NodeId;
use quinn::{Endpoint, ServerConfig, ClientConfig, Connection, RecvStream, SendStream};
use rustls::{Certificate, PrivateKey, ServerConfig as TlsServerConfig, ClientConfig as TlsClientConfig};
use rustls_pemfile::{certs, pkcs8_private_keys};
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use bytes::Bytes;
use tracing::*;

pub const ALPN_KAD: &[u8] = b"kademlia/1.0";

#[derive(Debug, Clone)]
pub struct NetworkConfig {
    pub bind_addr: SocketAddr,
    pub cert_chain: Vec<Certificate>,
    pub key: PrivateKey,
}

impl NetworkConfig {
    pub fn new(bind_addr: SocketAddr, cert_chain: Vec<Certificate>, key: PrivateKey) -> Self {
        NetworkConfig {
            bind_addr,
            cert_chain,
            key,
        }
    }
}

pub struct QuicNetwork {
    local_id: NodeId,
    endpoint: Endpoint,
    client_config: Arc<ClientConfig>,
}

impl QuicNetwork {
    pub async fn new(local_id: NodeId, config: NetworkConfig) -> Result<Self, Box<dyn Error>> {
        let server_config = Self::configure_server(&config)?;
        let client_config = Self::configure_client()?;
        
        let endpoint = Endpoint::server(server_config, config.bind_addr)?;
        
        Ok(QuicNetwork {
            local_id,
            endpoint,
            client_config: Arc::new(client_config),
        })
    }
    
    fn configure_server(config: &NetworkConfig) -> Result<ServerConfig, Box<dyn Error>> {
        let mut tls_config = TlsServerConfig::builder()
            .with_safe_defaults()
            .with_no_client_auth()
            .with_single_cert(config.cert_chain.clone(), config.key.clone())?;
        
        tls_config.alpn_protocols = vec![ALPN_KAD.to_vec()];
        
        let mut server_config = ServerConfig::with_crypto(Arc::new(tls_config));
        server_config.transport = Arc::new(Self::configure_transport());
        
        Ok(server_config)
    }
    
    fn configure_client() -> Result<ClientConfig, Box<dyn Error>> {
        let mut tls_config = TlsClientConfig::builder()
            .with_safe_defaults()
            .with_custom_certificate_verifier(Arc::new(InsecureVerifier))
            .with_no_client_auth();
        
        tls_config.alpn_protocols = vec![ALPN_KAD.to_vec()];
        
        let mut client_config = ClientConfig::new(Arc::new(tls_config));
        client_config.transport = Arc::new(Self::configure_transport());
        
        Ok(client_config)
    }
    
    fn configure_transport() -> quinn::TransportConfig {
        let mut transport = quinn::TransportConfig::default();
        transport.max_idle_timeout(Some(Duration::from_secs(30).try_into().unwrap()));
        transport.keep_alive_interval(Some(Duration::from_secs(5)));
        transport
    }
    
    pub fn local_addr(&self) -> Result<SocketAddr, Box<dyn Error>> {
        self.endpoint.local_addr().map_err(|e| e.into())
    }
    
    pub async fn connect(&self, addr: SocketAddr) -> Result<Connection, Box<dyn Error>> {
        let connecting = self.endpoint.connect_with(
            self.client_config.clone(),
            addr,
            "localhost",
        )?;
        
        let connection = connecting.await?;
        debug!("Connected to {}", addr);
        Ok(connection)
    }
    
    pub async fn send_message(&self, addr: SocketAddr, message: &[u8]) -> Result<Bytes, Box<dyn Error>> {
        let connection = self.connect(addr).await?;
        let (mut send, mut recv) = connection.open_bi().await?;
        
        let length = (message.len() as u32).to_be_bytes();
        send.write_all(&length).await?;
        send.write_all(message).await?;
        send.finish().await?;
        
        let mut len_buf = [0u8; 4];
        recv.read_exact(&mut len_buf).await?;
        let response_len = u32::from_be_bytes(len_buf) as usize;
        
        let mut response = vec![0u8; response_len];
        recv.read_exact(&mut response).await?;
        
        Ok(Bytes::from(response))
    }
    
    pub async fn accept(&mut self) -> Result<(Connection, RecvStream, SendStream), Box<dyn Error>> {
        let connecting = self.endpoint.accept().await.ok_or("Endpoint closed")?;
        let connection = connecting.await?;
        
        let (send, recv) = connection.accept_bi().await?;
        
        Ok((connection, recv, send))
    }
    
    pub async fn receive_message(&mut self) -> Result<(SocketAddr, Bytes), Box<dyn Error>> {
        let (connection, mut recv, mut send) = self.accept().await?;
        let peer_addr = connection.remote_address();
        
        let mut len_buf = [0u8; 4];
        recv.read_exact(&mut len_buf).await?;
        let msg_len = u32::from_be_bytes(len_buf) as usize;
        
        let mut message = vec![0u8; msg_len];
        recv.read_exact(&mut message).await?;
        
        Ok((peer_addr, Bytes::from(message)))
    }
}

struct InsecureVerifier;

impl rustls::client::ServerCertVerifier for InsecureVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &rustls::Certificate,
        _intermediates: &[rustls::Certificate],
        _server_name: &rustls::ServerName,
        _scts: &mut dyn Iterator<Item = &[u8]>,
        _ocsp_response: &[u8],
        _now: std::time::SystemTime,
    ) -> Result<rustls::client::ServerCertVerified, rustls::Error> {
        Ok(rustls::client::ServerCertVerified::assertion())
    }
}

pub fn generate_self_signed_cert() -> Result<(Vec<Certificate>, PrivateKey), Box<dyn Error>> {
    let cert = rcgen::generate_simple_self_signed(vec!["localhost".to_string()])?;
    
    let cert_der = cert.serialize_der()?;
    let key_der = cert.serialize_private_key_der();
    
    let cert_chain = vec![Certificate(cert_der)];
    let key = PrivateKey(key_der);
    
    Ok((cert_chain, key))
}
