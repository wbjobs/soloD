package handler

import (
	"math/rand"
	"net/http"
	"social-graph/backend/model"
	"time"

	"github.com/gin-gonic/gin"
)

var twitterUsers = []string{
	"elonmusk", "BillGates", "tim_cook", "satyanadella", "JeffBezos",
	"BarackObama", "justinbieber", "katyperry", "rihanna", "ladygaga",
	"narendramodi", "POTUS", "KingJames", "NASA", "Microsoft",
	"Google", "Apple", "amazon", "Meta", "Tesla",
	"SpaceX", "YouTube", "Twitter", "LinkedIn", "Netflix",
	"GitHub", "StackOverflow", "realdonaldtrump", "BernieSanders", "JoeBiden",
}

var githubUsers = []string{
	"torvalds", "gaearon", "sindresorhus", "yyx990803", "tj",
	"getify", "bradtraversy", "wesbos", "dan_abramov", "kentcdodds",
	"addyosmani", "paulirish", "rachelandrew", "chriscoyier", "jashkenas",
	"dhh", "davideast", "leereilly", "mdo", "fat",
	"pengwynn", "haacked", "shanselman", "scottgu", "gvanrossum",
	"brendaneich", "douglascrockford", "ericelliott", "mpjme", "jeresig",
}

func init() {
	rand.Seed(time.Now().UnixNano())
}

func HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":  "ok",
		"message": "Social Graph API is running",
	})
}

func FetchGraph(c *gin.Context) {
	var req model.FetchRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Depth <= 0 || req.Depth > 3 {
		req.Depth = 2
	}

	var userPool := getPlatformUsers(req.Platform)
	graphData := generateGraphData(req.Platform, req.Username, req.Depth, userPool)

	c.JSON(http.StatusOK, graphData)
}

func getPlatformUsers(platform string) []string {
	if platform == "github" {
		return githubUsers
	}
	return twitterUsers
}

func generateGraphData(platform, rootUser string, depth int, userPool []string) model.GraphData {
	var nodes []model.Node
	var links []model.Link
	nodeMap := make(map[string]bool)

	rootNode := model.Node{
		ID:        rootUser,
		Username:  rootUser,
		Followers: rand.Intn(1000000) + 10000,
		Following: rand.Intn(5000) + 100,
		Group:     0,
	}
	nodes = append(nodes, rootNode)
	nodeMap[rootUser] = true

	currentLevel := []string{rootUser}

	for d := 1; d <= depth; d++ {
		nextLevel := []string{}
		numFollow := 5 + rand.Intn(8)

		for _, user := range currentLevel {
			for i := 0; i < numFollow; i++ {
				followedUser := getRandomUser(userPool, nodeMap)
				if followedUser == "" {
					continue
				}

				newNode := model.Node{
					ID:        followedUser,
					Username:  followedUser,
					Followers: rand.Intn(500000) + 1000,
					Following: rand.Intn(2000) + 50,
					Group:     d,
				}
				nodes = append(nodes, newNode)
				nodeMap[followedUser] = true

				link := model.Link{
					Source: user,
					Target: followedUser,
					Value:  1,
				}
				links = append(links, link)

				if d < depth {
					nextLevel = append(nextLevel, followedUser)
				}
			}
		}

		currentLevel = nextLevel
		if len(currentLevel) > 15 {
			currentLevel = currentLevel[:15]
		}
	}

	addRandomConnections(&nodes, &links, nodeMap)

	calculatePageRank(&nodes, &links)

	var graphData model.GraphData
	graphData.Nodes = nodes
	graphData.Links = links
	graphData.Metadata.Platform = platform
	graphData.Metadata.RootUser = rootUser
	graphData.Metadata.NodeCount = len(nodes)
	graphData.Metadata.LinkCount = len(links)

	return graphData
}

func calculatePageRank(nodes *[]model.Node, links *[]model.Link) {
	n := len(*nodes)
	if n == 0 {
		return
	}

	damping := 0.85
	iterations := 50
	tolerance := 0.0001

	nodeIndex := make(map[string]int)
	for i, node := range *nodes {
		nodeIndex[node.ID] = i
	}

	inLinks := make([][]int, n)
	outDegree := make([]int, n)

	for _, link := range *links {
		srcIdx, srcOk := nodeIndex[link.Source]
		tgtIdx, tgtOk := nodeIndex[link.Target]
		if srcOk && tgtOk {
			inLinks[tgtIdx] = append(inLinks[tgtIdx], srcIdx)
			outDegree[srcIdx]++
		}
	}

	rank := make([]float64, n)
	for i := range rank {
		rank[i] = 1.0 / float64(n)
	}

	for iter := 0; iter < iterations; iter++ {
		newRank := make([]float64, n)
		for i := range newRank {
			newRank[i] = (1 - damping) / float64(n)
		}

		for i := 0; i < n; i++ {
			if outDegree[i] > 0 {
				share := rank[i] / float64(outDegree[i])
				for j := range inLinks {
					for _, src := range inLinks[j] {
						if src == i {
							newRank[j] += damping * share
						}
					}
				}
			} else {
				share := rank[i] / float64(n)
				for j := range newRank {
					newRank[j] += damping * share
				}
			}
		}

		diff := 0.0
		for i := range rank {
			diff += abs(rank[i] - newRank[i])
		}
		rank = newRank

		if diff < tolerance {
			break
		}
	}

	maxRank := 0.0
	for _, r := range rank {
		if r > maxRank {
			maxRank = r
		}
	}
	if maxRank > 0 {
		for i := range rank {
			rank[i] = rank[i] / maxRank
		}
	}

	for i := range *nodes {
		(*nodes)[i].PageRank = rank[i]
	}
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}

func getRandomUser(userPool []string, nodeMap map[string]bool) string {
	if len(userPool) == 0 {
		return ""
	}
	attempts := 0
	for attempts < 100 {
		user := userPool[rand.Intn(len(userPool))]
		if !nodeMap[user] {
			return user
		}
		attempts++
	}
	return ""
}

func addRandomConnections(nodes *[]model.Node, links *[]model.Link, nodeMap map[string]bool) {
	nodeList := make([]string, 0, len(nodeMap))
	for user := range nodeMap {
		nodeList = append(nodeList, user)
	}

	if len(nodeList) < 2 {
		return
	}

	extraLinks := len(nodeList) / 4
	for i := 0; i < extraLinks; i++ {
		source := nodeList[rand.Intn(len(nodeList))]
		target := nodeList[rand.Intn(len(nodeList))]
		if source != target {
			exists := false
			for _, l := range *links {
				if (l.Source == source && l.Target == target) || (l.Source == target && l.Target == source) {
					exists = true
					break
				}
			}
			if !exists {
				*links = append(*links, model.Link{
					Source: source,
					Target: target,
					Value:  1,
				})
			}
		}
	}
}
