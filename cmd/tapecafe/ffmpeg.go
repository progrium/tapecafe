package main

import (
	"bufio"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"

	"tractor.dev/toolkit-go/engine/cli"
)

func ffmpegCmd() *cli.Command {
	cmd := &cli.Command{
		Usage:  "ffmpeg [command]",
		Hidden: true,
	}
	cmd.AddCommand(ffmpegTestCmd())
	return cmd
}

func ffmpegTestCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "test <filename>",
		Args:  cli.MinArgs(1),
		Run: func(ctx *cli.Context, args []string) {
			progressChan := make(chan map[string]string)
			startMs := 0

			exec.Command("rm", "-f", "./live.flv").Run()
			cmd, err := streamFile(args[0], startMs, "./live.flv", progressChan)
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

			fmt.Println(cmd.Wait())
		},
	}
	return cmd
}

func streamFile(filename string, seekMs int, output string, progressChan chan map[string]string) (*exec.Cmd, error) {
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
		output)
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
