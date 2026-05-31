FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux go build -o fault-injection-engine ./cmd/server/main.go

FROM alpine:latest

RUN apk --no-cache add ca-certificates

WORKDIR /root/

COPY --from=builder /app/fault-injection-engine .
COPY --from=builder /app/configs ./configs

EXPOSE 8080

ENV SERVER_PORT=8080
ENV ETCD_ENDPOINTS=localhost:2379
ENV LOG_LEVEL=info

CMD ["./fault-injection-engine"]
