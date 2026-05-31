package dashboard

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const (
	writeWait        = 10 * time.Second
	pongWait         = 60 * time.Second
	pingPeriod       = (pongWait * 9) / 10
	maxMessageSize   = 512
	clientChanSize   = 256
	broadcastSize    = 1024
	maxLogsDefault   = 500
	maxAlertsDefault = 100
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type LogEntry struct {
	ID          string    `json:"id"`
	ContainerID string    `json:"container_id"`
	Message     string    `json:"message"`
	StreamType  string    `json:"stream_type"`
	Timestamp   string    `json:"timestamp"`
	ReceivedAt  time.Time `json:"received_at"`
}

type AlertEvent struct {
	ID           string    `json:"id"`
	TriggerTime  time.Time `json:"trigger_time"`
	Message      string    `json:"message"`
	Keywords     []string  `json:"keywords"`
	StreamType   string    `json:"stream_type"`
	ContainerID  string    `json:"container_id"`
	ContextStart time.Time `json:"context_start"`
	ContextEnd   time.Time `json:"context_end"`
}

type Message struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type Client struct {
	dashboard *Dashboard
	conn      *websocket.Conn
	send      chan []byte
	ctx       context.Context
	cancel    context.CancelFunc
	once      sync.Once
}

type Config struct {
	MaxLogs        int
	MaxAlerts      int
	ContextWindow  int
}

type Dashboard struct {
	router         *gin.Engine
	mu             sync.RWMutex
	logs           []LogEntry
	alerts         []AlertEvent
	maxLogs        int
	maxAlerts      int
	contextWindow  time.Duration
	clients        map[*Client]bool
	broadcast      chan LogEntry
	alertChan      chan AlertEvent
	register       chan *Client
	unregister     chan *Client
	ctx            context.Context
	cancel         context.CancelFunc
	wg             sync.WaitGroup
	shutdownOnce   sync.Once
}

func NewDashboard(cfg Config) *Dashboard {
	if cfg.MaxLogs <= 0 {
		cfg.MaxLogs = maxLogsDefault
	}
	if cfg.MaxAlerts <= 0 {
		cfg.MaxAlerts = maxAlertsDefault
	}
	if cfg.ContextWindow <= 0 {
		cfg.ContextWindow = 30
	}

	ctx, cancel := context.WithCancel(context.Background())

	d := &Dashboard{
		logs:          make([]LogEntry, 0, cfg.MaxLogs+128),
		alerts:        make([]AlertEvent, 0, cfg.MaxAlerts+32),
		maxLogs:       cfg.MaxLogs,
		maxAlerts:     cfg.MaxAlerts,
		contextWindow: time.Duration(cfg.ContextWindow) * time.Second,
		clients:       make(map[*Client]bool),
		broadcast:     make(chan LogEntry, broadcastSize),
		alertChan:     make(chan AlertEvent, 64),
		register:      make(chan *Client, 32),
		unregister:    make(chan *Client, 32),
		ctx:           ctx,
		cancel:        cancel,
	}

	gin.SetMode(gin.ReleaseMode)
	d.router = gin.New()
	d.router.Use(gin.Recovery())
	d.setupRoutes()

	d.wg.Add(1)
	go d.run()

	return d
}

func (d *Dashboard) setupRoutes() {
	d.router.LoadHTMLGlob("templates/*")
	
	d.router.GET("/", func(c *gin.Context) {
		c.HTML(http.StatusOK, "index.html", gin.H{
			"title": "Docker Log Monitor Dashboard",
		})
	})

	d.router.GET("/api/logs", func(c *gin.Context) {
		d.mu.RLock()
		logs := make([]LogEntry, len(d.logs))
		copy(logs, d.logs)
		d.mu.RUnlock()
		
		c.JSON(http.StatusOK, gin.H{
			"logs":  logs,
			"count": len(logs),
		})
	})

	d.router.GET("/api/alerts", func(c *gin.Context) {
		d.mu.RLock()
		alerts := make([]AlertEvent, len(d.alerts))
		copy(alerts, d.alerts)
		d.mu.RUnlock()
		
		c.JSON(http.StatusOK, gin.H{
			"alerts": alerts,
			"count":  len(alerts),
		})
	})

	d.router.GET("/api/alerts/:id", func(c *gin.Context) {
		alertID := c.Param("id")
		
		d.mu.RLock()
		var alert *AlertEvent
		for i := range d.alerts {
			if d.alerts[i].ID == alertID {
				alert = &d.alerts[i]
				break
			}
		}
		d.mu.RUnlock()

		if alert == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		logs := d.getContextLogs(alert.ContextStart, alert.ContextEnd)
		
		c.JSON(http.StatusOK, gin.H{
			"alert": alert,
			"logs":  logs,
			"count": len(logs),
		})
	})

	d.router.GET("/api/alerts/:id/download", func(c *gin.Context) {
		alertID := c.Param("id")
		
		d.mu.RLock()
		var alert *AlertEvent
		for i := range d.alerts {
			if d.alerts[i].ID == alertID {
				alert = &d.alerts[i]
				break
			}
		}
		d.mu.RUnlock()

		if alert == nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Alert not found"})
			return
		}

		logs := d.getContextLogs(alert.ContextStart, alert.ContextEnd)
		
		content := d.generateLogFile(alert, logs)
		
		filename := fmt.Sprintf("alert_%s_%s.log", alertID, time.Now().Format("20060102_150405"))
		
		c.Header("Content-Type", "text/plain; charset=utf-8")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
		c.String(http.StatusOK, content)
	})

	d.router.GET("/api/ws", d.serveWs)

	d.router.Static("/static", "./static")
}

