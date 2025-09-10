package caster

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/progrium/tapecafe/ffmpeg"
	"golang.org/x/net/websocket"
	"tractor.dev/toolkit-go/duplex/codec"
	"tractor.dev/toolkit-go/duplex/mux"
	"tractor.dev/toolkit-go/duplex/rpc"
)

type Session struct {
	Room         string
	Filename     string
	ServerURL    url.URL
	LocalIngress url.URL
	State        SharedState
	FFmpeg       *ffmpeg.Runner

	rpc *rpc.Client
	mu  sync.Mutex
}

func dialRPC(baseURL url.URL, room string) (*rpc.Client, error) {
	rpcURL := baseURL
	rpcURL.Path = "/-/cast/rpc"

	originURL := baseURL
	originURL.Path = ""
	if originURL.Scheme == "wss" {
		originURL.Scheme = "https"
	} else {
		originURL.Scheme = "http"
	}

	var ws *websocket.Conn
	var err error
	ws, err = websocket.Dial(rpcURL.String()+"?room="+room, "", originURL.String())
	if err != nil {
		return nil, err

	}
	ws.PayloadType = websocket.BinaryFrame
	return rpc.NewClient(mux.New(ws), codec.CBORCodec{}), nil
}

func New(serverURL, room, filename, title string) (*Session, error) {
	u, err := url.Parse(serverURL)
	if err != nil {
		return nil, err
	}
	if u.Scheme == "http" {
		u.Scheme = "ws"
	}
	if u.Scheme == "https" {
		u.Scheme = "wss"
	}
	if !strings.HasPrefix(u.Scheme, "ws") {
		return nil, fmt.Errorf("invalid scheme: %s", u.Scheme)
	}
	u.Path = ""

	client, err := dialRPC(*u, room)
	if err != nil {
		return nil, fmt.Errorf("dial RPC: %w", err)
	}

	if title == "" && filename != "" {
		title, err = ffmpeg.FileTitle(filename)
		if err != nil {
			return nil, fmt.Errorf("get title: %w %s", err, filename)
		}
		if title == "" {
			title = filepath.Base(filename)
		}
	}

	return &Session{
		Room:      room,
		Filename:  filename,
		ServerURL: *u,
		State: SharedState{
			Title:    title,
			Status:   StatusInit,
			Position: ffmpeg.FormatTimeMs(0),
		},
		FFmpeg: ffmpeg.NewRunner(),
		rpc:    client,
	}, nil
}

func (s *Session) Start() error {
	s.mu.Lock()
	status := s.State.Status
	s.mu.Unlock()
	if status != StatusInit {
		return fmt.Errorf("session already started")
	}

	if err := s.setupIngress(s.Room); err != nil {
		return err
	}

	if err := s.setupChat(); err != nil {
		return err
	}

	if s.Filename != "" {
		if err := s.loadFile(); err != nil {
			return err
		}
		go s.handleProgress()
		return s.setStatus(StatusReady)
	}

	// Pre-live feed with no file we'll be "playing" (no status)
	return s.setStatus(StatusPlaying)
}

func (s *Session) Shutdown() error {
	s.setStatus(StatusFinished)
	return s.rpc.Close()
}

func (s *Session) loadFile() error {
	if _, err := os.Stat(s.Filename); os.IsNotExist(err) {
		return fmt.Errorf("file does not exist: %s", s.Filename)
	}

	dur, err := ffmpeg.FileDurationMs(s.Filename)
	if err != nil {
		return err
	}

	s.State.LengthMs = dur
	s.State.Length = ffmpeg.FormatTimeMs(dur)

	return nil
}

func (s *Session) handleProgress() {
	lastRun := 0
	for update := range s.FFmpeg.Updates {
		if update.Run < lastRun {
			continue
		}
		lastRun = update.Run
		if update.Progress["out_time"] == "N/A" {
			continue
		}
		timeMs, err := ffmpeg.ParseTimeToMs(update.Progress["out_time"])
		if err != nil {
			log.Fatal("parse time:", err)
		}
		posMs := update.SeekMs + timeMs
		s.mu.Lock()
		s.State.Status = StatusPlaying
		s.State.Position = ffmpeg.FormatTimeMs(posMs)
		s.State.PositionMs = posMs
		s.mu.Unlock()
		s.sendState()
	}
}

