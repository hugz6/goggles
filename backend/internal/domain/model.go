// Package domain builds the neutral model (nodes/edges) from raw Kubernetes
// objects. Pure, no I/O. Kubernetes vocabulary stops here.
package domain

import metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

// NodeKind is a node's kind. For a custom resource it is the resource's real
// kind, with Node.Custom set to true.
type NodeKind string

const (
	KindPod         NodeKind = "Pod"
	KindDeployment  NodeKind = "Deployment"
	KindReplicaSet  NodeKind = "ReplicaSet"
	KindStatefulSet NodeKind = "StatefulSet"
	KindDaemonSet   NodeKind = "DaemonSet"
	KindJob         NodeKind = "Job"
	KindService     NodeKind = "Service"
	KindIngress     NodeKind = "Ingress"
	KindPVC         NodeKind = "PersistentVolumeClaim"
)

type EdgeKind string

const (
	EdgeOwns EdgeKind = "owns"
)

type Health string

const (
	HealthOK      Health = "ok"
	HealthWarning Health = "warning" // functional but degraded: Pending, not ready, restarts
	HealthError   Health = "error"   // failing: CrashLoopBackOff, Failed, image unavailable
)

// DetailSection is a "describe" block. AccentKey highlights the key column.
type DetailSection struct {
	Title     string      `json:"title"`
	Rows      [][2]string `json:"rows"`
	AccentKey bool        `json:"accentKey,omitempty"`
}

type Container struct {
	Name  string `json:"name"`
	Image string `json:"image"`
}

type Node struct {
	ID        string            `json:"id"` // Kubernetes UID: stable identity across refreshes
	Kind      NodeKind          `json:"kind"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace,omitempty"`
	Labels    map[string]string `json:"labels,omitempty"`
	Custom    bool              `json:"custom,omitempty"`

	// Pod attributes; empty for other kinds.
	Containers []Container `json:"containers,omitempty"`
	NodeName   string      `json:"nodeName,omitempty"`
	Health     Health      `json:"health,omitempty"`

	// Usage metrics when metrics-server is available; 0 otherwise.
	CPUMillis int64 `json:"cpuMillis,omitempty"`
	MemBytes  int64 `json:"memBytes,omitempty"`

	// Sum of container limits; 0 if any container has no limit set (undefined total).
	CPULimitMillis int64 `json:"cpuLimitMillis,omitempty"`
	MemLimitBytes  int64 `json:"memLimitBytes,omitempty"`

	Detail []DetailSection `json:"detail,omitempty"`
}

type Edge struct {
	From string   `json:"from"`
	To   string   `json:"to"`
	Kind EdgeKind `json:"kind"`
}

type Graph struct {
	Nodes []Node `json:"nodes"`
	Edges []Edge `json:"edges"`
}

func baseNode(meta metav1.ObjectMeta, kind NodeKind) Node {
	return Node{
		ID:        string(meta.UID),
		Kind:      kind,
		Name:      meta.Name,
		Namespace: meta.Namespace,
		Labels:    meta.Labels,
	}
}
