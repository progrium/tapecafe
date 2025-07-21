package main

import (
	"fmt"

	"tractor.dev/toolkit-go/engine/cli"
)

func serveCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "serve ...",
		// Short: "",
		// Args: cli.MinArgs(1),
		Run: func(ctx *cli.Context, args []string) {
			fmt.Println("serve!")
		},
	}
	return cmd
}