func (d *Dashboard) getContextLogs(start, end time.Time) []LogEntry {
	d.mu.RLock()
	defer d.mu.RUnlock()

	var result []LogEntry
	
	idx := sort.Search(len(d.logs), func(i int) bool {
		return d.logs[i].ReceivedAt.After(start) || d.logs[i].ReceivedAt.Equal(start)
	})

	for i := idx; i < len(d.logs); i++ {
		if d.logs[i].ReceivedAt.After(end) {
			break
		}
		result = append(result, d.logs[i])
	}

	return result
}

func (d *Dashboard) generateLogFile(alert *AlertEvent, logs []LogEntry) string {
	var buf bytes.Buffer

	buf.WriteString("=")
	buf.WriteString(bytes.Repeat([]byte("="), 78))
	buf.WriteString("=\n")
	buf.WriteString("                          DOCKER LOG ALERT CONTEXT REPORT\n")
	buf.WriteString("=")
	buf.WriteString(bytes.Repeat([]byte("="), 78))
	buf.WriteString("=\n\n")

	buf.WriteString(fmt.Sprintf("Alert ID:      %s\n", alert.ID))
	buf.WriteString(fmt.Sprintf("Trigger Time:  %s\n", alert.TriggerTime.Format("2006-01-02 15:04:05.000")))
	buf.WriteString(fmt.Sprintf("Container ID:  %s\n", alert.ContainerID))
	buf.WriteString(fmt.Sprintf("Stream Type:   %s\n", alert.StreamType))
	buf.WriteString(fmt.Sprintf("Keywords:      %v\n", alert.Keywords))
	buf.WriteString(fmt.Sprintf("Context Start: %s\n", alert.ContextStart.Format("2006-01-02 15:04:05.000")))
	buf.WriteString(fmt.Sprintf("Context End:   %s\n", alert.ContextEnd.Format("2006-01-02 15:04:05.000")))
	buf.WriteString(fmt.Sprintf("Log Count:     %d\n", len(logs)))
	buf.WriteString("\n")
	buf.WriteString("-")
	buf.WriteString(bytes.Repeat([]byte("-"), 78))
	buf.WriteString("-\n")
	buf.WriteString("TRIGGER MESSAGE:\n")
	buf.WriteString("-")
	buf.WriteString(bytes.Repeat([]byte("-"), 78))
	buf.WriteString("-\n")
	buf.WriteString(alert.Message)
	buf.WriteString("\n\n")
	buf.WriteString("-")
	buf.WriteString(bytes.Repeat([]byte("-"), 78))
	buf.WriteString("-\n")
	buf.WriteString("COMPLETE LOG CONTEXT (Chronological Order):\n")
	buf.WriteString("-")
	buf.WriteString(bytes.Repeat([]byte("-"), 78))
	buf.WriteString("-\n\n")

	for i, log := range logs {
		prefix := "  "
		if log.ID == alert.ID {
			prefix = ">>> "
		}
		buf.WriteString(fmt.Sprintf("[%04d] %s[%s] %s: %s",
			i+1,
			prefix,
			log.Timestamp,
			log.StreamType,
			log.Message,
		))
		if !bytes.HasSuffix([]byte(log.Message), []byte("\n")) {
			buf.WriteString("\n")
		}
	}

	buf.WriteString("\n")
	buf.WriteString("=")
	buf.WriteString(bytes.Repeat([]byte("="), 78))
	buf.WriteString("=\n")
	buf.WriteString("                              END OF REPORT\n")
	buf.WriteString("=")
	buf.WriteString(bytes.Repeat([]byte("="), 78))
	buf.WriteString("=\n")

	return buf.String()
}

