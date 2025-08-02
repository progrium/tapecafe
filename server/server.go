package server

import (
	"io"
	"log"
	"net"
	"net/http"
	"net/url"

	"github.com/koding/websocketproxy"
	"golang.org/x/net/websocket"
)

func ProxyRTC(w http.ResponseWriter, r *http.Request) {
	u, _ := url.Parse("ws://localhost:7880/rtc")
	websocketproxy.DefaultUpgrader.CheckOrigin = func(r *http.Request) bool {
		return true
	}
	websocketproxy.NewProxy(u).ServeHTTP(w, r)
}

func HandleIngress(conn *websocket.Conn) {
	conn.PayloadType = websocket.BinaryFrame
	log.Println("New cast connection")
	c, err := net.Dial("tcp", "localhost:1935")
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c.Close()
	go io.Copy(conn, c)
	_, err = io.Copy(c, conn)
	if err != nil {
		log.Println("copy:", err)
		return
	}
}
