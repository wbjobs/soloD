package callback

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"d2/internal/model"
)

type CallbackPayload struct {
	ExecutionID int64           `json:"execution_id"`
	TaskID      int64           `json:"task_id"`
	Status      ExecutionStatus `json:"status"`
	Result      string          `json:"result"`
	Error       string          `json:"error"`
	StartTime   *time.Time      `json:"start_time"`
	EndTime     *time.Time      `json:"end_time"`
	RetryCount  int32           `json:"retry_count"`
}

type ExecutionStatus string

const (
	ExecutionStatusRunning ExecutionStatus = "RUNNING"
	ExecutionStatusSuccess ExecutionStatus = "SUCCESS"
	ExecutionStatusFailed  ExecutionStatus = "FAILED"
	ExecutionStatusTimeout ExecutionStatus = "TIMEOUT"
)

type Notifier interface {
	Notify(callbackURL string, execution *model.TaskExecution) error
}

type httpNotifier struct {
	client *http.Client
}

func NewHTTPNotifier() Notifier {
	return &httpNotifier{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (n *httpNotifier) Notify(callbackURL string, execution *model.TaskExecution) error {
	if callbackURL == "" {
		return nil
	}

	payload := n.buildPayload(execution)
	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal callback payload: %w", err)
	}

	req, err := http.NewRequest("POST", callbackURL, bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to create callback request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Task-ID", fmt.Sprintf("%d", execution.TaskID))
	req.Header.Set("X-Execution-ID", fmt.Sprintf("%d", execution.ID))

	resp, err := n.client.Do(req)
	if err != nil {
		return fmt.Errorf("callback request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("callback returned non-success status: %d", resp.StatusCode)
	}

	return nil
}

func (n *httpNotifier) buildPayload(execution *model.TaskExecution) CallbackPayload {
	var status ExecutionStatus
	switch execution.Status {
	case model.ExecutionStatusRunning:
		status = ExecutionStatusRunning
	case model.ExecutionStatusSuccess:
		status = ExecutionStatusSuccess
	case model.ExecutionStatusFailed:
		status = ExecutionStatusFailed
	case model.ExecutionStatusTimeout:
		status = ExecutionStatusTimeout
	default:
		status = ExecutionStatusFailed
	}

	return CallbackPayload{
		ExecutionID: execution.ID,
		TaskID:      execution.TaskID,
		Status:      status,
		Result:      execution.Result,
		Error:       execution.ErrorMessage,
		StartTime:   execution.StartTime,
		EndTime:     execution.EndTime,
		RetryCount:  execution.RetryCount,
	}
}
