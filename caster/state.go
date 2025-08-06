package caster

type SharedState struct {
	Title      string
	Length     string
	LengthMs   int
	Position   string
	PositionMs int
	Status     Status
}

type Status string

const (
	StatusPlaying  Status = ""
	StatusInit     Status = "█ NO TAPE"
	StatusStarting Status = "⏵ PLAY"
	StatusPaused   Status = "▊ PAUSE"
	StatusReady    Status = "⏯ TAPE READY"
	StatusSeeking  Status = "⏩ SEEK"
	StatusFwd      Status = "⏭ FWD"
	StatusBack     Status = "⏮ BACK"
	StatusFinished Status = "⏏ EJECT"
	StatusLive     Status = "⏺ LIVE FEED"
	StatusDownload Status = "⏬ DOWNLOADING"
	StatusError    Status = "! ERROR"
)
