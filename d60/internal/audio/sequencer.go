package audio

import (
	"container/heap"
	"sync"
	"time"
)

type ResultType int

const (
	ResultTypeTranscript ResultType = iota
	ResultTypeTranslation
)

type SegmentResult struct {
	SegmentID   int64
	Type        ResultType
	Text        string
	Translated  string
	Confidence  float32
	IsFinal     bool
	SourceLang  string
	TargetLang  string
	ReceivedAt  time.Time
}

type ResultQueue []*SegmentResult

func (rq ResultQueue) Len() int           { return len(rq) }
func (rq ResultQueue) Less(i, j int) bool { return rq[i].SegmentID < rq[j].SegmentID }
func (rq ResultQueue) Swap(i, j int)      { rq[i], rq[j] = rq[j], rq[i] }

func (rq *ResultQueue) Push(x interface{}) {
	*rq = append(*rq, x.(*SegmentResult))
}

func (rq *ResultQueue) Pop() interface{} {
	old := *rq
	n := len(old)
	item := old[n-1]
	*rq = old[0 : n-1]
	return item
}

type Sequencer struct {
	nextExpectedID int64
	queue          *ResultQueue
	pending        map[int64]*SegmentResult
	callback       func(*SegmentResult)
	maxQueueSize   int
	timeoutMs      int64
	mu             sync.Mutex
	done           chan struct{}
}

func NewSequencer(maxQueueSize int, timeoutMs int64) *Sequencer {
	s := &Sequencer{
		nextExpectedID: 1,
		queue:          &ResultQueue{},
		pending:        make(map[int64]*SegmentResult),
		maxQueueSize:   maxQueueSize,
		timeoutMs:      timeoutMs,
		done:           make(chan struct{}),
	}
	heap.Init(s.queue)

	go s.timeoutChecker()

	return s
}

func (s *Sequencer) SetCallback(callback func(*SegmentResult)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.callback = callback
}

func (s *Sequencer) Add(result *SegmentResult) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if result.SegmentID < s.nextExpectedID {
		return
	}

	result.ReceivedAt = time.Now()

	if result.SegmentID == s.nextExpectedID {
		s.emitResult(result)
		s.processQueue()
	} else {
		heap.Push(s.queue, result)
		s.pending[result.SegmentID] = result

		if s.queue.Len() > s.maxQueueSize {
			s.forceFlush()
		}
	}
}

func (s *Sequencer) processQueue() {
	for s.queue.Len() > 0 {
		top := (*s.queue)[0]
		if top.SegmentID == s.nextExpectedID {
			item := heap.Pop(s.queue).(*SegmentResult)
			delete(s.pending, item.SegmentID)
			s.emitResult(item)
		} else if top.SegmentID < s.nextExpectedID {
			heap.Pop(s.queue)
			delete(s.pending, top.SegmentID)
		} else {
			break
		}
	}
}

func (s *Sequencer) emitResult(result *SegmentResult) {
	if s.callback != nil {
		s.callback(result)
	}
	s.nextExpectedID = result.SegmentID + 1
}

func (s *Sequencer) forceFlush() {
	if s.queue.Len() == 0 {
		return
	}

	items := make([]*SegmentResult, 0, s.queue.Len())
	for s.queue.Len() > 0 {
		item := heap.Pop(s.queue).(*SegmentResult)
		items = append(items, item)
		delete(s.pending, item.SegmentID)
	}

	for _, item := range items {
		s.emitResult(item)
	}
}

func (s *Sequencer) timeoutChecker() {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			s.checkTimeouts()
		case <-s.done:
			return
		}
	}
}

func (s *Sequencer) checkTimeouts() {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	timeout := time.Duration(s.timeoutMs) * time.Millisecond

	for id, result := range s.pending {
		if now.Sub(result.ReceivedAt) > timeout {
			if id == s.nextExpectedID {
				s.emitResult(result)
				delete(s.pending, id)
				s.removeFromQueue(id)
				s.processQueue()
			}
		}
	}
}

func (s *Sequencer) removeFromQueue(segmentID int64) {
	for i, item := range *s.queue {
		if item.SegmentID == segmentID {
			heap.Remove(s.queue, i)
			break
		}
	}
}

func (s *Sequencer) Flush() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.forceFlush()
}

func (s *Sequencer) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.nextExpectedID = 1
	s.queue = &ResultQueue{}
	heap.Init(s.queue)
	s.pending = make(map[int64]*SegmentResult)
}

func (s *Sequencer) Close() {
	close(s.done)
}

func (s *Sequencer) PendingCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.queue.Len()
}

func (s *Sequencer) NextExpectedID() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.nextExpectedID
}
