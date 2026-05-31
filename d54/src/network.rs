use crate::node_id::NodeId;
use crate::rpc::{deserialize, serialize, RpcMessage};
use quinn::{Endpoint, Incoming, ServerConfig};
use rustls::{Certificate, PrivateKey, ServerConfig as TlsServerConfig};
use rustls_pemfile::{certs, pkcs8_private_keys};
use std::collections::HashMap;
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::sync::{mpsc, oneshot, Mutex};
use tracing::{debug, error, info, warn};

type PendingRequests = Arc<Mutex<HashMap<u64, oneshot::Sender<RpcMessage>>>>;

pub struct Network {
    endpoint: Endpoint,
    pending_requests: PendingRequests,
    next_msg_id: Arc<Mutex<u64>>,
    local_id: NodeId,
}

impl Network {
    pub fn new(
        local_addr: SocketAddr,
        local_id: NodeId,
        cert_chain: Vec<Vec<u8>>,
        key: Vec<u8>,
    ) -> Result<(Self, mpsc::Receiver<(RpcMessage, SocketAddr)>), NetworkError> {
        let (incoming_tx, incoming_rx) = mpsc::channel(1000);

        let server_config = Self::configure_server(cert_chain, key)?;
        let (endpoint, incoming) = Endpoint::server(server_config, local_addr)?;

        let network = Self {
            endpoint,
            pending_requests: Arc::new(Mutex::new(HashMap::new())),
            next_msg_id: Arc::new(Mutex::new(0)),
            local_id,
        };

        tokio::spawn(Self::handle_incoming_connections(
            incoming,
            incoming_tx,
            network.pending_requests.clone(),
            local_id,
        ));

        Ok((network, incoming_rx))
    }

    fn configure_server(
        cert_chain: Vec<Vec<u8>>,
        key: Vec<u8>,
    ) -> Result<ServerConfig, NetworkError> {
        let certs = cert_chain
            .into_iter()
            .map(Certificate)
            .collect::<Vec<_>>();
        let key = PrivateKey(key);

        let mut server_config = TlsServerConfig::builder()
            .with_safe_defaults()
            .with_no_client_auth()
            .with_single_cert(certs, key)?;

        server_config.alpn_protocols = vec![b"p2p-cdn/1.0".to_vec()];

        let mut quic_config = quinn::TransportConfig::default();
        quic_config.max_idle_timeout(Some(std::time::Duration::from_secs(30).try_into()?));
        quic_config.keep_alive_interval(Some(std::time::Duration::from_secs(5)));

        let mut server_config = ServerConfig::with_crypto(Arc::new(server_config));
        server_config.transport = Arc::new(quic_config);

        Ok(server_config)
    }

    async fn handle_incoming_connections(
        mut incoming: Incoming,
        incoming_tx: mpsc::Sender<(RpcMessage, SocketAddr)>,
        pending_requests: PendingRequests,
        local_id: NodeId,
    ) {
        while let Some(conn) = incoming.next().await {
            let incoming_tx = incoming_tx.clone();
            let pending_requests = pending_requests.clone();
            tokio::spawn(async move {
                if let Ok(new_conn) = conn.await {
                    let addr = new_conn.remote_address();
                    debug!("New connection from {}", addr);

                    for (_, bi) in new_conn.bi_streams {
                        let (mut send, mut recv) = bi;
                        let incoming_tx = incoming_tx.clone();
                        let pending_requests = pending_requests.clone();

                        tokio::spawn(async move {
                            let mut buf = vec![0u8; 65536];
                            while let Ok(Some(n)) = recv.read(&mut buf).await {
                                match deserialize(&buf[..n]) {
                                    Ok(msg) => {
                                        match &msg.body {
                                            crate::rpc::RpcBody::Response(_) => {
                                                let mut pending = pending_requests.lock().await;
                                                if let Some(tx) = pending.remove(&msg.id) {
                                                    let _ = tx.send(msg);
                                                }
                                            }
                                            crate::rpc::RpcBody::Request(_) => {
                                                let _ = incoming_tx.send((msg, addr)).await;
                                            }
                                        }
                                    }
                                    Err(e) => {
                                        error!("Failed to deserialize message: {}", e);
                                    }
                                }
                            }
                        });
                    }
                }
            });
        }
    }

