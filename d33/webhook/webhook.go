package webhook

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"
)

type AlertMessage struct {
	Message  string
	Keywords []string
}

type WebhookConfig struct {
	DingTalk DingTalkConfig
	Slack    SlackConfig
	Enabled  bool
}

type DingTalkConfig struct {
	WebhookURL string
	Secret     string
}

type SlackConfig struct {
	WebhookURL string
	Channel    string
}

type Notifier struct {
	config WebhookConfig
	client *http.Client
}

func NewNotifier(cfg WebhookConfig) *Notifier {
	return &Notifier{
		config: cfg,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (n *Notifier) SendAlert(message string, keywords []string) error {
	if !n.config.Enabled {
		return nil
	}

	if n.config.DingTalk.WebhookURL != "" {
		if err := n.sendToDingTalk(message, keywords); err != nil {
			fmt.Printf("Failed to send to DingTalk: %v\n", err)
		}
	}

	if n.config.Slack.WebhookURL != "" {
		if err := n.sendToSlack(message, keywords); err != nil {
			fmt.Printf("Failed to send to Slack: %v\n", err)
		}
	}

	return nil
}

func (n *Notifier) sendToDingTalk(message string, keywords []string) error {
	timestamp := strconv.FormatInt(time.Now().UnixMilli(), 10)
	sign := n.generateDingTalkSign(timestamp)

	url := n.config.DingTalk.WebhookURL + "&timestamp=" + timestamp + "&sign=" + sign

	payload := map[string]interface{}{
		"msgtype": "text",
		"text": map[string]string{
			"content": fmt.Sprintf("【日志告警】\n匹配关键字: %v\n\n日志内容:\n%s", keywords, message),
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := n.client.Post(url, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dingtalk returned status: %d", resp.StatusCode)
	}

	return nil
}

func (n *Notifier) generateDingTalkSign(timestamp string) string {
	stringToSign := timestamp + "\n" + n.config.DingTalk.Secret
	h := hmac.New(sha256.New, []byte(n.config.DingTalk.Secret))
	h.Write([]byte(stringToSign))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

func (n *Notifier) sendToSlack(message string, keywords []string) error {
	payload := map[string]interface{}{
		"channel": n.config.Slack.Channel,
		"text":    fmt.Sprintf("【日志告警】匹配关键字: %v", keywords),
		"attachments": []map[string]interface{}{
			{
				"color": "danger",
				"text":  message,
				"fields": []map[string]interface{}{
					{
						"title": "时间",
						"value": time.Now().Format("2006-01-02 15:04:05"),
						"short": true,
					},
					{
						"title": "匹配关键字",
						"value": fmt.Sprintf("%v", keywords),
						"short": true,
					},
				},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	resp, err := n.client.Post(n.config.Slack.WebhookURL, "application/json", bytes.NewBuffer(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("slack returned status: %d", resp.StatusCode)
	}

	return nil
}
