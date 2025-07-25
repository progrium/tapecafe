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
RUN apk add --no-cache git nodejs npm
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN cd ui && npm install && npm run build
RUN CGO_ENABLED=0 go build -o tapecafe ./cmd/tapecafe


FROM alpine:latest
RUN apk add --no-cache supervisor redis gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-plugins-ugly gst-libav
COPY --from=tapecafe-builder /app/tapecafe /app/tapecafe
COPY --from=livekit-builder /livekit/livekit-server /usr/local/bin/livekit-server
COPY --from=livekit-builder /livekit/ingress-server /usr/local/bin/ingress
RUN mkdir -p /app /var/log
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY livekit-server.yml /app/livekit-server.yml
COPY livekit-ingress.yml /app/livekit-ingress.yml
EXPOSE 9091
WORKDIR /app
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