func (s *Session) setStatus(status Status) error {
	s.mu.Lock()
	s.State.Status = status
	s.mu.Unlock()
	return s.sendState()
}

func (s *Session) sendState() error {
	s.mu.Lock()
	state := s.State
	s.mu.Unlock()

	_, err := s.rpc.Call(context.Background(), "cast.state", state)
	if err != nil {
		return err
	}
	return nil
}

func (s *Session) setupIngress(room string) error {
	var ingressPath string
	_, err := s.rpc.Call(context.Background(), "cast.ingress", room, &ingressPath)
	if err != nil {
		return err
	}

	l, err := net.Listen("tcp4", ":0")
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.LocalIngress.Scheme = "rtmp"
	s.LocalIngress.Host = l.Addr().String()
	s.LocalIngress.Path = ingressPath
	ingressURL := s.ServerURL
	ingressURL.Path = "/-/cast/ingress"
	s.mu.Unlock()

	log.Println("ingress:", s.LocalIngress.String())

	go func() {
		var (
			ws *websocket.Conn
		)
		for {
			conn, err := l.Accept()
			if err != nil {
				log.Fatal("ingress:", err)
			}
			if ws != nil {
				ws.Close()
			}
			ws, err = websocket.Dial(ingressURL.String()+"?room="+room, "", s.ServerURL.String())
			if err != nil {
				log.Fatal("ingress:", err)
			}
			s.mu.Lock()
			if s.Filename == "" && s.State.Status == StatusPlaying {
				s.State.Status = StatusLive
				s.State.Position = ffmpeg.FormatTimeMs(0)
				s.State.PositionMs = 0
			}
			s.mu.Unlock()
			s.sendState()

			go func() {
				_, err := io.Copy(ws, conn)
				if err != nil {
					log.Println("ingress:", err)
				}
			}()
			go func() {
				_, err := io.Copy(conn, ws)
				if err != nil {
					log.Println("ingress:", err)
				}
			}()
		}
	}()

	return nil
}

func (s *Session) setupChat() error {
	resp, err := s.rpc.Call(context.Background(), "cast.chat", nil, nil)
	if err != nil {
		return err
	}
	if !resp.Continue() {
		return fmt.Errorf("chat not supported")
	}

	go func() {
		for {
			var msg map[string]any
			if err := resp.Receive(&msg); err != nil {
				if err == io.EOF {
					return
				}
				log.Fatal("chat:", err)
			}
			log.Println("CHAT:", msg)

			args := strings.Split(msg["message"].(string), " ")
			c := cmds(s)[args[0]]
			if c == nil {
				continue
			}
			if err := c(args[1:]); err != nil {
				log.Println("cmd:", err)
			}
		}
	}()

	return nil
}

func (s *Session) play(startMs int) error {
	if err := s.FFmpeg.Start(s.Filename, startMs, s.LocalIngress.String()); err != nil {
		s.setStatus(StatusError)
		return err
	}
	return s.setStatus(StatusStarting)
}

func (s *Session) seek(posMs int) error {
	s.mu.Lock()
	oldPosMs := s.State.PositionMs
	s.State.PositionMs = posMs
	s.State.Position = ffmpeg.FormatTimeMs(posMs)
	status := s.State.Status
	s.mu.Unlock()
	if status == StatusPlaying {
		if err := s.FFmpeg.Start(s.Filename, posMs, s.LocalIngress.String()); err != nil {
			s.setStatus(StatusError)
			return err
		}
		offsetMs := posMs - oldPosMs
		if offsetMs > 0 {
			log.Println("seeking forward", offsetMs)
			return s.setStatus(StatusFwd)
		} else if offsetMs < 0 {
			log.Println("seeking forward", offsetMs)
			return s.setStatus(StatusBack)
		}
		return s.setStatus(StatusSeeking)
	}
	return nil
}

func (s *Session) pause() error {
	if err := s.FFmpeg.Stop(); err != nil {
		s.setStatus(StatusError)
		return err
	}
	return s.setStatus(StatusPaused)
}

func (s *Session) stop() error {
	if err := s.FFmpeg.Stop(); err != nil {
		s.setStatus(StatusError)
		return err
	}
	s.mu.Lock()
	s.Filename = ""
	s.State.Title = ""
	s.State.Position = ffmpeg.FormatTimeMs(0)
	s.State.PositionMs = 0
	s.mu.Unlock()
	return s.setStatus(StatusFinished)
}
