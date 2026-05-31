package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"docker-log-monitor/config"
	"docker-log-monitor/dashboard"
	"docker-log-monitor/docker"
	"docker-log-monitor/filter"
	"docker-log-monitor/webhook"

	"github.com/spf13/cobra"
)

const (
	logChanBufferSize = 2048
	webhookWorkerNum  = 4
)

var (
	cfgFile     string
	containerID string
	showVersion bool
	version     = "1.2.0"
)

var rootCmd = &cobra.Command{
	Use:   "docker-log-monitor",
	Short: "Docker容器日志监控工具",
	Long:  `一个用于监控Docker容器日志的命令行工具，支持日志过滤、Webhook告警推送以及Web Dashboard展示。`,
	Run:   runMonitor,
}

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "列出所有Docker容器",
	Run:   runList,
}

var versionCmd = &cobra.Command{
	Use:   "version",
	Short: "显示版本信息",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Printf("Docker Log Monitor v%s\n", version)
	},
}

func init() {
	cobra.OnInitialize(initConfig)

	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "config.yaml", "配置文件路径")
	rootCmd.PersistentFlags().StringVarP(&containerID, "container", "C", "", "要监控的容器ID或名称")
	rootCmd.AddCommand(listCmd, versionCmd)
}

func initConfig() {
}

func runMonitor(cmd *cobra.Command, args []string) {
	cfg, err := config.LoadConfig(cfgFile)
	if err != nil {
		log.Fatalf("加载配置文件失败: %v", err)
	}

	if containerID != "" {
		cfg.Docker.ContainerID = containerID
	}

	if cfg.Docker.ContainerID == "" {
		log.Fatal("请指定要监控的容器ID，可以通过配置文件或--container参数")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	logChan := make(chan docker.LogMessage, logChanBufferSize)
	alertChan := make(chan webhook.AlertMessage, 256)

	monitor, err := docker.NewMonitor(docker.DockerConfig{
		ContainerID: cfg.Docker.ContainerID,
		Follow:      cfg.Docker.Follow,
		Tail:        cfg.Docker.Tail,
		ShowStdout:  cfg.Docker.ShowStdout,
		ShowStderr:  cfg.Docker.ShowStderr,
	}, logChan)
	if err != nil {
		log.Fatalf("创建日志监控器失败: %v", err)
	}

	filterEngine := filter.NewFilterEngine(cfg.Filters.Keywords)

	notifier := webhook.NewNotifier(webhook.WebhookConfig{
		DingTalk: webhook.DingTalkConfig{
			WebhookURL: cfg.Webhook.DingTalk.WebhookURL,
			Secret:     cfg.DingTalk.Secret,
		},
		Slack: webhook.SlackConfig{
			WebhookURL: cfg.Webhook.Slack.WebhookURL,
			Channel:    cfg.Webhook.Slack.Channel,
		},
		Enabled: cfg.Webhook.Enabled,
	})

	var dash *dashboard.Dashboard
	var dashWg sync.WaitGroup
	if cfg.Dashboard.Enabled {
		dash = dashboard.NewDashboard(dashboard.Config{
			MaxLogs:       cfg.Dashboard.MaxLogs,
			MaxAlerts:     cfg.Dashboard.MaxAlertHistory,
			ContextWindow: cfg.Dashboard.ContextWindow,
		})
		dashWg.Add(1)
		go func() {
			defer dashWg.Done()
			addr := fmt.Sprintf("%s:%d", cfg.Dashboard.Host, cfg.Dashboard.Port)
			log.Printf("Web Dashboard 启动在 http://%s", addr)
			if err := dash.Start(addr); err != nil {
				log.Printf("Dashboard 启动失败: %v", err)
			}
		}()
	}

	if err := monitor.Start(); err != nil {
		log.Fatalf("启动日志监控失败: %v", err)
	}

	log.Printf("开始监控容器: %s", cfg.Docker.ContainerID)
	log.Printf("过滤关键字: %v", cfg.Filters.Keywords)

	var wg sync.WaitGroup

	wg.Add(1)
	go processLogs(ctx, &wg, logChan, alertChan, filterEngine, notifier, dash, cfg.Docker.ContainerID)

	if cfg.Webhook.Enabled {
		for i := 0; i < webhookWorkerNum; i++ {
			wg.Add(1)
			go webhookWorker(ctx, &wg, alertChan, notifier)
		}
	}

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("正在停止监控...")
	monitor.Stop()
	cancel()

	shutdownTimeout := time.After(5 * time.Second)
	done := make(chan struct{})
	go func() {
		wg.Wait()
		if dash != nil {
			dash.Stop()
			dashWg.Wait()
		}
		close(done)
	}()

	select {
	case <-done:
		log.Println("服务正常退出")
	case <-shutdownTimeout:
		log.Println("退出超时，强制关闭")
	}

	close(logChan)
	close(alertChan)
}

func processLogs(ctx context.Context, wg *sync.WaitGroup, logChan <-chan docker.LogMessage, alertChan chan<- webhook.AlertMessage, filterEngine *filter.FilterEngine, notifier *webhook.Notifier, dash *dashboard.Dashboard, containerID string) {
	defer wg.Done()

	droppedCount := 0
	lastReport := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case logMsg, ok := <-logChan:
			if !ok {
				return
			}

			var logID string
			if dash != nil {
				logID = dash.AddLog(logMsg.ContainerID, logMsg.Message, logMsg.StreamType, logMsg.Timestamp)
			}

			result := filterEngine.Filter(logMsg.Message)
			if result.Matched {
				if dash != nil && logID != "" {
					dash.AddAlert(logID, logMsg.ContainerID, logMsg.Message, logMsg.StreamType, result.Keywords)
				}

				alert := webhook.AlertMessage{
					Message:  logMsg.Message,
					Keywords: result.Keywords,
				}
				select {
				case alertChan <- alert:
				default:
					droppedCount++
				}

				fmt.Printf("\n[ALERT] 匹配到关键字 %v:\n%s\n", result.Keywords, logMsg.Message)
			} else {
				fmt.Printf("[%s] %s", logMsg.StreamType, logMsg.Message)
			}

			if droppedCount > 0 && time.Since(lastReport) > 30*time.Second {
				log.Printf("警告: 已丢弃 %d 个告警通知 (alertChan已满)", droppedCount)
				droppedCount = 0
				lastReport = time.Now()
			}
		}
	}
}

func webhookWorker(ctx context.Context, wg *sync.WaitGroup, alertChan <-chan webhook.AlertMessage, notifier *webhook.Notifier) {
	defer wg.Done()

	for {
		select {
		case <-ctx.Done():
			return
		case alert, ok := <-alertChan:
			if !ok {
				return
			}
			notifier.SendAlert(alert.Message, alert.Keywords)
		}
	}
}

func runList(cmd *cobra.Command, args []string) {
	containers, err := docker.ListContainers()
	if err != nil {
		log.Fatalf("获取容器列表失败: %v", err)
	}

	fmt.Println("Docker 容器列表:")
	for _, c := range containers {
		fmt.Printf("  - %s\n", c)
	}
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Println(err)
		os.Exit(1)
	}
}
