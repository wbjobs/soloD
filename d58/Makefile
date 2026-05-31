.PHONY: all build test clean docker-build docker-push deploy

APP_NAME = istio-fault-injection-engine
DOCKER_REGISTRY = your-registry.com
VERSION = $(shell git describe --tags --always --dirty 2>/dev/null || echo "latest")

all: build

build:
	go build -o bin/$(APP_NAME) ./cmd/server/main.go

test:
	go test -v ./pkg/...

clean:
	rm -rf bin/

docker-build:
	docker build -t $(DOCKER_REGISTRY)/$(APP_NAME):$(VERSION) .
	docker tag $(DOCKER_REGISTRY)/$(APP_NAME):$(VERSION) $(DOCKER_REGISTRY)/$(APP_NAME):latest

docker-push:
	docker push $(DOCKER_REGISTRY)/$(APP_NAME):$(VERSION)
	docker push $(DOCKER_REGISTRY)/$(APP_NAME):latest

run:
	go run cmd/server/main.go

deploy:
	kubectl apply -f deploy/kubernetes/deployment.yaml

undeploy:
	kubectl delete -f deploy/kubernetes/deployment.yaml

fmt:
	go fmt ./...

vet:
	go vet ./...

lint: fmt vet
	golangci-lint run ./...
