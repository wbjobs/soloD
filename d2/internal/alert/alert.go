package alert

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/smtp"
	"time"

	"d2/internal/model"
)

type AlertLevel string

const (
	AlertLevelWarning AlertLevel = "warning"
	AlertLevelError   AlertLevel = "error"
	AlertLevelCritical AlertLevel = "critical"
)

type AlertMessage struct {
	TaskID      int64           `json:"task_id"`
	TaskName    string          `json:"task_name"`
	ExecutionID int64           `json:"execution_id"`
	Level       AlertLevel      `json:"level"`
	Message     string          `json:"message"`
	Error       string          `json:"error"`
	RetryCount  int32           `json:"retry_count"`
	Timestamp   time.Time       `json:"timestamp"`
}

type AlertChannel interface {
	Send(msg *AlertMessage) error
}

type EmailConfig struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	To       []string
}

type WebhookConfig struct {
	URL     string
	Headers map[string]string
}

type emailAlert struct {
	config EmailConfig
}

type webhookAlert struct {
	config WebhookConfig
}

type AlertManager struct {
	channels []AlertChannel
}

func NewAlertManager() *AlertManager {
	return &AlertManager{
		channels: make([]AlertChannel, 0),
	}
}

func (am *AlertManager) AddChannel(channel AlertChannel) {
	am.channels = append(am.channels, channel)
}

func (am *AlertManager) AlertFailure(task *model.Task, execution *model.TaskExecution) error {
	level := AlertLevelError
	if execution.RetryCount >= task.MaxRetry {
		level = AlertLevelCritical
	}

	msg := &AlertMessage{
		TaskID:      task.ID,
		TaskName:    task.Name,
		ExecutionID: execution.ID,
		Level:       level,
		Message:     fmt.Sprintf("任务执行失败: %s", task.Name),
		Error:       execution.ErrorMessage,
		RetryCount:  execution.RetryCount,
		Timestamp:   time.Now(),
	}

	var lastErr error
	for _, channel := range am.channels {
		if err := channel.Send(msg); err != nil {
			log.Printf("Failed to send alert via channel: %v", err)
			lastErr = err
		}
	}

	return lastErr
}

func NewEmailAlert(config EmailConfig) AlertChannel {
	return &emailAlert{config: config}
}

func (e *emailAlert) Send(msg *AlertMessage) error {
	if len(e.config.To) == 0 {
		return nil
	}

	subject := fmt.Sprintf("[%s] 任务失败告警: %s", msg.Level, msg.TaskName)
	
	body := e.buildEmailBody(msg)

	auth := smtp.PlainAuth("", e.config.Username, e.config.Password, e.config.Host)
	addr := fmt.Sprintf("%s:%d", e.config.Host, e.config.Port)

	return smtp.SendMail(addr, auth, e.config.From, e.config.To, []byte(body))
}

func (e *emailAlert) buildEmailBody(msg *AlertMessage) string {
	return fmt.Sprintf(`From: Task Scheduler <%s>
To: Recipients <%s>
Subject: %s
MIME-Version: 1.0
Content-Type: text/html; charset=UTF-8

<html>
<body>
<h2>任务执行失败告警</h2>
<table border="1" cellpadding="8" cellspacing="0">
<tr><td><strong>任务ID</strong></td><td>%d</td></tr>
<tr><td><strong>任务名称</strong></td><td>%s</td></tr>
<tr><td><strong>执行ID</strong></td><td>%d</td></tr>
<tr><td><strong>告警级别</strong></td><td>%s</td></tr>
<tr><td><strong>重试次数</strong></td><td>%d</td></tr>
<tr><td><strong>错误信息</strong></td><td>%s</td></tr>
<tr><td><strong>告警时间</strong></td><td>%s</td></tr>
</table>
</body>
</html>`,
		e.config.From,
		e.config.To[0],
		fmt.Sprintf("[%s] 任务失败告警: %s", msg.Level, msg.TaskName),
		msg.TaskID,
		msg.TaskName,
		msg.ExecutionID,
		msg.Level,
		msg.RetryCount,
		msg.Error,
		msg.Timestamp.Format("2006-01-02 15:04:05"),
	)
}

func NewWebhookAlert(config WebhookConfig) AlertChannel {
	if config.Headers == nil {
		config.Headers = make(map[string]string)
	}
	if _, ok := config.Headers["Content-Type"]; !ok {
		config.Headers["Content-Type"] = "application/json"
	}
	return &webhookAlert{config: config}
}

func (w *webhookAlert) Send(msg *AlertMessage) error {
	if w.config.URL == "" {
		return nil
	}

	payload := map[string]interface{}{
		"event_type":  "task_failure",
		"task_id":     msg.TaskID,
		"task_name":   msg.TaskName,
		"execution_id": msg.ExecutionID,
		"level":       msg.Level,
		"message":     msg.Message,
		"error":       msg.Error,
		"retry_count": msg.RetryCount,
		"timestamp":   msg.Timestamp.Format(time.RFC3339),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal webhook payload: %w", err)
	}

	req, err := http.NewRequest("POST", w.config.URL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create webhook request: %w", err)
	}

	for key, value := range w.config.Headers {
		req.Header.Set(key, value)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("webhook request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status: %d", resp.StatusCode)
	}

	return nil
}
