package detector

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestDiamondDependency_NoFalsePositive(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("A", "C")
	tg.AddEdge("B", "D")
	tg.AddEdge("C", "D")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Empty(t, cycles, "菱形依赖不应产生虚假死锁")
}

func TestSimpleCycle_Detected(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)

	tg.SetNodeLocks("A", []string{"res1"}, []string{"res2"})
	tg.SetNodeLocks("B", []string{"res2"}, []string{"res1"})

	tg.AddEdge("A", "B")
	tg.AddEdge("B", "A")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Len(t, cycles, 1, "应检测到A-B-A循环")
	assert.Contains(t, cycles[0].CycleStr, "A -> B")
}

func TestThreeNodeCycle_Detected(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("B", "C")
	tg.AddEdge("C", "A")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Len(t, cycles, 1, "应检测到A-B-C-A循环")
}

func TestMultipleIndependentCycles_Detected(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("B", "A")
	tg.AddEdge("C", "D")
	tg.AddEdge("D", "C")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Len(t, cycles, 2, "应检测到两个独立的循环")
}

func TestDiamondWithCycle_Detected(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("A", "C")
	tg.AddEdge("B", "D")
	tg.AddEdge("C", "D")
	tg.AddEdge("D", "B")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Len(t, cycles, 1, "应检测到B-D-B循环")
	assert.Contains(t, cycles[0].CycleStr, "B -> D")
}

func TestLinearChain_NoCycle(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("B", "C")
	tg.AddEdge("C", "D")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Empty(t, cycles, "线性链不应产生死锁")
}

func TestSelfLoop_Detected(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)

	tg.AddEdge("A", "A")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Len(t, cycles, 1, "应检测到自循环")
	assert.Equal(t, "A", cycles[0].CycleStr)
}

func TestEmptyGraph_NoCycle(t *testing.T) {
	tg := NewTaskGraph()

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Empty(t, cycles)
}

func TestSingleNodeNoEdges_NoCycle(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Empty(t, cycles)
}

func TestVictimSelection_BasedOnPriority(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 5, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)

	cycle := &DeadlockCycle{
		Tasks: []*TaskNode{
			tg.nodes["A"],
			tg.nodes["B"],
		},
	}

	victim := tg.SelectVictim(cycle)

	assert.Equal(t, "B", victim.TaskID, "应选择优先级更低的任务B")
}

func TestVictimSelection_BasedOnDuration(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 5000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)

	cycle := &DeadlockCycle{
		Tasks: []*TaskNode{
			tg.nodes["A"],
			tg.nodes["B"],
		},
	}

	victim := tg.SelectVictim(cycle)

	assert.Equal(t, "B", victim.TaskID, "应选择运行时间更短的任务B")
}

func TestVictimSelection_BasedOnResourceSize(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 10*1024*1024)
	tg.AddNode("B", "Task B", 1, 1000, 1*1024*1024)

	cycle := &DeadlockCycle{
		Tasks: []*TaskNode{
			tg.nodes["A"],
			tg.nodes["B"],
		},
	}

	victim := tg.SelectVictim(cycle)

	assert.Equal(t, "B", victim.TaskID, "应选择资源占用更小的任务B")
}

func TestComplexGraph_MultipleBranchesSharedNode(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)
	tg.AddNode("E", "Task E", 1, 1000, 1024)
	tg.AddNode("F", "Task F", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("A", "C")
	tg.AddEdge("B", "D")
	tg.AddEdge("C", "D")
	tg.AddEdge("D", "E")
	tg.AddEdge("E", "F")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Empty(t, cycles, "具有共享节点的复杂分支不应产生虚假死锁")
}

func TestBackEdgeToVisitedButNotInStack_NoFalsePositive(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("B", "C")
	tg.AddEdge("C", "D")
	tg.AddEdge("A", "D")

	cycles, err := tg.DetectDeadlocks()

	assert.NoError(t, err)
	assert.Empty(t, cycles, "指向已访问但不在栈中的节点不应判定为死锁")
}

func TestVisitState_ThreeStates(t *testing.T) {
	assert.Equal(t, Unvisited, VisitState(0))
	assert.Equal(t, Visiting, VisitState(1))
	assert.Equal(t, Visited, VisitState(2))
}

func TestAddNodeAndEdge(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddEdge("A", "B")

	assert.Contains(t, tg.nodes, "A")
	assert.Contains(t, tg.nodes, "B")
	assert.Contains(t, tg.edges["A"], "B")
}

func TestSetNodeLocks(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.SetNodeLocks("A", []string{"res1", "res2"}, []string{"res3"})

	assert.Equal(t, []string{"res1", "res2"}, tg.nodes["A"].HeldLocks)
	assert.Equal(t, []string{"res3"}, tg.nodes["A"].WaitingFor)
}