func (d *Dashboard) serveWs(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	ctx, cancel := context.WithCancel(d.ctx)
	
	client := &Client{
		dashboard: d,
		conn:      conn,
		send:      make(chan []byte, clientChanSize),
		ctx:       ctx,
		cancel:    cancel,
	}

	client.dashboard.register <- client

	d.wg.Add(2)
	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.close()
		c.dashboard.wg.Done()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		select {
		case <-c.ctx.Done():
			return
		default:
			_, _, err := c.conn.ReadMessage()
			if err != nil {
				if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
					log.Printf("WebSocket read error: %v", err)
				}
				return
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.close()
		c.dashboard.wg.Done()
	}()

	for {
		select {
		case <-c.ctx.Done():
			return
		case message, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				log.Printf("WebSocket write error: %v", err)
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("WebSocket ping error: %v", err)
				return
			}
		}
	}
}

func (c *Client) close() {
	c.once.Do(func() {
		c.cancel()
		c.dashboard.unregister <- c
		c.conn.Close()
	})
}

func (d *Dashboard) run() {
	defer d.wg.Done()

	for {
		select {
		case <-d.ctx.Done():
			d.cleanup()
			return

		case client := <-d.register:
			d.mu.Lock()
			d.clients[client] = true
			d.mu.Unlock()
			log.Printf("Client connected, total: %d", len(d.clients))

		case client := <-d.unregister:
			d.mu.Lock()
			if _, ok := d.clients[client]; ok {
				delete(d.clients, client)
				close(client.send)
			}
			d.mu.Unlock()
			log.Printf("Client disconnected, total: %d", len(d.clients))

		case logEntry := <-d.broadcast:
			data, err := json.Marshal(Message{
				Type: "log",
				Data: logEntry,
			})
			if err != nil {
				log.Printf("JSON marshal error: %v", err)
				continue
			}

			d.mu.RLock()
			for client := range d.clients {
				select {
				case client.send <- data:
				default:
					select {
					case <-client.send:
					default:
					}
					client.send <- data
				}
			}
			d.mu.RUnlock()

		case alert := <-d.alertChan:
			data, err := json.Marshal(Message{
				Type: "alert",
				Data: alert,
			})
			if err != nil {
				log.Printf("JSON marshal error: %v", err)
				continue
			}

			d.mu.RLock()
			for client := range d.clients {
				select {
				case client.send <- data:
				default:
					select {
					case <-client.send:
					default:
					}
					client.send <- data
				}
			}
			d.mu.RUnlock()
		}
	}
}

func (d *Dashboard) cleanup() {
	d.mu.Lock()
	defer d.mu.Unlock()

	for client := range d.clients {
		client.cancel()
		close(client.send)
		delete(d.clients, client)
	}
}

func (d *Dashboard) AddLog(containerID, message, streamType, timestamp string) string {
	now := time.Now()
	logID := now.Format("20060102150405.000000")
	
	entry := LogEntry{
		ID:          logID,
		ContainerID: containerID,
		Message:     message,
		StreamType:  streamType,
		Timestamp:   timestamp,
		ReceivedAt:  now,
	}

	d.mu.Lock()
	d.logs = append(d.logs, entry)
	if len(d.logs) > d.maxLogs {
		trim := len(d.logs) - d.maxLogs
		d.logs = d.logs[trim:]
	}
	d.mu.Unlock()

	select {
	case d.broadcast <- entry:
	default:
		select {
		case <-d.broadcast:
		default:
		}
		d.broadcast <- entry
	}

	return logID
}

func (d *Dashboard) AddAlert(logID, containerID, message, streamType string, keywords []string) string {
	now := time.Now()
	alertID := now.Format("20060102150405")
	
	alert := AlertEvent{
		ID:           alertID,
		TriggerTime:  now,
		Message:      message,
		Keywords:     keywords,
		StreamType:   streamType,
		ContainerID:  containerID,
		ContextStart: now.Add(-d.contextWindow),
		ContextEnd:   now.Add(d.contextWindow),
	}

	d.mu.Lock()
	d.alerts = append(d.alerts, alert)
	if len(d.alerts) > d.maxAlerts {
		trim := len(d.alerts) - d.maxAlerts
		d.alerts = d.alerts[trim:]
	}
	d.mu.Unlock()

	select {
	case d.alertChan <- alert:
	default:
	}

	return alertID
}

func (d *Dashboard) Start(addr string) error {
	server := &http.Server{
		Addr:           addr,
		Handler:        d.router,
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   10 * time.Second,
		MaxHeaderBytes: 1 << 20,
	}

	return server.ListenAndServe()
}

func (d *Dashboard) Stop() {
	d.shutdownOnce.Do(func() {
		d.cancel()
		d.wg.Wait()
		close(d.broadcast)
		close(d.alertChan)
		close(d.register)
		close(d.unregister)
		log.Println("Dashboard shutdown complete")
	})
}
