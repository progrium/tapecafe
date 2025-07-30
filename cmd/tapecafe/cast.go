package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	lksdk2 "github.com/livekit/server-sdk-go/v2"
	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/engine/cli"
)

// TimelineState represents the current playback timeline state
type TimelineState struct {
	Title       string `json:"title"`
	CurrentTime int    `json:"currentTime"` // in milliseconds
	TotalTime   int    `json:"totalTime"`   // in milliseconds, 0 if unknown
	Playing     bool   `json:"playing"`
}

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
				if _, err := os.Stat(filename); os.IsNotExist(err) {
					log.Fatal("file does not exist:", filename)
				}
				durationMs, err := fileDurationMs(filename)
				if err != nil {
					log.Fatal("file duration:", err)
				}
				fmt.Println("FILE DURATION:", formatTimeMs(durationMs))
			}

			settings, err := fetchSettings(*u)
			if err != nil {
				log.Fatal("fetch settings:", err)
			}
			fmt.Println("SETTINGS:", settings)

			// TODO
			// // Connect to LiveKit room for timeline broadcasting
			// room, err := lksdk2.ConnectToRoom(settings["livekit_url"].(string), lksdk2.ConnectInfo{
			// 	APIKey:              "devkey",
			// 	APISecret:           "secret",
			// 	RoomName:            "theater",
			// 	ParticipantIdentity: "timelinebot",
			// }, &lksdk2.RoomCallback{})
			// if err != nil {
			// 	log.Fatal("connect to room:", err)
			// }
			// defer room.Disconnect()

			// Initialize timeline state
			timelineState := &TimelineState{}

			// Get total duration if we have a filename
			if filename != "" {
				durationMs, err := fileDurationMs(filename)
				if err != nil {
					log.Println("Warning: could not get file duration:", err)
				} else {
					timelineState.TotalTime = durationMs
				}
			}

			// Timeline broadcast function
			broadcastTimeline := func(state *TimelineState) {
				stateBytes, err := json.Marshal(state)
				if err != nil {
					log.Println("timeline marshal:", err)
					return
				}
				dp := lksdk2.UserData(stateBytes)
				dp.Topic = "timeline-updates"
				// TODO
				// if err := room.LocalParticipant.PublishDataPacket(dp, lksdk2.WithDataPublishReliable(true), lksdk2.WithDataPublishTopic("timeline-updates")); err != nil {
				// 	log.Println("timeline publish:", err)
				// }
			}

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

			currentTime := "00:00"
			var cmd *exec.Cmd
			rtmpURL := "rtmp://localhost:1935/live/" + settings["ingress_key"].(string)
			slashPlaySeek := func(args []string) error {
				startTime := currentTime
				if len(args) > 0 {
					startTime = args[0]
				}
				startMs, err := parseTimeToMs(startTime)
				if err != nil {
					return err
				}

				if cmd != nil {
					log.Println("killing ffmpeg process at", currentTime)
					cmd.Process.Kill()
					cmd = nil
				}

				log.Println("starting ffmpeg process at", startTime)
				progressChan := make(chan map[string]string)
				cmd, err = streamFile(filename, startMs, rtmpURL, progressChan)
				if err != nil {
					return err
				}

				// Update timeline state to playing
				timelineState.Playing = true
				timelineState.CurrentTime = startMs
				broadcastTimeline(timelineState)

				go func() {
					ticker := time.NewTicker(1 * time.Second)
					defer ticker.Stop()

					for {
						select {
						case progress, ok := <-progressChan:
							if !ok {
								// ffmpeg stopped, mark as not playing
								timelineState.Playing = false
								broadcastTimeline(timelineState)
								return
							}
							timeMs, err := parseTimeToMs(progress["out_time"])
							if err != nil {
								log.Fatal("parse time:", err)
							}
							currentTime = formatTimeMs(startMs + timeMs)
							timelineState.CurrentTime = startMs + timeMs
						case <-ticker.C:
							// Broadcast timeline updates every second
							if timelineState.Playing {
								broadcastTimeline(timelineState)
							}
						}
					}
				}()

				return nil
			}
			slashPause := func(args []string) error {
				if cmd != nil {
					log.Println("killing ffmpeg process at", currentTime)
					cmd.Process.Kill()
					cmd = nil
				}
				// Update timeline state to paused
				timelineState.Playing = false
				broadcastTimeline(timelineState)
				return nil
			}
			slashBack := func(args []string) error {
				slashPause(nil)
				backTime := "00:10"
				if len(args) > 0 {
					if strings.Contains(args[0], ":") {
						backTime = args[0]
					} else {
						backTime = "00:" + args[0]
					}
				}
				backMs, err := parseTimeToMs(backTime)
				if err != nil {
					return err
				}
				currentMs, err := parseTimeToMs(currentTime)
				if err != nil {
					return err
				}
				currentMs -= backMs
				currentTime = formatTimeMs(currentMs)
				log.Println("seeking back to", currentTime)
				slashPlaySeek(nil)
				return nil
			}
			slashForward := func(args []string) error {
				slashPause(nil)
				backTime := "00:10"
				if len(args) > 0 {
					if strings.Contains(args[0], ":") {
						backTime = args[0]
					} else {
						backTime = "00:" + args[0]
					}
				}
				backMs, err := parseTimeToMs(backTime)
				if err != nil {
					return err
				}
				currentMs, err := parseTimeToMs(currentTime)
				if err != nil {
					return err
				}
				currentMs += backMs
				currentTime = formatTimeMs(currentMs)
				log.Println("seeking forward to", currentTime)
				slashPlaySeek(nil)
				return nil
			}
			cmds := map[string]func([]string) error{
				"/play":    slashPlaySeek,
				"/seek":    slashPlaySeek,
				"/pause":   slashPause,
				"/back":    slashBack,
				"/fwd":     slashForward,
				"/forward": slashForward,
			}

			go monitorChat(*u, originURL, cmds)

			// Add signal handling for SIGINT
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, os.Interrupt, syscall.SIGINT)
			go func() {
				<-sigChan
				if cmd != nil {
					log.Println("Caught SIGINT, killing ffmpeg process...")
					cmd.Process.Kill()
				}
				os.Exit(0)
			}()

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

func monitorChat(u url.URL, origin string, cmds map[string]func([]string) error) {
	u.Path = "/chat"
	conn, err := websocket.Dial(u.String(), "", origin)
	if err != nil {
		log.Println("monitor:", err)
		return
	}
	defer conn.Close()

	for {
		var data []byte
		if err := websocket.Message.Receive(conn, &data); err != nil {
			log.Println("chat:", err)
			return
		}
		var m map[string]any
		if err := json.Unmarshal(data, &m); err != nil {
			log.Println("chat:", err)
			continue
		}
		msg := m["message"].(string)
		log.Println("CHAT:", msg)

		args := strings.Split(msg, " ")
		if cmd, ok := cmds[args[0]]; ok {
			if err := cmd(args[1:]); err != nil {
				log.Println("chat command:", args, err)
			}
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
