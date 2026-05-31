package filter

import (
	"strings"
	"sync"
)

type FilterEngine struct {
	keywords []string
	mu       sync.RWMutex
}

type FilterResult struct {
	Matched  bool
	Keywords []string
}

func NewFilterEngine(keywords []string) *FilterEngine {
	return &FilterEngine{
		keywords: keywords,
	}
}

func (fe *FilterEngine) Filter(message string) FilterResult {
	fe.mu.RLock()
	defer fe.mu.RUnlock()

	var matchedKeywords []string
	for _, kw := range fe.keywords {
		if strings.Contains(message, kw) {
			matchedKeywords = append(matchedKeywords, kw)
		}
	}

	return FilterResult{
		Matched:  len(matchedKeywords) > 0,
		Keywords: matchedKeywords,
	}
}

func (fe *FilterEngine) AddKeyword(keyword string) {
	fe.mu.Lock()
	defer fe.mu.Unlock()

	for _, kw := range fe.keywords {
		if kw == keyword {
			return
		}
	}
	fe.keywords = append(fe.keywords, keyword)
}

func (fe *FilterEngine) RemoveKeyword(keyword string) {
	fe.mu.Lock()
	defer fe.mu.Unlock()

	for i, kw := range fe.keywords {
		if kw == keyword {
			fe.keywords = append(fe.keywords[:i], fe.keywords[i+1:]...)
			return
		}
	}
}

func (fe *FilterEngine) GetKeywords() []string {
	fe.mu.RLock()
	defer fe.mu.RUnlock()

	result := make([]string, len(fe.keywords))
	copy(result, fe.keywords)
	return result
}
