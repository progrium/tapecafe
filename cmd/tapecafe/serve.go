package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"
	lkp "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go"
	lksdk2 "github.com/livekit/server-sdk-go/v2"
	"github.com/progrium/tapecafe/caster"
	"github.com/progrium/tapecafe/server"
	"github.com/progrium/tapecafe/ui"
	"github.com/rs/xid"
	"golang.ngrok.com/ngrok"
	ngrokconfig "golang.ngrok.com/ngrok/config"
	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/duplex/codec"
	"tractor.dev/toolkit-go/duplex/mux"
	"tractor.dev/toolkit-go/duplex/rpc"
	"tractor.dev/toolkit-go/duplex/talk"
	"tractor.dev/toolkit-go/engine/cli"
)

var (
	bindAddr string

	lkURL string

	stateListeners map[string]*sync.Map
)

func init() {
	stateListeners = make(map[string]*sync.Map)
}

func serveCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "serve",
		Run: func(ctx *cli.Context, args []string) {
			l, err := setupListener()
			if err != nil {
				log.Fatal("listen:", err)
			}
			defer l.Close()

			fmt.Println("Listening on:", publicURL(l))

			// if err := ensureIngress(); err != nil {
			// 	log.Fatal("ensure ingress:", err)
			// }

			mux := http.NewServeMux()
			mux.Handle("/-/cast/ingress", websocket.Handler(server.HandleIngress))
			mux.Handle("/-/cast/rpc", websocket.Handler(serveRPC))
			mux.Handle("/-/state", websocket.Handler(handleState))
			mux.Handle("/rtc", http.HandlerFunc(server.ProxyRTC))
			mux.Handle("/", http.HandlerFunc(handleParticipate))

			log.Fatal(http.Serve(l, corsMiddleware(mux)))
		},
	}
	cmd.Flags().StringVar(&bindAddr, "bind", ":9091", "address to bind the server")
	return cmd
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Max-Age", "3600")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		// Call the next handler
		next.ServeHTTP(w, r)
	})
}

func handleState(conn *websocket.Conn) {
	room := conn.Request().URL.Query().Get("room")
	if room == "" {
		log.Println("No room provided")
		conn.Close()
		return
	}
	log.Println("New state connection for room:", room)
	_, ok := stateListeners[room]
	if !ok {
		stateListeners[room] = &sync.Map{}
	}
	stateListeners[room].Store(conn, true)
	<-conn.Request().Context().Done()
	stateListeners[room].Delete(conn)
}

