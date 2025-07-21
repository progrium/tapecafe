package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"

	lkp "github.com/livekit/protocol/livekit"
	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/engine/cli"
)

func castCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "cast <server-url>",
		// Short: "",
		Args: cli.MinArgs(1),
		Run: func(ctx *cli.Context, args []string) {
			u, err := url.Parse(args[0])
			if err != nil {
				log.Fatal("parse url:", err)
			}
			originURL := "http://" + u.Host

			settings, err := fetchSettings(*u)
			if err != nil {
				log.Fatal("fetch settings:", err)
			}

			l, err := net.Listen("tcp", ":1935")
			if err != nil {
				log.Fatal("listen:", err)
			}
			defer l.Close()

			fmt.Println("SETTINGS:", settings)

			setupOBS(&lkp.IngressInfo{
				Url:       "rtmp://localhost:1935/live",
				StreamKey: settings["ingress_key"].(string),
			})

			go monitorChat(*u, originURL)
			go startStream()

			for {
				conn, err := l.Accept()
				if err != nil {
					log.Fatal("accept:", err)
				}
				u.Path = "/cast"
				c, err := websocket.Dial(u.String(), "", originURL)
				if err != nil {
					log.Fatal("dial:", err)
				}
				go func() {
					_, err := io.Copy(c, conn)
					if err != nil {
						log.Fatal("copy:", err)
					}
				}()
				go func() {
					_, err := io.Copy(conn, c)
					if err != nil {
						log.Fatal("copy:", err)
					}
				}()
			}
		},
	}
	return cmd
}

func monitorChat(u url.URL, origin string) {
	u.Path = "/chat"
	conn, err := websocket.Dial(u.String(), "", origin)
	if err != nil {
		log.Println("monitor:", err)
		return
	}
	defer conn.Close()

	for {
		var msg string
		if err := websocket.Message.Receive(conn, &msg); err != nil {
			log.Println("chat:", err)
			return
		}
		log.Println("CHAT:", msg)

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

func fetchSettings(u url.URL) (map[string]any, error) {
	u.Path = "/settings"
	if u.Scheme == "ws" {
		u.Scheme = "http"
	}
	if u.Scheme == "wss" {
		u.Scheme = "https"
	}
	resp, err := http.Get(u.String())
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("failed to fetch settings: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var jsonData map[string]any
	err = json.Unmarshal(body, &jsonData)
	if err != nil {
		return nil, err
	}

	return jsonData, nil
}
