package configs

type Config struct {
	Server    ServerConfig
	MySQL     MySQLConfig
	Redis     RedisConfig
	Scheduler SchedulerConfig
	Email     EmailConfig
	Webhook   WebhookConfig
}

type ServerConfig struct {
	GRPCPort string
	HTTPPort string
}

type MySQLConfig struct {
	Host     string
	Port     int
	User     string
	Password string
	DBName   string
}

type RedisConfig struct {
	Addr     string
	Password string
	DB       int
}

type SchedulerConfig struct {
	WorkerCount int
}

type EmailConfig struct {
	Enabled  bool
	Host     string
	Port     int
	Username string
	Password string
	From     string
	To       []string
}

type WebhookConfig struct {
	Enabled bool
	URL     string
	Headers map[string]string
}

func NewDefaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			GRPCPort: ":50051",
			HTTPPort: ":8080",
		},
		MySQL: MySQLConfig{
			Host:     "localhost",
			Port:     3306,
			User:     "root",
			Password: "password",
			DBName:   "task_scheduler",
		},
		Redis: RedisConfig{
			Addr:     "localhost:6379",
			Password: "",
			DB:       0,
		},
		Scheduler: SchedulerConfig{
			WorkerCount: 5,
		},
		Email: EmailConfig{
			Enabled:  false,
			Host:     "smtp.example.com",
			Port:     587,
			Username: "user@example.com",
			Password: "password",
			From:     "alerts@example.com",
			To:       []string{"admin@example.com"},
		},
		Webhook: WebhookConfig{
			Enabled: false,
			URL:     "http://example.com/webhook",
			Headers: map[string]string{"Content-Type": "application/json"},
		},
	}
}
