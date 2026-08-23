package poll

import (
	"context"
	"errors"
	"testing"
	"time"

	"g5s/internal/domain"
)

func graphWith(n int) *domain.Graph {
	nodes := make([]domain.Node, n)
	return &domain.Graph{Nodes: nodes}
}

func TestStoreServesLatest(t *testing.T) {
	s := NewStore(graphWith(1))
	if got := len(s.Graph().Nodes); got != 1 {
		t.Fatalf("initial model: want 1 node, got %d", got)
	}
	s.Set(graphWith(3))
	if got := len(s.Graph().Nodes); got != 3 {
		t.Errorf("after set: want 3 nodes, got %d", got)
	}
}

func TestRunRefreshes(t *testing.T) {
	s := NewStore(graphWith(0))
	load := func() (*domain.Graph, error) { return graphWith(5), nil }

	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan struct{})
	go func() { Run(ctx, s, load, 5*time.Millisecond); close(done) }()

	if !eventually(t, func() bool { return len(s.Graph().Nodes) == 5 }) {
		t.Fatal("the store was not refreshed")
	}
	cancel()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Error("Run did not return after cancellation")
	}
}

func TestRunKeepsLastOnError(t *testing.T) {
	s := NewStore(graphWith(2))
	load := func() (*domain.Graph, error) { return nil, errors.New("cluster unreachable") }

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go Run(ctx, s, load, 5*time.Millisecond)

	time.Sleep(30 * time.Millisecond) // let several ticks fail
	if got := len(s.Graph().Nodes); got != 2 {
		t.Errorf("the last valid model must be kept, got %d nodes", got)
	}
}

func eventually(t *testing.T, cond func() bool) bool {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if cond() {
			return true
		}
		time.Sleep(2 * time.Millisecond)
	}
	return false
}
