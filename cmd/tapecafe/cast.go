package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/progrium/tapecafe/caster"
	"tractor.dev/toolkit-go/engine/cli"
)

func castCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "cast <server-url> <filename> [title]",
		// Short: "",
		Args: cli.MinArgs(2),
		Run: func(ctx *cli.Context, args []string) {
			var (
				serverURL = args[0]
				filename  = args[1]
				title     = ""
			)
			if len(args) > 2 {
				title = args[2]
			}

			session, err := caster.New(serverURL, filename, title)
			if err != nil {
				log.Fatal("cast:", err)
			}

			if err := session.Start(); err != nil {
				log.Fatal("cast:", err)
			}

			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, os.Interrupt, syscall.SIGINT)
			<-sigChan
			log.Println("Caught SIGINT, shutting down...")
			if err := session.Shutdown(); err != nil {
				log.Fatal("cast:", err)
			}
		},
	}
	return cmd
}
