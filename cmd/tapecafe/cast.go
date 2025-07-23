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

	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/engine/cli"
)

func castCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "cast <server-url> <filename>",
		// Short: "",
		Args: cli.MinArgs(1),
		Run: func(ctx *cli.Context, args []string) {
			u, err := url.Parse(args[0])
			if err != nil {
				log.Fatal("parse url:", err)
			}
			originURL := "http://" + u.Host

			var filename string
			if len(args) > 1 {
				filename = args[1]
			}

			settings, err := fetchSettings(*u)
			if err != nil {
				log.Fatal("fetch settings:", err)
			}
			fmt.Println("SETTINGS:", settings)

			l, err := net.Listen("tcp", ":1935")
			if err != nil {
				log.Fatal("listen:", err)
			}
			defer l.Close()

			// setupOBS(&lkp.IngressInfo{
			// 	Url:       "rtmp://localhost:1935/live",
			// 	StreamKey: settings["ingress_key"].(string),
			// })
			// go startStream()

			go monitorChat(*u, originURL, filename, settings["ingress_key"].(string))

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

func monitorChat(u url.URL, origin string, filename string, streamKey string) {
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

		if filename != "" && strings.Index(msg, "/play") != -1 {
			progressChan := make(chan map[string]string)
			startMs := 0

			_, err := streamFile(filename, startMs, "rtmp://localhost:1935/live/"+streamKey, progressChan)
			if err != nil {
				log.Fatal("stream file:", err)
			}
			go func() {
				for progress := range progressChan {
					timeMs, err := parseTimeToMs(progress["out_time"])
					if err != nil {
						log.Fatal("parse time:", err)
					}
					t := formatTimeMs(startMs + timeMs)
					fmt.Println("TIME:", t)
					// if t == "00:05" {
					// 	cmd.Process.Kill()
					// 	return
					// }
				}
			}()

		}

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
