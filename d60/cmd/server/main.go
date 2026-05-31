package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"

	"voice-translation-gateway/internal/api"
	"voice-translation-gateway/internal/asr"
	config_manager "voice-translation-gateway/internal/config"
	grpcserver "voice-translation-gateway/internal/grpc"
	"voice-translation-gateway/internal/mt"
	"voice-translation-gateway/internal/websocket"
	"voice-translation-gateway/pkg/config"
)

func main() {
	cfg, err := config.Load("")
	if err != nil {
		log.Printf("Warning: %v, using default config", err)
		cfg = config.ExampleConfig()
	}

	configManager := config_manager.NewHotUpdateManager()

	asrFactory := asr.NewFactory()
	asrFactory.Register("paddle", asr.NewPaddleASRClient(asr.PaddleASRConfig{
		APIEndpoint: cfg.ASR.PaddleASR.APIEndpoint,
		APIKey:      cfg.ASR.PaddleASR.APIKey,
	}))
	asrFactory.Register("funasr", asr.NewFunASRClient(asr.FunASRConfig{
		APIEndpoint: cfg.ASR.FunASR.APIEndpoint,
	}))

	mtFactory := mt.NewFactory()
	mtFactory.Register("google", mt.NewGoogleTranslateClient(mt.GoogleTranslateConfig{
		APIKey: cfg.MT.GoogleTranslate.APIKey,
	}))
	mtFactory.Register("deepl", mt.NewDeepLClient(mt.DeepLConfig{
		APIKey:  cfg.MT.DeepL.APIKey,
		BaseURL: cfg.MT.DeepL.BaseURL,
	}))

	grpcServer := grpcserver.NewTranslationServer(cfg, asrFactory, mtFactory)

	go func() {
		log.Printf("Starting gRPC server on %s", cfg.Server.GRPCAddr)
		if err := grpcserver.ServeGRPC(cfg.Server.GRPCAddr, grpcServer); err != nil {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	wsServer := websocket.NewServer()

	apiHandler := api.NewAPIHandler(configManager)

	router := mux.NewRouter()

	router.HandleFunc(cfg.Server.WebSocketPath, wsServer.HandleWebSocket)

	apiRouter := router.PathPrefix("/api/v1").Subrouter()
	apiRouter.HandleFunc("/profiles", apiHandler.GetProfiles).Methods("GET")
	apiRouter.HandleFunc("/profiles/active", apiHandler.SetActiveProfile).Methods("POST")
	apiRouter.HandleFunc("/profiles/update", apiHandler.UpdateProfile).Methods("POST")
	apiRouter.HandleFunc("/profiles/export", apiHandler.ExportConfig).Methods("GET")
	apiRouter.HandleFunc("/profiles/import", apiHandler.ImportConfig).Methods("POST")

	apiRouter.HandleFunc("/abtest/start", apiHandler.StartABTest).Methods("POST")
	apiRouter.HandleFunc("/abtest/end", apiHandler.EndABTest).Methods("POST")

	apiRouter.HandleFunc("/bleu/calculate", apiHandler.CalculateBLEU).Methods("POST")
	apiRouter.HandleFunc("/languages/configs", apiHandler.GetLanguageConfigs).Methods("GET")

	apiRouter.HandleFunc("/sessions/stats", apiHandler.GetSessionStats).Methods("GET")
	apiRouter.HandleFunc("/sessions/update", apiHandler.UpdateSession).Methods("POST")

	router.PathPrefix("/").Handler(http.FileServer(http.Dir("./web")))

	go func() {
		log.Printf("Starting HTTP/WebSocket server on %s", cfg.Server.HTTPAddr)
		if err := http.ListenAndServe(cfg.Server.HTTPAddr, router); err != nil {
			log.Printf("HTTP server error: %v", err)
		}
	}()

	log.Println("Voice Translation Gateway started successfully")
	log.Println("  - Web UI: http://localhost" + cfg.Server.HTTPAddr)
	log.Println("  - WebSocket: ws://localhost" + cfg.Server.HTTPAddr + cfg.Server.WebSocketPath)
	log.Println("  - gRPC: " + cfg.Server.GRPCAddr)
	log.Println("  - API docs available at http://localhost" + cfg.Server.HTTPAddr + "/api/v1/")

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down servers...")
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}
