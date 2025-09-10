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
	var (
		title string
	)
	cmd := &cli.Command{
		Usage: "cast <server-url> <room> [filename]",
		// Short: "",
		Args: cli.MinArgs(2),
		Run: func(ctx *cli.Context, args []string) {
			var (
				serverURL = args[0]
				room      = args[1]
				filename  = ""
			)
			if len(args) > 2 {
				filename = args[2]
			}

			session, err := caster.New(serverURL, room, filename, title)
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
	cmd.Flags().StringVar(&title, "title", "", "title to use for the session")
	return cmd
}
