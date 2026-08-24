package server

import (
	"encoding/json"
	"net/http"
)

func graphHandler(source GraphSource) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		graph := source.Graph()
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(graph); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
	}
}
