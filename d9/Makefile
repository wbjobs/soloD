.PHONY: all build run proto tidy clean

all: build

build:
	@echo "Building server..."
	go build -o bin/server cmd/server/main.go
	@echo "Build complete!"

run:
	@echo "Starting server..."
	go run cmd/server/main.go

proto:
	@echo "Generating gRPC code..."
	protoc --go_out=. --go_opt=paths=source_relative \
		--go-grpc_out=. --go-grpc_opt=paths=source_relative \
		proto/cardgame.proto
	@echo "gRPC code generated!"

tidy:
	@echo "Tidying dependencies..."
	go mod tidy

clean:
	@echo "Cleaning up..."
	rm -rf bin/

test:
	@echo "Running tests..."
	go test -v ./...
