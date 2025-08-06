package ffmpeg

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
)

type Runner struct {
	Process *exec.Cmd
	Run     int
	Updates chan Update
	sync.Mutex
}

func NewRunner() *Runner {
	return &Runner{
		Updates: make(chan Update),
	}
}

type Update struct {
	Run      int
	SeekMs   int
	Progress Progress
}

type Progress map[string]string

func (r *Runner) Shutdown() error {
	return r.Process.Process.Kill()
}

func (r *Runner) Stop() error {
	r.Lock()
	defer r.Unlock()
	if r.Process == nil {
		return nil
	}
	err := r.Process.Process.Kill()
	r.Process = nil
	return err
}

func (r *Runner) Start(filename string, seekMs int, output string) error {
	r.Lock()
	defer r.Unlock()
	cmd, err := StreamFile(filename, seekMs, output, r.Run, r.Updates)
	if err != nil {
		return err
	}
	if r.Process != nil {
		if err := r.Process.Process.Kill(); err != nil {
			return err
		}
	}
	r.Process = cmd
	r.Run++
	return nil
}

func StreamFile(filename string, seekMs int, output string, run int, updates chan Update) (*exec.Cmd, error) {
	fmt.Println("STREAMING:", filename, FormatTimeMs(seekMs))
	cmd := exec.Command("ffmpeg",
		"-nostats",
		"-progress", "pipe:1",
		"-loglevel", "quiet",
		"-re",
		"-ss", FormatTimeMs(seekMs),
		"-i", filename,
		"-c:v", "libx264",
		"-c:a", "aac",
		"-b:a", "160k",
		"-b:v", "3M",
		"-preset", "veryfast",
		"-f", "flv",
		output)
	cmd.Stderr = os.Stderr

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe: %w", err)
	}

	go func() {
		// defer close(progressChan)

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

					updates <- Update{
						Run:      run,
						SeekMs:   seekMs,
						Progress: progressMap,
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

func MergeAV(videoFilename, audioFilename, outputFilename, title string) error {
	cmd := exec.Command("ffmpeg", "-i", videoFilename, "-i", audioFilename, "-metadata", "title="+title, "-c", "copy", "-shortest", outputFilename)
	return cmd.Run()
}

func FileTitle(filename string) (string, error) {
	format, err := ProbeFormat(filename)
	if err != nil {
		return "", err
	}
	tags, ok := format["tags"].(map[string]any)
	if !ok {
		return "", nil
	}
	title, ok := tags["title"].(string)
	if !ok {
		return "", nil
	}
	return title, nil
}

func FileDurationMs(filename string) (int, error) {
	format, err := ProbeFormat(filename)
	if err != nil {
		return 0, err
	}

	durMs := 0.0
	duration := format["duration"].(string)
	fmt.Sscanf(duration, "%f", &durMs)

	return int(durMs * 1000), nil
}

func ProbeFormat(filename string) (map[string]any, error) {
	cmd := exec.Command("ffprobe", "-i", filename, "-show_format", "-v", "quiet", "-of", "json")
	output, err := cmd.Output()
	if err != nil {
		return nil, err
	}

	var format map[string]any
	if err := json.Unmarshal(output, &format); err != nil {
		return nil, err
	}
	return format["format"].(map[string]any), nil
}

// formatTimeMs takes milliseconds and returns a string in mm:ss or hh:mm:ss format.
func FormatTimeMs(ms int) string {
	seconds := ms / 1000
	h := seconds / 3600
	m := (seconds % 3600) / 60
	s := seconds % 60

	if h > 0 {
		return fmt.Sprintf("%02d:%02d:%02d", h, m, s)
	}
	return fmt.Sprintf("%02d:%02d", m, s)
}

// parseTimeToMs parses a string like "00:00:00.166833" (HH:MM:SS.ssssss) into milliseconds.
func ParseTimeToMs(timeStr string) (int, error) {
	var h, m, s int
	var frac float64
	var err error
	colons := strings.Count(timeStr, ":")
	if colons == 1 {
		_, err = fmt.Sscanf(timeStr, "%d:%d", &m, &s)
	} else if colons == 2 {
		if strings.Count(timeStr, ".") == 1 {
			_, err = fmt.Sscanf(timeStr, "%d:%d:%d.%f", &h, &m, &s, &frac)
		} else {
			_, err = fmt.Sscanf(timeStr, "%d:%d:%d", &h, &m, &s)
		}
	}
	if err != nil {
		return 0, fmt.Errorf("invalid time format: %s", timeStr)
	}
	ms := int(frac/1000) + (h*3600+m*60+s)*1000
	return ms, nil
}
