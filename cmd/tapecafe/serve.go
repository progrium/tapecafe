package main

import (
	"cmp"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/koding/websocketproxy"
	"github.com/livekit/protocol/auth"
	lkp "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go"
	lksdk2 "github.com/livekit/server-sdk-go/v2"
	"github.com/rs/xid"
	"golang.ngrok.com/ngrok"
	ngrokconfig "golang.ngrok.com/ngrok/config"
	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/engine/cli"
)

var (
	bindAddr string

	lkURL      string
	ingressURL string
	ingressKey string
)

func serveCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "serve",
		// Short: "",
		// Args: cli.MinArgs(1),
		Run: func(ctx *cli.Context, args []string) {
			l, err := setupListener()
			if err != nil {
				log.Fatal("listen:", err)
			}
			defer l.Close()

			fmt.Println("Listening on:", publicURL(l))

			if err := ensureIngress(); err != nil {
				log.Fatal("ensure ingress:", err)
			}

			http.Handle("/cast", websocket.Handler(serveCast))
			http.Handle("/chat", websocket.Handler(serveChat))
			http.HandleFunc("/settings", serveSettings)
			http.HandleFunc("/rtc", serveRTC)
			http.HandleFunc("/", serveParticipate)

			log.Fatal(http.Serve(l, nil))
		},
	}
	cmd.Flags().StringVar(&bindAddr, "bind", ":9091", "address to bind the server")
	return cmd
}

func serveRTC(w http.ResponseWriter, r *http.Request) {
	u, _ := url.Parse("ws://localhost:7880/rtc")
	websocketproxy.DefaultUpgrader.CheckOrigin = func(r *http.Request) bool {
		return true
	}
	websocketproxy.NewProxy(u).ServeHTTP(w, r)
}

func serveSettings(w http.ResponseWriter, r *http.Request) {
	enc := json.NewEncoder(w)
	w.Header().Set("Content-Type", "application/json")
	if err := enc.Encode(map[string]string{
		"ingress_url": ingressURL,
		"ingress_key": ingressKey,
		"livekit_url": lkURL,
	}); err != nil {
		log.Println("settings encode:", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
}

func serveCast(conn *websocket.Conn) {
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

func serveChat(conn *websocket.Conn) {
	log.Println("New chatbot connection")
	defer conn.Close()
	done := make(chan struct{})
	_, err := lksdk2.ConnectToRoom("http://localhost:7880", lksdk2.ConnectInfo{
		APIKey:              "devkey",
		APISecret:           "secret",
		RoomName:            "theater",
		ParticipantIdentity: "chat-bot",
	}, &lksdk2.RoomCallback{
		ParticipantCallback: lksdk2.ParticipantCallback{
			OnDataPacket: func(data lksdk2.DataPacket, params lksdk2.DataReceiveParams) {
				m := make(map[string]any)
				err := json.Unmarshal(data.ToProto().Value.(*lkp.DataPacket_User).User.Payload, &m)
				if err != nil {
					log.Println("chat:", err)
					return
				}
				enc := json.NewEncoder(conn)
				log.Println("CHAT:", m)
				if err := enc.Encode(m); err != nil {
					log.Println("chat:", err)
					return
				}
			},
		},
		OnDisconnected: func() {
			done <- struct{}{}
		},
	})
	if err != nil {
		log.Println("chat:", err)
		return
	}
	<-done
}

func serveParticipate(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		md := true
		at := auth.NewAccessToken("devkey", "secret")
		grant := &auth.VideoGrant{
			RoomJoin:             true,
			Room:                 "theater",
			CanUpdateOwnMetadata: &md,
		}
		at.AddGrant(grant).
			SetIdentity(xid.New().String()).
			SetValidFor(3 * time.Hour)

		token, err := at.ToJWT()
		if err != nil {
			log.Println(err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		//http.Redirect(w, r, fmt.Sprintf("/%s", token), http.StatusTemporaryRedirect)

		meetURL := cmp.Or(os.Getenv("MEET_URL"), "https://meet.livekit.io/custom")
		meetURL = fmt.Sprintf("%s?liveKitUrl=%s&token=%s", meetURL, lkURL, token)
		log.Println("Redirecting to:", meetURL)
		http.Redirect(w, r, meetURL, http.StatusTemporaryRedirect)
		return
	}

	token := strings.TrimPrefix(r.URL.Path, "/")
	fmt.Fprintln(w, token)

}

func publicURL(l net.Listener) string {
	if url := os.Getenv("PUBLIC_URL"); url != "" {
		return url
	}
	if tun, ok := l.(ngrok.Tunnel); ok {
		return tun.URL()
	}
	hostname := strings.ReplaceAll(l.Addr().String(), "0.0.0.0", "localhost")
	return fmt.Sprintf("http://%s", hostname)
}

func setupListener() (l net.Listener, err error) {
	token := os.Getenv("NGROK_TOKEN")
	if token != "" && os.Getenv("PUBLIC_URL") == "" {
		l, err = ngrok.Listen(context.Background(),
			ngrokconfig.HTTPEndpoint(),
			ngrok.WithAuthtoken(token),
		)
		if err == nil {
			lkURL = strings.Replace(publicURL(l), "https:", "wss:", 1)
		}
	} else {
		l, err = net.Listen("tcp4", bindAddr)
		if err == nil {
			lkURL = strings.Replace(publicURL(l), "https:", "wss:", 1)
			lkURL = strings.Replace(lkURL, "http:", "ws:", 1)
		}
	}
	return
}

func ensureIngress() error {
	ingressClient := lksdk.NewIngressClient("ws://localhost:7880", "devkey", "secret")

	ctx := context.TODO()
	lki, err := ingressClient.ListIngress(ctx, &lkp.ListIngressRequest{})
	if err != nil {
		return err
	}

	found := false
	var ingress *lkp.IngressInfo
	for _, i := range lki.GetItems() {
		if i.RoomName == "theater" {
			found = true
			ingress = i
			break
		}
	}
	if !found {
		ingress, err = ingressClient.CreateIngress(ctx, &lkp.CreateIngressRequest{
			InputType:           0,
			Name:                "theater-ingress",
			RoomName:            "theater",
			ParticipantIdentity: "streambot",
		})
		if err != nil {
			return err
		}
	}
	ingressURL = ingress.GetUrl()
	ingressKey = ingress.GetStreamKey()
	log.Println("INGRESS URL:", ingressURL)
	log.Println("INGRESS KEY:", ingressKey)

	return nil
}
