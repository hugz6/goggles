// Package poll holds the current model in a thread-safe cache (Store),
// refreshed periodically by Run.
package poll

import (
	"context"
	"log"
	"sync"
	"time"

	"g5s/internal/domain"
)

// Loader errors are non-fatal: Run keeps the last model and retries next tick.
type Loader func() (*domain.Graph, error)

type Store struct {
	mu    sync.RWMutex
	graph *domain.Graph
}

func NewStore(initial *domain.Graph) *Store {
	if initial == nil {
		initial = &domain.Graph{}
	}
	return &Store{graph: initial}
}

func (s *Store) Graph() *domain.Graph {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.graph
}

func (s *Store) Set(g *domain.Graph) {
	s.mu.Lock()
	s.graph = g
	s.mu.Unlock()
}

// Run polls every `every` until ctx is done. every <= 0 disables it. Blocking.
func Run(ctx context.Context, store *Store, load Loader, every time.Duration) {
	if every <= 0 {
		return
	}
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			g, err := load()
			if err != nil {
				log.Printf("refresh skipped: %v", err)
				continue
			}
			store.Set(g)
		}
	}
}
