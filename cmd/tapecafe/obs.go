package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/andreykaipov/goobs"
	"github.com/andreykaipov/goobs/api/requests/config"
	"github.com/andreykaipov/goobs/api/requests/inputs"
	"github.com/andreykaipov/goobs/api/requests/sceneitems"
	"github.com/andreykaipov/goobs/api/requests/stream"
	"github.com/andreykaipov/goobs/api/typedefs"
	lkp "github.com/livekit/protocol/livekit"
	"tractor.dev/toolkit-go/engine/cli"
)

func obsCmd() *cli.Command {
	cmd := &cli.Command{
		Usage:  "obs [command]",
		Hidden: true,
	}
	cmd.AddCommand(obsSetupCmd())
	cmd.AddCommand(obsStartStreamCmd())
	cmd.AddCommand(obsStopStreamCmd())
	return cmd
}

func obsSetupCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "setup <ingress-url> <stream-key>",
		Args:  cli.MinArgs(2),
		Run: func(ctx *cli.Context, args []string) {
			setupOBS(&lkp.IngressInfo{
				Url:       args[0],
				StreamKey: args[1],
			})
			log.Println("OBS setup complete")
		},
	}
	return cmd
}

func obsStartStreamCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "start",
		Run: func(ctx *cli.Context, args []string) {
			startStream()
		},
	}
	return cmd
}

func obsStopStreamCmd() *cli.Command {
	cmd := &cli.Command{
		Usage: "stop",
		Run: func(ctx *cli.Context, args []string) {
			stopStream()
		},
	}
	return cmd
}

func startStream() {
	obsClient, err := goobs.New("localhost:4455") // goobs.WithPassword("password")
	if err != nil {
		log.Println("connect:", err)
		return
	}

	// start stream
	_, err = obsClient.Stream.StartStream(&stream.StartStreamParams{})
	if err != nil {
		log.Println("stream:", err)
		return
	}
}

func stopStream() {
	obsClient, err := goobs.New("localhost:4455") // goobs.WithPassword("password")
	if err != nil {
		log.Println("connect:", err)
		return
	}

	// stop stream
	_, err = obsClient.Stream.StopStream(&stream.StopStreamParams{})
	if err != nil {
		log.Println("stream:", err)
		return
	}
}

func setupOBS(ingress *lkp.IngressInfo) {
	obsClient, err := goobs.New("localhost:4455") // goobs.WithPassword("password")
	if err != nil {
		log.Println("connect:", err)
		return
	}

	profiles, err := obsClient.Config.GetProfileList(&config.GetProfileListParams{})
	if err != nil {
		log.Println(err)
		return
	}

	found := false
	for _, p := range profiles.Profiles {
		if p == "tapecafe" {
			found = true
		}
	}
	if !found {
		_, err = obsClient.Config.CreateProfile(new(config.CreateProfileParams).WithProfileName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}
	if profiles.CurrentProfileName != "tapecafe" {
		_, err = obsClient.Config.SetCurrentProfile(new(config.SetCurrentProfileParams).WithProfileName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// tapecafe scenecollection
	scl, err := obsClient.Config.GetSceneCollectionList(&config.GetSceneCollectionListParams{})
	if err != nil {
		log.Println(err)
		return
	}
	found = false
	for _, sc := range scl.SceneCollections {
		if sc == "tapecafe" {
			found = true
		}
	}
	if !found {
		_, err = obsClient.Config.CreateSceneCollection(new(config.CreateSceneCollectionParams).WithSceneCollectionName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}
	if scl.CurrentSceneCollectionName != "tapecafe" {
		_, err = obsClient.Config.SetCurrentSceneCollection(new(config.SetCurrentSceneCollectionParams).WithSceneCollectionName("tapecafe"))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// get video settings
	videoSettings, err := obsClient.Config.GetVideoSettings(new(config.GetVideoSettingsParams))
	if err != nil {
		log.Println(err)
		return
	}

	// create background source
	il, err := obsClient.Inputs.GetInputList(inputs.NewGetInputListParams())
	if err != nil {
		log.Println(err)
		return
	}
	found = false
	for _, i := range il.Inputs {
		if i.InputName == "Background" {
			found = true
		}
	}
	if !found {
		ir, err := obsClient.Inputs.CreateInput(new(inputs.CreateInputParams).
			WithInputKind("image_source").
			WithInputName("Background").
			WithSceneItemEnabled(true).
			WithSceneName("Scene").
			WithInputSettings(map[string]any{
				"file": filepath.Join(os.Getenv("DATAPATH"), "/home/hryx/src/tapecafe/frog.gif"),
			}))
		if err != nil {
			log.Println(err)
			return
		}
		_, err = obsClient.SceneItems.SetSceneItemTransform(sceneitems.NewSetSceneItemTransformParams().
			WithSceneItemId(ir.SceneItemId).
			WithSceneName("Scene").
			WithSceneItemTransform(&typedefs.SceneItemTransform{
				PositionX:    videoSettings.BaseWidth / 2,
				PositionY:    videoSettings.BaseHeight / 2,
				BoundsWidth:  videoSettings.BaseWidth,
				BoundsHeight: videoSettings.BaseHeight,
				BoundsType:   "OBS_BOUNDS_STRETCH",
			}))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// create browser source
	found = false
	for _, i := range il.Inputs {
		if i.InputName == "YouTube" {
			found = true
		}
	}
	if !found {
		ir, err := obsClient.Inputs.CreateInput(new(inputs.CreateInputParams).
			WithInputKind("browser_source").
			WithInputName("YouTube").
			WithSceneItemEnabled(true).
			WithSceneName("Scene").
			WithInputSettings(map[string]any{
				"url":                 "", //"https://hopollo.github.io/OBS-Youtube-Player/?watch?v=lSqnqSSXTUI&list=RDlSqnqSSXTUI&volume=10&random=true&loop=true",
				"reroute_audio":       true,
				"restart_when_active": true,
				"shutdown":            true,
				"width":               535,
				"height":              300,
			}))
		if err != nil {
			log.Println(err)
			return
		}
		_, err = obsClient.SceneItems.SetSceneItemTransform(sceneitems.NewSetSceneItemTransformParams().
			WithSceneItemId(ir.SceneItemId).
			WithSceneName("Scene").
			WithSceneItemTransform(&typedefs.SceneItemTransform{
				PositionX:    videoSettings.BaseWidth / 2,
				PositionY:    videoSettings.BaseHeight / 2,
				BoundsWidth:  videoSettings.BaseWidth,
				BoundsHeight: videoSettings.BaseHeight,
				BoundsType:   "OBS_BOUNDS_STRETCH",
			}))
		if err != nil {
			log.Println(err)
			return
		}
	}

	// clear browser url
	_, err = obsClient.Inputs.SetInputSettings(inputs.NewSetInputSettingsParams().
		WithInputName("YouTube").
		WithInputSettings(map[string]any{
			"url": "",
		}))
	if err != nil {
		log.Println("clear:", err)
		return
	}

	// set stream config
	_, err = obsClient.Config.SetStreamServiceSettings(config.NewSetStreamServiceSettingsParams().
		WithStreamServiceType("rtmp_custom").
		WithStreamServiceSettings(&typedefs.StreamServiceSettings{
			Server: ingress.Url,
			Key:    ingress.StreamKey,
		}))
	if err != nil {
		log.Println(err)
		return
	}

}
