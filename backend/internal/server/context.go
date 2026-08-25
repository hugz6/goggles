package server

import (
	"encoding/json"
	"net/http"

	"g5s/internal/live"
)

// ContextSwitcher lets the frontend pick a kube context at runtime.
type ContextSwitcher interface {
	ListContexts() (names []string, current string, err error)
	SelectContext(name string) error
	NeedsContext() bool       // true until a context or snapshot is active
	LiveClient() *live.Client // nil until a context is selected
}

func contextsHandler(ctl ContextSwitcher) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		names, current, err := ctl.ListContexts()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"contexts": names,
			"current":  current,
		})
	}
}

func selectContextHandler(ctl ContextSwitcher) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "POST required", http.StatusMethodNotAllowed)
			return
		}
		var body struct {
			Name string `json:"name"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Name == "" {
			http.Error(w, `invalid body: expected {"name": "context-name"}`, http.StatusBadRequest)
			return
		}
		if err := ctl.SelectContext(body.Name); err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}
