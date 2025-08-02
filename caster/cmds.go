package caster

import (
	"log"
	"strings"

	"github.com/progrium/tapecafe/ffmpeg"
)

func cmds(sess *Session) map[string]func([]string) error {
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
		sess.pause()
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
		sess.State.PositionMs = newPosMs
		sess.State.Position = ffmpeg.FormatTimeMs(newPosMs)
		sess.mu.Unlock()

		log.Println("seeking back to", sess.State.Position)
		return sess.play(sess.State.PositionMs)
	}
	slashForward := func(args []string) error {
		sess.pause()
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
		sess.State.PositionMs = newPosMs
		sess.State.Position = ffmpeg.FormatTimeMs(newPosMs)
		sess.mu.Unlock()

		log.Println("seeking forward to", sess.State.Position)
		return sess.play(sess.State.PositionMs)
	}
	return map[string]func([]string) error{
		"/play":    slashPlaySeek,
		"/seek":    slashPlaySeek,
		"/pause":   slashPause,
		"/back":    slashBack,
		"/fwd":     slashForward,
		"/forward": slashForward,
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
