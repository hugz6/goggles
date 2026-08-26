package server

import (
	"encoding/json"
	"io"
	"net/http"

	"golang.org/x/net/websocket"
)

func metaHandler(ctl ContextSwitcher) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]bool{
			"live":         ctl.LiveClient() != nil,
			"needsContext": ctl.NeedsContext(),
		})
	}
}

func logsHandler(ctl ContextSwitcher) http.Handler {
	return websocket.Handler(func(ws *websocket.Conn) {
		defer ws.Close()
		ws.PayloadType = websocket.TextFrame // text messages on the browser side

		lc := ctl.LiveClient()
		if lc == nil {
			_, _ = io.WriteString(ws, "⚠ logs unavailable: select a kube context first\n")
			return
		}
		q := ws.Request().URL.Query()
		rc, err := lc.StreamPodLogs(
			ws.Request().Context(),
			q.Get("namespace"), q.Get("pod"), q.Get("container"),
			q.Get("previous") == "true",
		)
		if err != nil {
			_, _ = io.WriteString(ws, "log error: "+err.Error()+"\n")
			return
		}
		defer rc.Close()
		_, _ = io.Copy(ws, rc) // stops when the client disconnects
	})
}

func eventsHandler(ctl ContextSwitcher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		lc := ctl.LiveClient()
		if lc == nil {
			http.Error(w, "events unavailable: select a kube context first", http.StatusServiceUnavailable)
			return
		}
		q := r.URL.Query()
		evs, err := lc.Events(r.Context(), q.Get("namespace"), q.Get("uid"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(evs)
	}
}
