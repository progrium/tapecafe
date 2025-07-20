package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/andreykaipov/goobs"
	"github.com/andreykaipov/goobs/api/requests/config"
	obsconfig "github.com/andreykaipov/goobs/api/requests/config"
	"github.com/andreykaipov/goobs/api/requests/inputs"
	"github.com/andreykaipov/goobs/api/requests/sceneitems"
	"github.com/andreykaipov/goobs/api/requests/stream"
	"github.com/andreykaipov/goobs/api/typedefs"
	"github.com/koding/websocketproxy"
	"github.com/livekit/protocol/auth"
	lkp "github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go"
	lksdk2 "github.com/livekit/server-sdk-go/v2"
	"golang.ngrok.com/ngrok"
	ngrokconfig "golang.ngrok.com/ngrok/config"
)

var users int
var obsClient *goobs.Client

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	log.Println("starting...")

	var err error

	// roomServiceClient := lksdk.NewRoomServiceClient("ws://localhost:7880", "devkey", "secret")
	ingressClient := lksdk.NewIngressClient("ws://localhost:7880", "devkey", "secret")
	obsClient, err = goobs.New("localhost:4455", goobs.WithPassword("password"))
	if err != nil {
		log.Println("connect:", err)
		return
	}

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

	// Tape Cafe profile
	profiles, err := obsClient.Config.GetProfileList(&obsconfig.GetProfileListParams{})
	if err != nil {
		log.Println(err)
		return
	}

	found = false
	for _, p := range profiles.Profiles {
		if p == "tapecafe" {
			found = true
		}
	}
	if !found {
		_, err = obsClient.Config.CreateProfile(new(obsconfig.CreateProfileParams).WithProfileName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}
	if profiles.CurrentProfileName != "tapecafe" {
		_, err = obsClient.Config.SetCurrentProfile(new(obsconfig.SetCurrentProfileParams).WithProfileName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// tapecafe scenecollection
	scl, err := obsClient.Config.GetSceneCollectionList(&obsconfig.GetSceneCollectionListParams{})
	if err != nil {
		log.Println(err)
		return
	}
	found = false
	for _, sc := range scl.SceneCollections {
		if sc == "tapecafe" {
			found = true
		}
	}
	if !found {
		_, err = obsClient.Config.CreateSceneCollection(new(obsconfig.CreateSceneCollectionParams).WithSceneCollectionName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}
	if scl.CurrentSceneCollectionName != "tapecafe" {
		_, err = obsClient.Config.SetCurrentSceneCollection(new(obsconfig.SetCurrentSceneCollectionParams).WithSceneCollectionName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// get video settings
	videoSettings, err := obsClient.Config.GetVideoSettings(new(obsconfig.GetVideoSettingsParams))
	if err != nil {
		log.Println(err)
		return
	}

	// create background source
	il, err := obsClient.Inputs.GetInputList(inputs.NewGetInputListParams())
	if err != nil {
		log.Println(err)
		return
	}
	found = false
	for _, i := range il.Inputs {
		if i.InputName == "Background" {
			found = true
		}
	}
	if !found {
		ir, err := obsClient.Inputs.CreateInput(new(inputs.CreateInputParams).
			WithInputKind("image_source").
			WithInputName("Background").
			WithSceneItemEnabled(true).
			WithSceneName("Scene").
			WithInputSettings(map[string]any{
				"file": filepath.Join(os.Getenv("DATAPATH"), "/home/hryx/src/tapecafe/frog.gif"),
			}))
		if err != nil {
			log.Println(err)
			return
		}
		_, err = obsClient.SceneItems.SetSceneItemTransform(sceneitems.NewSetSceneItemTransformParams().
			WithSceneItemId(ir.SceneItemId).
			WithSceneName("Scene").
			WithSceneItemTransform(&typedefs.SceneItemTransform{
				PositionX:    videoSettings.BaseWidth / 2,
				PositionY:    videoSettings.BaseHeight / 2,
				BoundsWidth:  videoSettings.BaseWidth,
				BoundsHeight: videoSettings.BaseHeight,
				BoundsType:   "OBS_BOUNDS_STRETCH",
			}))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// create browser source
	found = false
	for _, i := range il.Inputs {
		if i.InputName == "YouTube" {
			found = true
		}
	}
	if !found {
		ir, err := obsClient.Inputs.CreateInput(new(inputs.CreateInputParams).
			WithInputKind("browser_source").
			WithInputName("YouTube").
			WithSceneItemEnabled(true).
			WithSceneName("Scene").
			WithInputSettings(map[string]any{
				"url":                 "", //"https://hopollo.github.io/OBS-Youtube-Player/?watch?v=lSqnqSSXTUI&list=RDlSqnqSSXTUI&volume=10&random=true&loop=true",
				"reroute_audio":       true,
				"restart_when_active": true,
				"shutdown":            true,
				"width":               535,
				"height":              300,
			}))
		if err != nil {
			log.Println(err)
			return
		}
		_, err = obsClient.SceneItems.SetSceneItemTransform(sceneitems.NewSetSceneItemTransformParams().
			WithSceneItemId(ir.SceneItemId).
			WithSceneName("Scene").
			WithSceneItemTransform(&typedefs.SceneItemTransform{
				PositionX:    videoSettings.BaseWidth / 2,
				PositionY:    videoSettings.BaseHeight / 2,
				BoundsWidth:  videoSettings.BaseWidth,
				BoundsHeight: videoSettings.BaseHeight,
				BoundsType:   "OBS_BOUNDS_STRETCH",
			}))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// clear browser url
	_, err = obsClient.Inputs.SetInputSettings(inputs.NewSetInputSettingsParams().
		WithInputName("YouTube").
		WithInputSettings(map[string]any{
			"url": "",
		}))
	if err != nil {
		log.Println("clear:", err)
		return
	}

	// set stream config
	_, err = obsClient.Config.SetStreamServiceSettings(config.NewSetStreamServiceSettingsParams().
		WithStreamServiceType("rtmp_custom").
		WithStreamServiceSettings(&typedefs.StreamServiceSettings{
			Server: ingress.Url,
			Key:    ingress.StreamKey,
		}))
	if err != nil {
		log.Println(err)
		return
	}

	// start stream
	_, err = obsClient.Stream.StartStream(&stream.StartStreamParams{})
	if err != nil {
		log.Println("stream:", err)
		return
	}

	l, err := ngrok.Listen(context.Background(),
		ngrokconfig.HTTPEndpoint(),
		ngrok.WithAuthtoken(os.Getenv("NGROK_TOKEN")),
	)
	if err != nil {
		log.Println("listen:", err)
		return
	}

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

		lkURL := strings.ReplaceAll(l.URL(), "https:", "wss:")
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

	log.Print(l.URL() + "/invite")
	http.Serve(l, nil)
}

func ptr(s string) *string {
	return &s
}

func onDataPacket(data lksdk2.DataPacket, params lksdk2.DataReceiveParams) {
	m := make(map[string]any)
	err := json.Unmarshal(data.ToProto().Value.(*lkp.DataPacket_User).User.Payload, &m)
	if err != nil {
		panic(err)
	}
	log.Println("CHAT:", m["message"])
	if video, ok := detectYouTubeURL(m["message"].(string)); ok {
		_, err := obsClient.Inputs.SetInputSettings(&inputs.SetInputSettingsParams{
			InputName: ptr("YouTube"),
			InputSettings: map[string]any{
				"url": fmt.Sprintf("https://hopollo.github.io/OBS-Youtube-Player/?watch?v=%s&hideWhenStopped=true&quality=hd1080", video),
			},
		})
		if err != nil {
			log.Println(err)
		}
	}
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
