package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
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

			_, err := streamFile(filename, startMs, streamKey, progressChan)
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

func streamFile(filename string, seekMs int, streamKey string, progressChan chan map[string]string) (*exec.Cmd, error) {
	fmt.Println("STREAMING:", filename, formatTimeMs(seekMs))
	cmd := exec.Command("ffmpeg",
		"-nostats",
		"-progress", "pipe:1",
		"-loglevel", "quiet",
		"-re",
		"-ss", formatTimeMs(seekMs),
		"-i", filename,
		"-c:v", "libx264",
		"-c:a", "aac",
		"-f", "flv",
		"rtmp://localhost:1935/live/"+streamKey)
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	go func() {
		defer close(progressChan)

		scanner := bufio.NewScanner(stdout)
		currentMap := make(map[string]string)

		for scanner.Scan() {
			line := scanner.Text()
			if line == "" {
				continue
			}

			parts := strings.Split(line, "=")
			if len(parts) != 2 {
				continue
			}

			key := strings.TrimSpace(parts[0])
			value := strings.TrimSpace(parts[1])
			currentMap[key] = value

			if key == "progress" {
				if value == "continue" {
					// Create a new map to avoid reference issues
					progressMap := make(map[string]string)
					for k, v := range currentMap {
						progressMap[k] = v
					}
					if progressMap["out_time"] != "N/A" {
						progressChan <- progressMap
					}
					currentMap = make(map[string]string)
				} else if value == "end" {
					return
				}
			}
		}
	}()

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	return cmd, nil
}

func durationMs(filename string) (int, error) {
	format, err := ffprobeFormat(filename)
	if err != nil {
		return 0, err
	}

	durMs := 0.0
	duration := format["duration"]
	fmt.Sscanf(duration, "%f", &durMs)

	return int(durMs * 1000), nil
}

func ffprobeFormat(filename string) (map[string]string, error) {
	cmd := exec.Command("ffprobe", "-i", filename, "-show_format", "-v", "quiet")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	lines := strings.Split(string(output), "\n")
	formatMap := make(map[string]string)
	inFormat := false
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "[FORMAT]" {
			inFormat = true
			continue
		}
		if line == "[/FORMAT]" {
			break
		}
		if inFormat && line != "" {
			if idx := strings.Index(line, "="); idx != -1 {
				key := line[:idx]
				value := line[idx+1:]
				formatMap[key] = value
			}
		}
	}
	return formatMap, nil
}

// formatTimeMs takes milliseconds and returns a string in 00:ss, mm:ss, or hh:mm:ss format.
func formatTimeMs(ms int) string {
	seconds := ms / 1000
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60

	if h > 0 {
		return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
	} else if m > 0 {
		return fmt.Sprintf("%02d:%02d", m, s)
	}
	return fmt.Sprintf("00:%02d", s)
}

// parseTimeToMs parses a string like "00:00:00.166833" (HH:MM:SS.ssssss) into milliseconds.
func parseTimeToMs(timeStr string) (int, error) {
	var h, m, s int
	var frac float64
	// Try to parse with fractional seconds
	count, err := fmt.Sscanf(timeStr, "%d:%d:%d.%f", &h, &m, &s, &frac)
	if err != nil || count < 3 {
		return 0, fmt.Errorf("invalid time format: %s", timeStr)
	}
	ms := int(frac/1000) + (h*3600+m*60+s)*1000
	return ms, nil
}
