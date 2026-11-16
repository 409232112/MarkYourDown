package main

import (
	"embed"
	"log"

	"markyourdown/internal/app"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	appCtx := app.CreateApp(assets)

	// Run application
	if err := appCtx.App.Run(); err != nil {
		log.Fatal(err)
	}
}
