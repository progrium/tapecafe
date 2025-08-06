package caster

import (
	"log"
	"strings"

	"github.com/progrium/tapecafe/ffmpeg"
)

func cmds(sess *Session) map[string]func([]string) error {
	if sess.Filename == "" {
		return map[string]func([]string) error{}
	}
	slashYouTube := func(args []string) error {
		sess.pause()
		sess.setStatus(StatusDownload)
		filename, err := DownloadYoutubeVideo(args[0])
		if err != nil {
			return err
		}
		title, err := ffmpeg.FileTitle(filename)
		if err != nil {
			return err
		}
		sess.mu.Lock()
		sess.Filename = filename
		sess.State.Title = title
		sess.mu.Unlock()
		if err := sess.loadFile(); err != nil {
			return err
		}
		return sess.play(0)
	}
	slashPlaySeek := func(args []string) error {
		startTime := sess.State.Position
		if len(args) > 0 {
			startTime = args[0]
		}
		startMs, err := ffmpeg.ParseTimeToMs(startTime)
		if err != nil {
			return err
		}
		log.Println("starting ffmpeg process at", startTime)
		return sess.play(startMs)
	}
	slashPause := func(args []string) error {
		return sess.pause()
	}
	slashBack := func(args []string) error {
		if err := sess.FFmpeg.Stop(); err != nil {
			sess.setStatus(StatusError)
			return err
		}
		backTime := "00:10"
		if len(args) > 0 {
			if strings.Contains(args[0], ":") {
				backTime = args[0]
			} else {
				backTime = "00:" + args[0]
			}
		}
		backMs, err := ffmpeg.ParseTimeToMs(backTime)
		if err != nil {
			return err
		}

		sess.mu.Lock()
		newPosMs := sess.State.PositionMs - backMs
		if newPosMs < 0 {
			newPosMs = 0
		}
		sess.mu.Unlock()

		log.Println("seeking back to", sess.State.Position)
		return sess.seek(newPosMs)
	}
	slashForward := func(args []string) error {
		if err := sess.FFmpeg.Stop(); err != nil {
			sess.setStatus(StatusError)
			return err
		}
		forwardTime := "00:10"
		if len(args) > 0 {
			if strings.Contains(args[0], ":") {
				forwardTime = args[0]
			} else {
				forwardTime = "00:" + args[0]
			}
		}
		forwardMs, err := ffmpeg.ParseTimeToMs(forwardTime)
		if err != nil {
			return err
		}

		sess.mu.Lock()
		newPosMs := sess.State.PositionMs + forwardMs
		sess.mu.Unlock()

		log.Println("seeking forward to", sess.State.Position)
		return sess.seek(newPosMs)
	}
	return map[string]func([]string) error{
		"/play":    slashPlaySeek,
		"/seek":    slashPlaySeek,
		"/pause":   slashPause,
		"/back":    slashBack,
		"/fwd":     slashForward,
		"/forward": slashForward,
		"/yt":      slashYouTube,
		"/youtube": slashYouTube,
	}
}