    pub async fn send_request(
        &self,
        addr: SocketAddr,
        request: RpcMessage,
        timeout: std::time::Duration,
    ) -> Result<RpcMessage, NetworkError> {
        let msg_id = request.id;

        let (response_tx, response_rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(msg_id, response_tx);
        }

        let result = tokio::time::timeout(timeout, async {
            let conn = self.endpoint.connect(addr, "localhost")?.await?;
            let (mut send, _) = conn.open_bi().await?;

            let data = serialize(&request)?;
            send.write_all(&data).await?;
            send.finish().await?;

            response_rx.await.map_err(|_| NetworkError::RequestDropped)
        })
        .await;

        let mut pending = self.pending_requests.lock().await;
        pending.remove(&msg_id);

        match result {
            Ok(Ok(response)) => Ok(response),
            Ok(Err(e)) => Err(e),
            Err(_) => Err(NetworkError::Timeout),
        }
    }

    pub async fn send_response(
        &self,
        addr: SocketAddr,
        response: RpcMessage,
    ) -> Result<(), NetworkError> {
        let conn = self.endpoint.connect(addr, "localhost")?.await?;
        let (mut send, _) = conn.open_bi().await?;

        let data = serialize(&response)?;
        send.write_all(&data).await?;
        send.finish().await?;

        Ok(())
    }

    pub async fn next_message_id(&self) -> u64 {
        let mut id = self.next_msg_id.lock().await;
        let msg_id = *id;
        *id = id.wrapping_add(1);
        msg_id
    }

    pub fn local_addr(&self) -> Result<SocketAddr, NetworkError> {
        self.endpoint.local_addr().map_err(NetworkError::from)
    }

    pub fn local_id(&self) -> NodeId {
        self.local_id
    }
}

#[derive(thiserror::Error, Debug)]
pub enum NetworkError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("QUIC error: {0}")]
    Quic(#[from] quinn::ConnectError),
    #[error("QUIC connection error: {0}")]
    QuicConnection(#[from] quinn::ConnectionError),
    #[error("QUIC write error: {0}")]
    QuicWrite(#[from] quinn::WriteError),
    #[error("TLS error: {0}")]
    Tls(#[from] rustls::Error),
    #[error("Serialization error: {0}")]
    Serialization(#[from] bincode::Error),
    #[error("Request timeout")]
    Timeout,
    #[error("Request dropped")]
    RequestDropped,
    #[error("Invalid duration")]
    InvalidDuration,
}

impl From<std::num::TryFromIntError> for NetworkError {
    fn from(_: std::num::TryFromIntError) -> Self {
        NetworkError::InvalidDuration
    }
}

pub fn generate_self_signed_cert() -> Result<(Vec<Vec<u8>>, Vec<u8>), Box<dyn std::error::Error>> {
    use rand::rngs::OsRng;
    use rcgen::{CertificateParams, KeyPair, PKCS_ECDSA_P256_SHA256};

    let mut params = CertificateParams::new(vec!["localhost".to_string()]);
    params.key_usages = vec![
        rcgen::KeyUsagePurpose::DigitalSignature,
        rcgen::KeyUsagePurpose::KeyEncipherment,
    ];
    params.extended_key_usages = vec![
        rcgen::ExtendedKeyUsagePurpose::ServerAuth,
        rcgen::ExtendedKeyUsagePurpose::ClientAuth,
    ];

    let key_pair = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256)?;
    let cert = params.self_signed(&key_pair)?;

    let cert_der = cert.der();
    let key_der = key_pair.serialize_der();

    Ok((vec![cert_der.to_vec()], key_der))
}
