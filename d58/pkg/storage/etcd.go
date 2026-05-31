package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"path"
	"time"

	"go.etcd.io/etcd/client/v3"
	"istio-fault-injection-engine/pkg/models"
)

const (
	rulesPrefix    = "/fault-injection/rules/"
	versionsPrefix = "/fault-injection/versions/"
	logsPrefix     = "/fault-injection/logs/"
)

type EtcdStore struct {
	client *clientv3.Client
	kv     clientv3.KV
	lease  clientv3.Lease
}

func NewEtcdStore(endpoints []string) (*EtcdStore, error) {
	client, err := clientv3.New(clientv3.Config{
		Endpoints:   endpoints,
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create etcd client: %w", err)
	}

	return &EtcdStore{
		client: client,
		kv:     clientv3.NewKV(client),
		lease:  clientv3.NewLease(client),
	}, nil
}

func (s *EtcdStore) Close() error {
	return s.client.Close()
}

func (s *EtcdStore) CreateRule(ctx context.Context, rule *models.FaultRule) error {
	key := rulesPrefix + rule.ID
	data, err := json.Marshal(rule)
	if err != nil {
		return fmt.Errorf("failed to marshal rule: %w", err)
	}

	txn := s.kv.Txn(ctx).
		If(clientv3.Compare(clientv3.CreateRevision(key), "=", 0)).
		Then(clientv3.OpPut(key, string(data)))

	resp, err := txn.Commit()
	if err != nil {
		return fmt.Errorf("failed to create rule: %w", err)
	}
	if !resp.Succeeded {
		return fmt.Errorf("rule already exists: %s", rule.ID)
	}

	return s.CreateVersion(ctx, rule)
}

func (s *EtcdStore) GetRule(ctx context.Context, id string) (*models.FaultRule, error) {
	key := rulesPrefix + id
	resp, err := s.kv.Get(ctx, key)
	if err != nil {
		return nil, fmt.Errorf("failed to get rule: %w", err)
	}
	if len(resp.Kvs) == 0 {
		return nil, fmt.Errorf("rule not found: %s", id)
	}

	var rule models.FaultRule
	if err := json.Unmarshal(resp.Kvs[0].Value, &rule); err != nil {
		return nil, fmt.Errorf("failed to unmarshal rule: %w", err)
	}

	return &rule, nil
}

func (s *EtcdStore) UpdateRule(ctx context.Context, rule *models.FaultRule) error {
	rule.Version++
	rule.UpdatedAt = time.Now()

	key := rulesPrefix + rule.ID
	data, err := json.Marshal(rule)
	if err != nil {
		return fmt.Errorf("failed to marshal rule: %w", err)
	}

	_, err = s.kv.Put(ctx, key, string(data))
	if err != nil {
		return fmt.Errorf("failed to update rule: %w", err)
	}

	return s.CreateVersion(ctx, rule)
}

func (s *EtcdStore) DeleteRule(ctx context.Context, id string) error {
	key := rulesPrefix + id
	_, err := s.kv.Delete(ctx, key)
	if err != nil {
		return fmt.Errorf("failed to delete rule: %w", err)
	}
	return nil
}

func (s *EtcdStore) ListRules(ctx context.Context, namespace, service string) ([]*models.FaultRule, error) {
	resp, err := s.kv.Get(ctx, rulesPrefix, clientv3.WithPrefix())
	if err != nil {
		return nil, fmt.Errorf("failed to list rules: %w", err)
	}

	var rules []*models.FaultRule
	for _, kv := range resp.Kvs {
		var rule models.FaultRule
		if err := json.Unmarshal(kv.Value, &rule); err != nil {
			continue
		}

		if namespace != "" && rule.Namespace != namespace {
			continue
		}
		if service != "" && rule.Service != service {
			continue
		}

		rules = append(rules, &rule)
	}

	return rules, nil
}

func (s *EtcdStore) CreateVersion(ctx context.Context, rule *models.FaultRule) error {
	version := models.NewRuleVersion(rule)
	key := path.Join(versionsPrefix, rule.ID, fmt.Sprintf("%d", rule.Version))
	
	data, err := json.Marshal(version)
	if err != nil {
		return fmt.Errorf("failed to marshal version: %w", err)
	}

	_, err = s.kv.Put(ctx, key, string(data))
	if err != nil {
		return fmt.Errorf("failed to create version: %w", err)
	}

	return nil
}

func (s *EtcdStore) GetVersions(ctx context.Context, ruleID string) ([]*models.RuleVersion, error) {
	key := path.Join(versionsPrefix, ruleID, "")
	resp, err := s.kv.Get(ctx, key, clientv3.WithPrefix())
	if err != nil {
		return nil, fmt.Errorf("failed to get versions: %w", err)
	}

	var versions []*models.RuleVersion
	for _, kv := range resp.Kvs {
		var version models.RuleVersion
		if err := json.Unmarshal(kv.Value, &version); err != nil {
			continue
		}
		versions = append(versions, &version)
	}

	return versions, nil
}

func (s *EtcdStore) RollbackToVersion(ctx context.Context, ruleID string, targetVersion int64) error {
	versionKey := path.Join(versionsPrefix, ruleID, fmt.Sprintf("%d", targetVersion))
	resp, err := s.kv.Get(ctx, versionKey)
	if err != nil {
		return fmt.Errorf("failed to get version: %w", err)
	}
	if len(resp.Kvs) == 0 {
		return fmt.Errorf("version not found: %d", targetVersion)
	}

	var version models.RuleVersion
	if err := json.Unmarshal(resp.Kvs[0].Value, &version); err != nil {
		return fmt.Errorf("failed to unmarshal version: %w", err)
	}

	currentRule, err := s.GetRule(ctx, ruleID)
	if err != nil {
		return err
	}

	version.Data.ID = currentRule.ID
	version.Data.Version = currentRule.Version + 1
	version.Data.UpdatedAt = time.Now()

	ruleKey := rulesPrefix + ruleID
	data, err := json.Marshal(version.Data)
	if err != nil {
		return fmt.Errorf("failed to marshal rule for rollback: %w", err)
	}

	_, err = s.kv.Put(ctx, ruleKey, string(data))
	if err != nil {
		return fmt.Errorf("failed to rollback rule: %w", err)
	}

	return s.CreateVersion(ctx, version.Data)
}

func (s *EtcdStore) CreateLog(ctx context.Context, log *models.FaultLog) error {
	key := path.Join(logsPrefix, log.ID)
	data, err := json.Marshal(log)
	if err != nil {
		return fmt.Errorf("failed to marshal log: %w", err)
	}

	_, err = s.kv.Put(ctx, key, string(data))
	if err != nil {
		return fmt.Errorf("failed to create log: %w", err)
	}

	return nil
}

func (s *EtcdStore) ListLogs(ctx context.Context, ruleID string, startTime, endTime time.Time, limit int64) ([]*models.FaultLog, error) {
	resp, err := s.kv.Get(ctx, logsPrefix, clientv3.WithPrefix(), clientv3.WithLimit(limit))
	if err != nil {
		return nil, fmt.Errorf("failed to list logs: %w", err)
	}

	var logs []*models.FaultLog
	for _, kv := range resp.Kvs {
		var log models.FaultLog
		if err := json.Unmarshal(kv.Value, &log); err != nil {
			continue
		}

		if ruleID != "" && log.RuleID != ruleID {
			continue
		}
		if !startTime.IsZero() && log.TriggeredAt.Before(startTime) {
			continue
		}
		if !endTime.IsZero() && log.TriggeredAt.After(endTime) {
			continue
		}

		logs = append(logs, &log)
	}

	return logs, nil
}

func (s *EtcdStore) WatchRules(ctx context.Context) clientv3.WatchChan {
	watcher := clientv3.NewWatcher(s.client)
	return watcher.Watch(ctx, rulesPrefix, clientv3.WithPrefix())
}
