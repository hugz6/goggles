// Package server exposes the domain model as JSON and serves the frontend.
package server

import (
	"io/fs"
	"net/http"

	"g5s/internal/domain"
)

type GraphSource interface {
	Graph() *domain.Graph
}

func New(assets fs.FS, source GraphSource, ctl ContextSwitcher) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/graph", graphHandler(source))
	mux.HandleFunc("/api/meta", metaHandler(ctl))
	mux.Handle("/api/logs", logsHandler(ctl))
	mux.HandleFunc("/api/events", eventsHandler(ctl))
	mux.HandleFunc("/api/contexts", contextsHandler(ctl))
	mux.HandleFunc("/api/context", selectContextHandler(ctl))
	mux.Handle("/", http.FileServer(http.FS(assets)))
	return mux
}
