// Package webui embeds the compiled frontend (npm run build outputs here).
package webui

import (
	"embed"
	"io/fs"
)

//go:embed dist
var distFS embed.FS

// FS returns the embedded frontend, rooted at its index.html.
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err) // dist is embedded above; Sub on a known-good root cannot fail
	}
	return sub
}
