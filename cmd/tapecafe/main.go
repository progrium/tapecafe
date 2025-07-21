package main

import (
	"context"
	"log"
	"os"

	"tractor.dev/toolkit-go/engine/cli"
)

var Version = "dev"

func main() {
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)

	root := &cli.Command{
		Version: Version,
		Usage:   "tapecafe",
	}

	root.AddCommand(serveCmd())
	root.AddCommand(castCmd())
	root.AddCommand(livekitCmd())

	if err := cli.Execute(context.Background(), root, os.Args[1:]); err != nil {
		log.Fatal(err)
	}
}
