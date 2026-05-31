package main

type Message struct {
	Type     string      `json:"type"`
	RoomID   string      `json:"roomId,omitempty"`
	Username string      `json:"username,omitempty"`
	Data     interface{} `json:"data,omitempty"`
	Target   string      `json:"target,omitempty"`
	Sender   string      `json:"sender,omitempty"`
	Locked   bool        `json:"locked,omitempty"`
	Creator  string      `json:"creator,omitempty"`
}
