// Command g5s serves the embedded frontend and the cluster model API. With no
// args it starts empty and the frontend picks a kube context at runtime.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"g5s/internal/acquire"
	"g5s/internal/domain"
	"g5s/internal/live"
	"g5s/internal/poll"
	"g5s/internal/server"
	"g5s/internal/webui"
)

var version = "dev"

func main() {
	addr := flag.String("addr", ":8080", "HTTP server listen address")
	snapshot := flag.String("snapshot", "", "path to a snapshot file to load as data source")
	cluster := flag.Bool("cluster", false, "read the live cluster (kubeconfig auto-resolved)")
	kubeconfig := flag.String("kubeconfig", "", "kubeconfig path (default: $KUBECONFIG then ~/.kube/config)")
	kubeContext := flag.String("context", "", "kubeconfig context to use (default: current)")
	listContexts := flag.Bool("list-contexts", false, "list kubeconfig contexts then exit")
	dump := flag.String("dump", "", "write a cluster snapshot to this path then exit")
	pollEvery := flag.Duration("poll", 5*time.Second, "model refresh interval (0 to disable)")
	showVersion := flag.Bool("version", false, "print the version then exit")
	flag.Parse()

	if *showVersion {
		fmt.Println(version)
		return
	}

	// any cluster-selecting flag implies --cluster
	useCluster := *cluster || *kubeconfig != "" || *kubeContext != "" || *dump != "" || *listContexts

	if *listContexts {
		names, current, err := acquire.ListContexts(*kubeconfig)
		if err != nil {
			log.Fatalf("listing contexts: %v", err)
		}
		for _, name := range names {
			marker := "  "
			if name == current {
				marker = "* "
			}
			log.Printf("%s%s", marker, name)
		}
		return
	}

	if *dump != "" {
		objs, deg, err := acquire.LoadCluster(*kubeconfig, *kubeContext)
		if err != nil {
			log.Fatalf("reading cluster: %v", err)
		}
		if err := acquire.WriteSnapshot(*dump, objs); err != nil {
			log.Fatalf("writing dump: %v", err)
		}
		logDegraded(deg)
		log.Printf("dump written: %s (%d pods)", *dump, len(objs.Pods))
		return
	}

	store := poll.NewStore(nil)
	ctl := newController(*kubeconfig, *pollEvery, store)

	switch {
	case useCluster:
		if err := ctl.SelectContext(*kubeContext); err != nil {
			log.Fatalf("reading cluster: %v", err)
		}
	case *snapshot != "":
		objs, err := acquire.LoadSnapshot(*snapshot)
		if err != nil {
			log.Fatalf("loading snapshot: %v", err)
		}
		graph := domain.BuildGraph(objs)
		store.Set(graph)
		log.Printf("model built: %d nodes, %d edges (snapshot: %s)", len(graph.Nodes), len(graph.Edges), *snapshot)
		if *pollEvery > 0 {
			// re-reads the file, so edits show up without a restart
			load := func() (*domain.Graph, error) {
				o, err := acquire.LoadSnapshot(*snapshot)
				if err != nil {
					return nil, err
				}
				return domain.BuildGraph(o), nil
			}
			go poll.Run(context.Background(), store, load, *pollEvery)
			log.Printf("auto-refresh every %s", *pollEvery)
		}
		ctl.markActive()
	default:
		log.Printf("no context selected: choose one in the browser")
	}

	mux := server.New(webui.FS(), store, ctl)

	log.Printf("g5s listening on http://localhost%s", *addr)
	if err := http.ListenAndServe(*addr, mux); err != nil {
		log.Fatal(err)
	}
}

func logDegraded(deg *acquire.Degraded) {
	for resource, reason := range deg.Unloaded {
		log.Printf("resource not loaded (permissions?): %s - %s", resource, reason)
	}
}

// controller implements server.ContextSwitcher.
type controller struct {
	kubeconfig string
	pollEvery  time.Duration
	store      *poll.Store

	mu     sync.Mutex
	active bool
	cancel context.CancelFunc
	live   *live.Client
}

func newController(kubeconfig string, pollEvery time.Duration, store *poll.Store) *controller {
	return &controller{kubeconfig: kubeconfig, pollEvery: pollEvery, store: store}
}

func (c *controller) ListContexts() ([]string, string, error) {
	return acquire.ListContexts(c.kubeconfig)
}

func (c *controller) SelectContext(name string) error {
	objs, deg, err := acquire.LoadCluster(c.kubeconfig, name)
	if err != nil {
		return err
	}
	logDegraded(deg)
	graph := domain.BuildGraph(objs)
	c.store.Set(graph)
	log.Printf("model built: %d nodes, %d edges (cluster, context: %q)", len(graph.Nodes), len(graph.Edges), name)

	lc, err := live.NewClient(c.kubeconfig, name)
	if err != nil {
		log.Printf("live client unavailable (logs/events disabled): %v", err)
		lc = nil
	}

	var ctx context.Context
	var cancel context.CancelFunc
	if c.pollEvery > 0 {
		ctx, cancel = context.WithCancel(context.Background())
	}
	load := func() (*domain.Graph, error) {
		o, _, err := acquire.LoadCluster(c.kubeconfig, name)
		if err != nil {
			return nil, err
		}
		return domain.BuildGraph(o), nil
	}

	c.mu.Lock()
	if c.cancel != nil {
		c.cancel() // stop the previous context's polling loop
	}
	c.cancel = cancel
	c.live = lc
	c.active = true
	c.mu.Unlock()

	if cancel != nil {
		go poll.Run(ctx, c.store, load, c.pollEvery)
	}
	return nil
}

func (c *controller) markActive() {
	c.mu.Lock()
	c.active = true
	c.mu.Unlock()
}

func (c *controller) NeedsContext() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return !c.active
}

func (c *controller) LiveClient() *live.Client {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.live
}
