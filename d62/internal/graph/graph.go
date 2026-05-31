package graph

import (
	"deadlock-detector/internal/database"
	"fmt"
	"strings"
)

const (
	NodeStateUnvisited = iota
	NodeStateVisiting
	NodeStateVisited
)

type DependencyGraph struct {
	Nodes map[uint]*TaskNode
	Edges map[uint][]uint
}

type TaskNode struct {
	TaskID    uint
	TaskName  string
	Priority  int
	Status    database.TaskStatus
	HeldResources []string
	WaitResources []string
	InDegree  int
	OutDegree int
}

func NewDependencyGraph() *DependencyGraph {
	return &DependencyGraph{
		Nodes: make(map[uint]*TaskNode),
		Edges: make(map[uint][]uint),
	}
}

func (g *DependencyGraph) AddTask(task *database.Task) {
	g.Nodes[task.ID] = &TaskNode{
		TaskID:    task.ID,
		TaskName:  task.Name,
		Priority:  task.Priority,
		Status:    task.Status,
		HeldResources: []string{},
		WaitResources: []string{},
	}
}

func (g *DependencyGraph) AddDependency(fromTaskID, toTaskID uint) error {
	if _, exists := g.Nodes[fromTaskID]; !exists {
		return fmt.Errorf("task %d not found in graph", fromTaskID)
	}
	if _, exists := g.Nodes[toTaskID]; !exists {
		return fmt.Errorf("task %d not found in graph", toTaskID)
	}

	g.Edges[fromTaskID] = append(g.Edges[fromTaskID], toTaskID)
	
	if node, exists := g.Nodes[fromTaskID]; exists {
		node.OutDegree++
	}
	if node, exists := g.Nodes[toTaskID]; exists {
		node.InDegree++
	}

	return nil
}

func (g *DependencyGraph) AddResourceHold(taskID uint, resource string) {
	if node, exists := g.Nodes[taskID]; exists {
		node.HeldResources = append(node.HeldResources, resource)
	}
}

func (g *DependencyGraph) AddResourceWait(taskID uint, resource string) {
	if node, exists := g.Nodes[taskID]; exists {
		node.WaitResources = append(node.WaitResources, resource)
	}
}

func (g *DependencyGraph) RemoveTask(taskID uint) {
	delete(g.Nodes, taskID)

	delete(g.Edges, taskID)

	for fromID := range g.Edges {
		newEdges := []uint{}
		for _, toID := range g.Edges[fromID] {
			if toID != taskID {
				newEdges = append(newEdges, toID)
			} else {
				if node, exists := g.Nodes[toID]; exists {
					node.InDegree--
				}
			}
		}
		g.Edges[fromID] = newEdges
	}
}

func (g *DependencyGraph) GetDependencies(taskID uint) []uint {
	return g.Edges[taskID]
}

func (g *DependencyGraph) GetDependents(taskID uint) []uint {
	dependents := []uint{}
	for fromID, toIDs := range g.Edges {
		for _, toID := range toIDs {
			if toID == taskID {
				dependents = append(dependents, fromID)
			}
		}
	}
	return dependents
}

func (g *DependencyGraph) HasCycle() bool {
	state := make(map[uint]int)

	for taskID := range g.Nodes {
		if state[taskID] == NodeStateUnvisited {
			if g.hasCycleUtil(taskID, state) {
				return true
			}
		}
	}
	return false
}

func (g *DependencyGraph) hasCycleUtil(taskID uint, state map[uint]int) bool {
	state[taskID] = NodeStateVisiting

	for _, depID := range g.Edges[taskID] {
		if state[depID] == NodeStateVisiting {
			return true
		}
		if state[depID] == NodeStateUnvisited && g.hasCycleUtil(depID, state) {
			return true
		}
	}

	state[taskID] = NodeStateVisited
	return false
}

func (g *DependencyGraph) TopologicalSort() ([]uint, error) {
	result := []uint{}
	inDegree := make(map[uint]int)

	for taskID := range g.Nodes {
		inDegree[taskID] = g.Nodes[taskID].InDegree
	}

	queue := []uint{}
	for taskID, degree := range inDegree {
		if degree == 0 {
			queue = append(queue, taskID)
		}
	}

	for len(queue) > 0 {
		taskID := queue[0]
		queue = queue[1:]
		result = append(result, taskID)

		for _, depID := range g.Edges[taskID] {
			inDegree[depID]--
			if inDegree[depID] == 0 {
				queue = append(queue, depID)
			}
		}
	}

	if len(result) != len(g.Nodes) {
		return nil, fmt.Errorf("graph has cycle, cannot perform topological sort")
	}

	return result, nil
}

func (g *DependencyGraph) BuildFromDatabase() error {
	tasks, err := database.GetRunningTasks()
	if err != nil {
		return err
	}

	for _, task := range tasks {
		g.AddTask(&task)

		heldLocks, err := database.GetHeldLocksByTaskID(task.ID)
		if err != nil {
			continue
		}
		for _, lock := range heldLocks {
			g.AddResourceHold(task.ID, lock.Resource)
		}

		waitLocks, err := database.GetWaitingLocksByTaskID(task.ID)
		if err != nil {
			continue
		}
		for _, lock := range waitLocks {
			g.AddResourceWait(task.ID, lock.Resource)
		}
	}

	deps, err := database.BuildTaskDependencyGraph()
	if err != nil {
		return err
	}

	for taskID, depIDs := range deps {
		for _, depID := range depIDs {
			if _, exists := g.Nodes[taskID]; exists {
				if _, exists := g.Nodes[depID]; exists {
					g.AddDependency(taskID, depID)
				}
			}
		}
	}

	return nil
}

func (g *DependencyGraph) GetCycle() [][]uint {
	cycles := [][]uint{}
	state := make(map[uint]int)
	path := []uint{}

	for taskID := range g.Nodes {
		if state[taskID] == NodeStateUnvisited {
			g.dfsCycle(taskID, state, &path, &cycles)
		}
	}

	return cycles
}

func (g *DependencyGraph) dfsCycle(taskID uint, state map[uint]int, path *[]uint, cycles *[][]uint) {
	state[taskID] = NodeStateVisiting
	*path = append(*path, taskID)

	for _, neighbor := range g.Edges[taskID] {
		if state[neighbor] == NodeStateVisiting {
			cycleStart := -1
			for i, id := range *path {
				if id == neighbor {
					cycleStart = i
					break
				}
			}
			if cycleStart != -1 {
				cycle := make([]uint, len(*path)-cycleStart)
				copy(cycle, (*path)[cycleStart:])
				*cycles = append(*cycles, cycle)
			}
		} else if state[neighbor] == NodeStateUnvisited {
			g.dfsCycle(neighbor, state, path, cycles)
		}
	}

	*path = (*path)[:len(*path)-1]
	state[taskID] = NodeStateVisited
}

func (g *DependencyGraph) String() string {
	var sb strings.Builder
	sb.WriteString("Dependency Graph:\n")
	for taskID, node := range g.Nodes {
		sb.WriteString(fmt.Sprintf("  Task %d (%s):\n", taskID, node.TaskName))
		sb.WriteString(fmt.Sprintf("    Status: %s\n", node.Status))
		sb.WriteString(fmt.Sprintf("    Priority: %d\n", node.Priority))
		sb.WriteString(fmt.Sprintf("    Held Resources: %v\n", node.HeldResources))
		sb.WriteString(fmt.Sprintf("    Waiting Resources: %v\n", node.WaitResources))
		sb.WriteString(fmt.Sprintf("    Dependencies: %v\n", g.Edges[taskID]))
	}
	return sb.String()
}
