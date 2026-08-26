// Package live streams pod logs and reads events - cluster-only, not part of
// the graph model.
package live

import (
	"context"
	"fmt"
	"io"
	"sort"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"

	"g5s/internal/acquire"
)

const tailLines int64 = 500 // history replayed before following

type Event struct {
	Type    string `json:"type"` // Normal | Warning
	Reason  string `json:"reason"`
	Message string `json:"message"`
	Count   int32  `json:"count"`
	Age     string `json:"age"`    // since last occurrence, compact
	Source  string `json:"source"` // emitting component (kubelet, scheduler…)
}

type Client struct {
	cs kubernetes.Interface
}

func NewClient(kubeconfigPath, contextName string) (*Client, error) {
	cfg, err := acquire.RestConfig(kubeconfigPath, contextName)
	if err != nil {
		return nil, err
	}
	cs, err := kubernetes.NewForConfig(cfg)
	if err != nil {
		return nil, fmt.Errorf("creating live client: %w", err)
	}
	return &Client{cs: cs}, nil
}

// StreamPodLogs: previous = logs of the prior (crashed) instance. Caller closes
// the ReadCloser to stop following.
func (c *Client) StreamPodLogs(ctx context.Context, ns, pod, container string, previous bool) (io.ReadCloser, error) {
	tail := tailLines
	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    true,
		Previous:  previous,
		TailLines: &tail,
	}
	return c.cs.CoreV1().Pods(ns).GetLogs(pod, opts).Stream(ctx)
}

// Events for the object with the given UID, newest first.
func (c *Client) Events(ctx context.Context, ns, uid string) ([]Event, error) {
	list, err := c.cs.CoreV1().Events(ns).List(ctx, metav1.ListOptions{
		FieldSelector: "involvedObject.uid=" + uid,
	})
	if err != nil {
		return nil, err
	}
	items := list.Items
	sort.Slice(items, func(i, j int) bool {
		return eventTime(items[i]).After(eventTime(items[j]))
	})
	out := make([]Event, 0, len(items))
	for i := range items {
		e := &items[i]
		out = append(out, Event{
			Type:    e.Type,
			Reason:  e.Reason,
			Message: e.Message,
			Count:   e.Count,
			Age:     ageSince(eventTime(*e)),
			Source:  e.Source.Component,
		})
	}
	return out, nil
}

func eventTime(e corev1.Event) time.Time {
	if e.Series != nil && !e.Series.LastObservedTime.IsZero() {
		return e.Series.LastObservedTime.Time
	}
	if !e.LastTimestamp.IsZero() {
		return e.LastTimestamp.Time
	}
	return e.CreationTimestamp.Time
}

func ageSince(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	d := max(time.Since(t), 0)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours())/24)
	}
}
