package docker

import (
	"bufio"
	"bytes"
	"context"
	"io"
	"log"
	"time"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
)

const (
	maxLogLineSize = 64 * 1024
	readBufferSize = 128 * 1024
)

type LogMessage struct {
	ContainerID string
	Message     string
	StreamType  string
	Timestamp   string
}

type Monitor struct {
	cli        *client.Client
	config     DockerConfig
	logChan    chan<- LogMessage
	ctx        context.Context
	cancelFunc context.CancelFunc
	doneChan   chan struct{}
}

type DockerConfig struct {
	ContainerID string
	Follow      bool
	Tail        string
	ShowStdout  bool
	ShowStderr  bool
}

func NewMonitor(cfg DockerConfig, logChan chan<- LogMessage) (*Monitor, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())

	return &Monitor{
		cli:        cli,
		config:     cfg,
		logChan:    logChan,
		ctx:        ctx,
		cancelFunc: cancel,
		doneChan:   make(chan struct{}),
	}, nil
}

func (m *Monitor) Start() error {
	options := container.LogsOptions{
		ShowStdout: m.config.ShowStdout,
		ShowStderr: m.config.ShowStderr,
		Follow:     m.config.Follow,
		Tail:       m.config.Tail,
		Timestamps: true,
	}

	reader, err := m.cli.ContainerLogs(m.ctx, m.config.ContainerID, options)
	if err != nil {
		return err
	}

	go m.readLogs(reader)
	return nil
}

func (m *Monitor) readLogs(reader io.ReadCloser) {
	defer func() {
		reader.Close()
		close(m.doneChan)
	}()

	bufReader := bufio.NewReaderSize(reader, readBufferSize)
	lineBuffer := bytes.NewBuffer(make([]byte, 0, maxLogLineSize))

	droppedCount := 0
	lastReport := time.Now()

	for {
		select {
		case <-m.ctx.Done():
			return
		default:
			line, isPrefix, err := bufReader.ReadLine()
			if err != nil {
				if err != io.EOF {
					log.Printf("Error reading logs: %v", err)
				}
				return
			}

			lineBuffer.Write(line)

			if isPrefix {
				continue
			}

			fullLine := lineBuffer.Bytes()
			lineBuffer.Reset()

			if len(fullLine) > 8 {
				streamType := "stdout"
				if fullLine[0] == 2 {
					streamType = "stderr"
				}

				message := string(fullLine[8:])
				timestamp := ""

				if len(message) > 30 {
					timestamp = message[:30]
					message = message[31:]
				}

				logMsg := LogMessage{
					ContainerID: m.config.ContainerID,
					Message:     message,
					StreamType:  streamType,
					Timestamp:   timestamp,
				}

				select {
				case m.logChan <- logMsg:
				default:
					droppedCount++
				}

				if droppedCount > 0 && time.Since(lastReport) > 30*time.Second {
					log.Printf("警告: 已丢弃 %d 条日志 (logChan已满)", droppedCount)
					droppedCount = 0
					lastReport = time.Now()
				}
			}
		}
	}
}

func (m *Monitor) Stop() {
	m.cancelFunc()
	select {
	case <-m.doneChan:
	case <-time.After(3 * time.Second):
		log.Println("日志读取超时退出")
	}
	m.cli.Close()
}

func ListContainers() ([]string, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	defer cli.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	containers, err := cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	var ids []string
	for _, c := range containers {
		ids = append(ids, c.ID[:12]+" - "+c.Names[0][1:])
	}
	return ids, nil
}
