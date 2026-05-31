package model

type Node struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	Followers int     `json:"followers,omitempty"`
	Following int     `json:"following,omitempty"`
	Group     int     `json:"group,omitempty"`
	PageRank  float64 `json:"pageRank,omitempty"`
}

type Link struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Value  int    `json:"value,omitempty"`
}

type GraphData struct {
	Nodes    []Node `json:"nodes"`
	Links    []Link `json:"links"`
	Metadata struct {
		Platform  string `json:"platform"`
		RootUser  string `json:"rootUser"`
		NodeCount int    `json:"nodeCount"`
		LinkCount int    `json:"linkCount"`
	} `json:"metadata"`
}

type FetchRequest struct {
	Platform string `json:"platform" binding:"required,oneof=twitter github"`
	Username string `json:"username" binding:"required"`
	Depth    int    `json:"depth"`
}