func serveRPC(conn *websocket.Conn) {
	room := conn.Request().URL.Query().Get("room")
	if room == "" {
		log.Println("No room provided")
		conn.Close()
		return
	}
	log.Println("New RPC connection for room:", room)
	conn.PayloadType = websocket.BinaryFrame
	defer conn.Close()
	peer := talk.NewPeer(mux.New(conn), codec.CBORCodec{})
	peer.Handle("cast.ingress", rpc.HandlerFunc(func(r rpc.Responder, c *rpc.Call) {
		ingressKey, err := ensureIngress(room)
		if err != nil {
			r.Return(err)
			return
		}
		r.Return(fmt.Sprintf("/live/%s", ingressKey))
	}))
	peer.Handle("cast.state", rpc.HandlerFunc(func(r rpc.Responder, c *rpc.Call) {
		var state caster.SharedState
		if err := c.Receive(&state); err != nil {
			log.Println("state:", err)
			return
		}
		msg, err := json.Marshal(state)
		if err != nil {
			log.Println("state:", err)
			return
		}
		_, ok := stateListeners[room]
		if !ok {
			stateListeners[room] = &sync.Map{}
		}
		stateListeners[room].Range(func(key, value any) bool {
			if conn, ok := key.(*websocket.Conn); ok {
				_, err := conn.Write(msg)
				if err != nil {
					stateListeners[room].Delete(conn)
					log.Println("state:", err)
				}
			}
			return true
		})
	}))
	peer.Handle("cast.chat", rpc.HandlerFunc(func(r rpc.Responder, c *rpc.Call) {
		_, err := r.Continue()
		if err != nil {
			log.Println("chat:", err)
		}
		done := make(chan struct{})
		chat := make(chan string)
		room, err := lksdk2.ConnectToRoom("http://localhost:7880", lksdk2.ConnectInfo{
			APIKey:              "devkey",
			APISecret:           "secret",
			RoomName:            room,
			ParticipantIdentity: "chatbot",
		}, &lksdk2.RoomCallback{
			ParticipantCallback: lksdk2.ParticipantCallback{
				OnDataPacket: func(data lksdk2.DataPacket, params lksdk2.DataReceiveParams) {
					m := make(map[string]any)
					err := json.Unmarshal(data.ToProto().Value.(*lkp.DataPacket_User).User.Payload, &m)
					if err != nil {
						log.Println("chat:", err)
						return
					}
					if err := r.Send(m); err != nil {
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
		for {
			select {
			case <-done:
				return
			case msg := <-chat:
				msgBytes, err := json.Marshal(map[string]any{
					"id":        uuid.NewString(),
					"message":   msg,
					"timestamp": time.Now().UnixMilli(),
				})
				if err != nil {
					log.Println("chat marshal:", err)
					return
				}
				dp := lksdk2.UserData(msgBytes)
				dp.Topic = "lk-chat-topic"
				if err := room.LocalParticipant.PublishDataPacket(dp,
					lksdk2.WithDataPublishReliable(true),
					lksdk2.WithDataPublishTopic("lk-chat-topic"),
				); err != nil {
					log.Println("chat publish:", err)
				}
			default:
			}
		}
	}))
	peer.Respond()
}

func handleParticipate(w http.ResponseWriter, r *http.Request) {
	sub, err := fs.Sub(ui.Dir, "dist")
	if err != nil {
		log.Print(err)
		return
	}

	if strings.HasPrefix(r.URL.Path, "/assets") {
		http.FileServerFS(sub).ServeHTTP(w, r)
		return
	}

	if r.URL.Query().Get("token") == "" {
		room := strings.TrimPrefix(r.URL.Path, "/")
		md := true
		at := auth.NewAccessToken("devkey", "secret")
		grant := &auth.VideoGrant{
			RoomJoin:             true,
			Room:                 room,
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
		http.Redirect(w, r, fmt.Sprintf("/%s?token=%s", room, token), http.StatusTemporaryRedirect)

		// meetURL = fmt.Sprintf("%s?liveKitUrl=%s&token=%s", meetURL, lkURL, token)
		// meetURL := cmp.Or(os.Getenv("MEET_URL"), "https://meet.livekit.io/custom")
		// log.Println("Redirecting to:", meetURL)
		// http.Redirect(w, r, meetURL, http.StatusTemporaryRedirect)
		return
	}

	http.ServeFileFS(w, r, sub, "index.html")
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

func ensureIngress(room string) (string, error) {
	ingressClient := lksdk.NewIngressClient("ws://localhost:7880", "devkey", "secret")

	ctx := context.TODO()
	lki, err := ingressClient.ListIngress(ctx, &lkp.ListIngressRequest{})
	if err != nil {
		return "", err
	}

	found := false
	var ingress *lkp.IngressInfo
	for _, i := range lki.GetItems() {
		if i.RoomName == room {
			found = true
			ingress = i
			break
		}
	}
	if !found {
		ingress, err = ingressClient.CreateIngress(ctx, &lkp.CreateIngressRequest{
			InputType:           0,
			Name:                room + "-ingress",
			RoomName:            room,
			ParticipantIdentity: "caster",
		})
		if err != nil {
			return "", err
		}
	}
	log.Println("INGRESS URL:", ingress.GetUrl())
	log.Println("INGRESS KEY:", ingress.GetStreamKey())

	return ingress.GetStreamKey(), nil
}
