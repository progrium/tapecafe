package main

import (
	"fmt"

	"tractor.dev/toolkit-go/engine/cli"
)

func castCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "cast ...",
		// Short: "",
		// Args: cli.MinArgs(1),
		Run: func(ctx *cli.Context, args []string) {
			fmt.Println("cast!")
		},
	}
	return cmd
}
