module istio-fault-injection-engine

go 1.21

require (
	go.etcd.io/etcd/client/v3 v3.5.10
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.4.0
	gopkg.in/yaml.v3 v3.0.1
	istio.io/api v0.0.0-20240101000000-abcdef123456
	istio.io/client-go v1.20.0
	k8s.io/apimachinery v0.29.0
	k8s.io/client-go v0.29.0
)