func TestWaitLevel_Calculation(t *testing.T) {
	sm := NewStrategyManager()
	cfg := sm.GetConfig()

	level1Duration := int64(cfg.Level1ThresholdSec-1) * 1000
	level1 := sm.CalculateWaitLevel(level1Duration)
	assert.Equal(t, WaitLevel1, level1)

	level2Duration := int64((cfg.Level1ThresholdSec + cfg.Level2ThresholdSec) / 2) * 1000
	level2 := sm.CalculateWaitLevel(level2Duration)
	assert.Equal(t, WaitLevel2, level2)

	level3Duration := int64(cfg.Level3ThresholdSec+10) * 1000
	level3 := sm.CalculateWaitLevel(level3Duration)
	assert.Equal(t, WaitLevel3, level3)
}

func TestLinearRegressionSlope(t *testing.T) {
	sm := NewStrategyManager()
	p := NewDeadlockPredictor(sm)

	values1 := []float64{10, 20, 30, 40, 50}
	slope1 := p.calculateLinearRegressionSlope(values1)
	assert.True(t, slope1 > 0, "上升趋势斜率应为正")

	values2 := []float64{50, 40, 30, 20, 10}
	slope2 := p.calculateLinearRegressionSlope(values2)
	assert.True(t, slope2 < 0, "下降趋势斜率应为负")

	values3 := []float64{10, 10, 10, 10, 10}
	slope3 := p.calculateLinearRegressionSlope(values3)
	assert.InDelta(t, 0, slope3, 0.01, "平稳趋势斜率接近0")
}

func TestVictimSelection_Priority(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 5, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 3, 1000, 1024)

	cycle := &DeadlockCycle{
		Tasks: []*TaskNode{
			tg.nodes["A"],
			tg.nodes["B"],
			tg.nodes["C"],
		},
	}

	victim := tg.SelectVictim(cycle)
	assert.Equal(t, "B", victim.TaskID, "应选择优先级最低的任务B")
}

func TestVictimSelection_MultipleFactors(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 3, 5000, 1024)
	tg.AddNode("B", "Task B", 3, 1000, 1024)
	tg.AddNode("C", "Task C", 3, 2000, 1024)

	cycle := &DeadlockCycle{
		Tasks: []*TaskNode{
			tg.nodes["A"],
			tg.nodes["B"],
			tg.nodes["C"],
		},
	}

	victim := tg.SelectVictim(cycle)
	assert.Equal(t, "B", victim.TaskID, "相同优先级应选择运行时间最短的任务B")
}

func TestVisitState_Enum(t *testing.T) {
	assert.Equal(t, VisitState(0), Unvisited)
	assert.Equal(t, VisitState(1), Visiting)
	assert.Equal(t, VisitState(2), Visited)
}

func TestDeadlockCycle_Resources(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.SetNodeLocks("A", []string{"res1"}, []string{"res2"})
	tg.SetNodeLocks("B", []string{"res2"}, []string{"res1"})

	tg.AddEdge("A", "B")
	tg.AddEdge("B", "A")

	cycles, _ := tg.DetectDeadlocks()
	assert.Len(t, cycles, 1)
	assert.Contains(t, cycles[0].CycleStr, "A")
	assert.Contains(t, cycles[0].CycleStr, "B")
}

func TestDiamondWithCycleDetection(t *testing.T) {
	tg := NewTaskGraph()

	tg.AddNode("A", "Task A", 1, 1000, 1024)
	tg.AddNode("B", "Task B", 1, 1000, 1024)
	tg.AddNode("C", "Task C", 1, 1000, 1024)
	tg.AddNode("D", "Task D", 1, 1000, 1024)

	tg.AddEdge("A", "B")
	tg.AddEdge("A", "C")
	tg.AddEdge("B", "D")
	tg.AddEdge("C", "D")
	tg.AddEdge("D", "B")

	cycles, _ := tg.DetectDeadlocks()
	assert.Len(t, cycles, 1)
	assert.Contains(t, cycles[0].CycleStr, "B -> D")
}

func TestStrategyManager_DefaultConfig(t *testing.T) {
	sm := NewStrategyManager()
	cfg := sm.GetConfig()

	assert.True(t, cfg.IsActive)
	assert.Equal(t, "default_strategy", cfg.ConfigName)
	assert.Equal(t, 30, cfg.Level1ThresholdSec)
	assert.Equal(t, 120, cfg.Level2ThresholdSec)
	assert.True(t, cfg.Level3TriggerAlert)
	assert.True(t, cfg.PredictEnabled)
}

func TestDingtalkSign_Generation(t *testing.T) {
	timestamp := int64(1620000000000)
	secret := "testsecret123"

	sign := generateDingtalkSign(timestamp, secret)
	assert.NotEmpty(t, sign)
}

