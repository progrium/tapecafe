package caster

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/kkdai/youtube/v2"
	"github.com/progrium/tapecafe/ffmpeg"
)

func DownloadYoutubeVideo(url string) (string, error) {
	videoID, ok := detectYouTubeURL(url)
	if !ok {
		return "", fmt.Errorf("invalid YouTube URL: %s", url)
	}
	client := youtube.Client{}

	video, err := client.GetVideo(videoID)
	if err != nil {
		return "", err
	}

	vformats := video.Formats.Type("video").AudioChannels(0)
	idx := 0
	for i, format := range vformats {
		if strings.Contains(format.Quality, "1080") {
			idx = i
		}
	}
	log.Println("downloading youtube:", videoID, vformats[idx].Quality)
	vstream, _, err := client.GetStream(video, &vformats[idx])
	if err != nil {
		return "", err
	}
	defer vstream.Close()

	aformats := video.Formats.Type("audio")
	astream, _, err := client.GetStream(video, &aformats[0])
	if err != nil {
		return "", err
	}
	defer astream.Close()

	tempDir := os.TempDir()

	videoFilename := filepath.Join(tempDir, videoID+".video.mp4")
	vfile, err := os.Create(videoFilename)
	if err != nil {
		return "", err
	}
	defer vfile.Close()

	audioFilename := filepath.Join(tempDir, videoID+".audio.mp4")
	afile, err := os.Create(audioFilename)
	if err != nil {
		return "", err
	}
	defer afile.Close()

	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, err = io.Copy(vfile, vstream)
		if err != nil {
			log.Println(err)
		}
	}()
	go func() {
		defer wg.Done()
		_, err = io.Copy(afile, astream)
		if err != nil {
			log.Println(err)
		}
	}()
	wg.Wait()

	outputFilename := filepath.Join(tempDir, videoID+".mp4")
	if err := ffmpeg.MergeAV(videoFilename, audioFilename, outputFilename, video.Title); err != nil {
		return "", err
	}
	return outputFilename, nil
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
