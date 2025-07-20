package main

import (
	"context"
	"encoding/json"
	"fmt"
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
	"golang.ngrok.com/ngrok"
	ngrokconfig "golang.ngrok.com/ngrok/config"
)

var users int

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	log.Println("starting...")

	var err error

	// roomServiceClient := lksdk.NewRoomServiceClient("ws://localhost:7880", "devkey", "secret")
	ingressClient := lksdk.NewIngressClient("ws://localhost:7880", "devkey", "secret")

	ctx := context.TODO()
	lki, err := ingressClient.ListIngress(ctx, &lkp.ListIngressRequest{})
	if err != nil {
		log.Println(err)
		return
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
			log.Println(err)
			return
		}
	}
	_ = ingress // TODO

	var l net.Listener
	if token := os.Getenv("NGROK_TOKEN"); token != "" {
		l, err = ngrok.Listen(context.Background(),
			ngrokconfig.HTTPEndpoint(),
			ngrok.WithAuthtoken(os.Getenv("NGROK_TOKEN")),
		)
		if err != nil {
			log.Println("listen:", err)
			return
		}
		log.Print(serviceURL(l) + "/invite")
		// http.Serve(l, nil)
	} else {
		l, err = net.Listen("tcp4", ":8081")
		if err != nil {
			log.Fatalf("listen tcp: %v", err)
		}
	}

	http.HandleFunc("/hello", func(w http.ResponseWriter, r *http.Request) {
		log.Print("/hello")
	})

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		u, _ := url.Parse("ws://localhost:7880")
		// u.Scheme = "ws"
		websocketproxy.DefaultUpgrader.CheckOrigin = func(r *http.Request) bool {
			return true
		}
		websocketproxy.NewProxy(u).ServeHTTP(w, r)
	})

	http.HandleFunc("/invite", func(w http.ResponseWriter, r *http.Request) {
		users++

		at := auth.NewAccessToken("devkey", "secret")
		grant := &auth.VideoGrant{
			RoomJoin: true,
			Room:     "theater",
		}
		at.AddGrant(grant).
			SetIdentity(fmt.Sprintf("user%d", users)).
			SetValidFor(3 * time.Hour)

		token, err := at.ToJWT()
		if err != nil {
			log.Println(err)
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		lkURL := strings.ReplaceAll(serviceURL(l), "https:", "wss:")
		meetURL := "https://meet.livekit.io/custom?liveKitUrl=%s&token=%s"
		http.Redirect(w, r, fmt.Sprintf(meetURL, lkURL, token), http.StatusTemporaryRedirect)
	})

	// webhookReceiver := &http.Server{
	// 	Addr: "localhost:9990",
	// 	Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
	// 		//
	// 	}),
	// }

	go func() {
		<-time.After(2 * time.Second)
		chatRoom, err := lksdk2.ConnectToRoom("http://localhost:7880", lksdk2.ConnectInfo{
			APIKey:              "devkey",
			APISecret:           "secret",
			RoomName:            "theater",
			ParticipantIdentity: "chat-bot",
		}, &lksdk2.RoomCallback{
			ParticipantCallback: lksdk2.ParticipantCallback{
				OnDataPacket: onDataPacket,
			},
		})
		if err != nil {
			log.Println("chat-bot:", err)
		}
		_ = chatRoom
	}()

	log.Fatal(http.Serve(l, nil))
}

func serviceURL(l net.Listener) string {
	if tun, ok := l.(ngrok.Tunnel); ok {
		return tun.URL()
	}
	if url := os.Getenv("SERVICE_URL"); url != "" {
		return url
	}
	return "http://" + l.Addr().String()
}

func onDataPacket(data lksdk2.DataPacket, params lksdk2.DataReceiveParams) {
	m := make(map[string]any)
	err := json.Unmarshal(data.ToProto().Value.(*lkp.DataPacket_User).User.Payload, &m)
	if err != nil {
		panic(err)
	}
	log.Println("CHAT:", m["message"])
	// if video, ok := detectYouTubeURL(m["message"].(string)); ok {
	// 	_, err := obsClient.Inputs.SetInputSettings(&inputs.SetInputSettingsParams{
	// 		InputName: ptr("YouTube"),
	// 		InputSettings: map[string]any{
	// 			"url": fmt.Sprintf("https://hopollo.github.io/OBS-Youtube-Player/?watch?v=%s&hideWhenStopped=true&quality=hd1080", video),
	// 		},
	// 	})
	// 	if err != nil {
	// 		log.Println(err)
	// 	}
	// }
}

func detectYouTubeURL(s string) (string, bool) {
	if !strings.HasPrefix(s, "https://www.youtube.com/") &&
		!strings.HasPrefix(s, "https://youtu.be/") &&
		!strings.HasPrefix(s, "https://youtube.com") {
		return "", false
	}
	s = strings.ReplaceAll(s, "https://www.youtube.com/watch?v=", "")
	s = strings.ReplaceAll(s, "https://youtu.be/", "")
	s = strings.ReplaceAll(s, "https://www.youtube.com/shorts/", "")
	s = strings.ReplaceAll(s, "https://youtube.com/shorts/", "")
	return s, true
}
