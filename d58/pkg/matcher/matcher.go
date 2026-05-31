package matcher

import (
	"crypto/rand"
	"math/big"
	"net"
	"regexp"
	"strings"
	"time"

	"istio-fault-injection-engine/pkg/models"
)

type RequestContext struct {
	Headers    map[string]string
	SourceIP   string
	Path       string
	Method     string
	UserID     string
	RequestTime time.Time
}

type Matcher struct{}

func NewMatcher() *Matcher {
	return &Matcher{}
}

func (m *Matcher) MatchRule(rule *models.FaultRule, req *RequestContext) bool {
	if !rule.Enabled {
		return false
	}

	if !m.matchCanary(&rule.CanaryMode, req) {
		return false
	}

	return m.matchConfig(&rule.Match, req)
}

func (m *Matcher) matchCanary(canary *models.CanaryConfig, req *RequestContext) bool {
	if !canary.Enabled {
		return true
	}

	for key, expectedValue := range canary.Header {
		actualValue, exists := req.Headers[key]
		if !exists || actualValue != expectedValue {
			return false
		}
	}

	return true
}

func (m *Matcher) matchConfig(match *models.MatchConfig, req *RequestContext) bool {
	if !m.matchHeaders(match.Headers, req.Headers) {
		return false
	}

	if !m.matchSourceIP(match.SourceIP, req.SourceIP) {
		return false
	}

	if !m.matchTimeWindow(match.TimeWindow, req.RequestTime) {
		return false
	}

	if !m.matchPercentage(match.Percentage) {
		return false
	}

	if !m.matchPaths(match.Paths, req.Path) {
		return false
	}

	if !m.matchUserIDs(match.UserIDs, req.UserID) {
		return false
	}

	return true
}

func (m *Matcher) matchHeaders(expected map[string]models.StringMatch, actual map[string]string) bool {
	if len(expected) == 0 {
		return true
	}

	for key, match := range expected {
		value, exists := actual[key]
		if !exists {
			return false
		}
		if !m.matchString(match, value) {
			return false
		}
	}

	return true
}

func (m *Matcher) matchString(match models.StringMatch, value string) bool {
	if match.Exact != "" {
		return match.Exact == value
	}
	if match.Prefix != "" {
		return strings.HasPrefix(value, match.Prefix)
	}
	if match.Regex != "" {
		matched, _ := regexp.MatchString(match.Regex, value)
		return matched
	}
	return false
}

func (m *Matcher) matchSourceIP(allowedIPs []string, actualIP string) bool {
	if len(allowedIPs) == 0 {
		return true
	}

	ip := net.ParseIP(actualIP)
	if ip == nil {
		return false
	}

	for _, cidr := range allowedIPs {
		if strings.Contains(cidr, "/") {
			_, ipNet, err := net.ParseCIDR(cidr)
			if err == nil && ipNet.Contains(ip) {
				return true
			}
		} else {
			if cidr == actualIP {
				return true
			}
		}
	}

	return false
}

func (m *Matcher) matchTimeWindow(window *models.TimeWindow, requestTime time.Time) bool {
	if window == nil {
		return true
	}

	loc := time.Local
	if window.Timezone != "" {
		if l, err := time.LoadLocation(window.Timezone); err == nil {
			loc = l
		}
	}

	currentTime := requestTime.In(loc)
	startTime, err := time.ParseInLocation("15:04:05", window.StartTime, loc)
	if err != nil {
		return true
	}
	endTime, err := time.ParseInLocation("15:04:05", window.EndTime, loc)
	if err != nil {
		return true
	}

	currentSeconds := currentTime.Hour()*3600 + currentTime.Minute()*60 + currentTime.Second()
	startSeconds := startTime.Hour()*3600 + startTime.Minute()*60 + startTime.Second()
	endSeconds := endTime.Hour()*3600 + endTime.Minute()*60 + endTime.Second()

	if startSeconds <= endSeconds {
		return currentSeconds >= startSeconds && currentSeconds <= endSeconds
	} else {
		return currentSeconds >= startSeconds || currentSeconds <= endSeconds
	}
}

func (m *Matcher) matchPercentage(percentage float64) bool {
	if percentage <= 0 {
		return false
	}
	if percentage >= 100 {
		return true
	}

	max := big.NewInt(10000)
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return false
	}

	return float64(n.Int64())/100.0 < percentage
}

func (m *Matcher) matchPaths(paths []models.StringMatch, actualPath string) bool {
	if len(paths) == 0 {
		return true
	}

	for _, pathMatch := range paths {
		if m.matchString(pathMatch, actualPath) {
			return true
		}
	}

	return false
}

func (m *Matcher) matchUserIDs(userIDs []string, actualUserID string) bool {
	if len(userIDs) == 0 {
		return true
	}

	for _, id := range userIDs {
		if id == actualUserID {
			return true
		}
	}

	return false
}
