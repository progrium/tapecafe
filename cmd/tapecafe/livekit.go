package main

import (
	"fmt"

	"tractor.dev/toolkit-go/engine/cli"
)

func livekitCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "livekit ...",
		// Short: "",
		// Args: cli.MinArgs(1),
		Hidden: true,
		Run: func(ctx *cli.Context, args []string) {
			fmt.Println("livekit!")
		},
	}
	return cmd
}
