package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"g5s/internal/live"
)

type stubSwitcher struct {
	names     []string
	current   string
	listErr   error
	selectErr error
	selected  string
}

func (s *stubSwitcher) ListContexts() ([]string, string, error) { return s.names, s.current, s.listErr }
func (s *stubSwitcher) SelectContext(name string) error {
	s.selected = name
	return s.selectErr
}
func (s *stubSwitcher) NeedsContext() bool       { return s.selected == "" }
func (s *stubSwitcher) LiveClient() *live.Client { return nil }

func TestContextsHandler(t *testing.T) {
	s := &stubSwitcher{names: []string{"a", "b"}, current: "a"}
	rec := httptest.NewRecorder()
	contextsHandler(s)(rec, httptest.NewRequest(http.MethodGet, "/api/contexts", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status: want 200, got %d", rec.Code)
	}
	var body struct {
		Contexts []string `json:"contexts"`
		Current  string   `json:"current"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Current != "a" || len(body.Contexts) != 2 {
		t.Errorf("unexpected body: %+v", body)
	}
}

func TestSelectContextHandler(t *testing.T) {
	s := &stubSwitcher{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/context", strings.NewReader(`{"name":"kind-dev"}`))
	selectContextHandler(s)(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status: want 204, got %d (%s)", rec.Code, rec.Body)
	}
	if s.selected != "kind-dev" {
		t.Errorf("SelectContext: want kind-dev, got %q", s.selected)
	}
}

func TestSelectContextHandlerRejectsEmptyName(t *testing.T) {
	s := &stubSwitcher{}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/context", strings.NewReader(`{}`))
	selectContextHandler(s)(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status: want 400, got %d", rec.Code)
	}
	if s.selected != "" {
		t.Errorf("SelectContext must not be called on invalid body")
	}
}
