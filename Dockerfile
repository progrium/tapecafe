FROM golang:1.24.5-alpine AS livekit-builder
RUN apk add --no-cache git build-base glib gstreamer-dev gst-plugins-base-dev gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav

WORKDIR /livekit
RUN git clone --depth 1 https://github.com/livekit/livekit.git -b v1.9.0
RUN git clone --depth 1 https://github.com/livekit/ingress.git -b v1.4.3

WORKDIR /livekit/livekit
RUN go mod download
RUN CGO_ENABLED=0 go build -o /livekit/livekit-server ./cmd/server

WORKDIR /livekit/ingress
RUN go mod download
RUN CGO_ENABLED=1 go build -o /livekit/ingress-server ./cmd/server


FROM golang:1.24.5-alpine AS tapecafe-builder
WORKDIR /app
RUN apk add --no-cache git
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o tapecafe .


FROM alpine:latest
RUN apk add --no-cache supervisor redis gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
COPY --from=tapecafe-builder /app/tapecafe /app/tapecafe
COPY --from=livekit-builder /livekit/livekit-server /app/livekit-server
COPY --from=livekit-builder /livekit/ingress-server /app/ingress-server
RUN mkdir -p /app /var/log
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY livekit-server.yml /app/livekit-server.yml
COPY livekit-ingress.yml /app/livekit-ingress.yml
EXPOSE 8080
WORKDIR /app
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]