package domain

import (
	"testing"

	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"g5s/internal/acquire"
)

func hasEdge(edges []Edge, from, to string) bool {
	for _, e := range edges {
		if e.From == from && e.To == to && e.Kind == EdgeOwns {
			return true
		}
	}
	return false
}

func findNode(nodes []Node, id string) (Node, bool) {
	for _, n := range nodes {
		if n.ID == id {
			return n, true
		}
	}
	return Node{}, false
}

func TestOwnerEdges(t *testing.T) {
	objs := &acquire.Objects{
		Deployments: []appsv1.Deployment{
			{ObjectMeta: metav1.ObjectMeta{Name: "web", UID: "uid-deploy"}},
		},
		ReplicaSets: []appsv1.ReplicaSet{
			{ObjectMeta: metav1.ObjectMeta{Name: "web-rs", UID: "uid-rs",
				OwnerReferences: []metav1.OwnerReference{{Kind: "Deployment", Name: "web", UID: "uid-deploy"}}}},
		},
		Pods: []corev1.Pod{
			{ObjectMeta: metav1.ObjectMeta{Name: "web-pod", UID: "uid-pod",
				OwnerReferences: []metav1.OwnerReference{{Kind: "ReplicaSet", Name: "web-rs", UID: "uid-rs"}}}},
			{ObjectMeta: metav1.ObjectMeta{Name: "orphan", UID: "uid-orphan",
				OwnerReferences: []metav1.OwnerReference{{Kind: "ReplicaSet", Name: "gone", UID: "uid-missing"}}}},
		},
	}

	g := BuildGraph(objs)

	if !hasEdge(g.Edges, "uid-deploy", "uid-rs") {
		t.Error("missing Deployment->ReplicaSet edge")
	}
	if !hasEdge(g.Edges, "uid-rs", "uid-pod") {
		t.Error("missing ReplicaSet->Pod edge")
	}
	for _, e := range g.Edges {
		if e.To == "uid-orphan" {
			t.Errorf("unexpected edge to orphan: %+v", e)
		}
	}
	if _, ok := findNode(g.Nodes, "uid-orphan"); !ok {
		t.Error("orphan pod must remain present as a node")
	}
}

func TestClassification(t *testing.T) {
	objs := &acquire.Objects{
		Pods: []corev1.Pod{
			{ObjectMeta: metav1.ObjectMeta{Name: "p", UID: "uid-p"},
				Spec: corev1.PodSpec{NodeName: "node-1", Containers: []corev1.Container{{Name: "c", Image: "img:1"}}}},
		},
		CustomResources: []acquire.GenericObject{
			{TypeMeta: metav1.TypeMeta{APIVersion: "acme.example.com/v1", Kind: "Cache"},
				ObjectMeta: metav1.ObjectMeta{Name: "cache", UID: "uid-c"}},
		},
	}

	g := BuildGraph(objs)

	pod, ok := findNode(g.Nodes, "uid-p")
	if !ok {
		t.Fatal("missing pod node")
	}
	if pod.NodeName != "node-1" {
		t.Errorf("nodeName: want node-1, got %q", pod.NodeName)
	}
	if len(pod.Containers) != 1 || pod.Containers[0].Name != "c" {
		t.Errorf("containers badly mapped: %+v", pod.Containers)
	}

	cr, ok := findNode(g.Nodes, "uid-c")
	if !ok {
		t.Fatal("missing custom resource node")
	}
	if !cr.Custom {
		t.Error("a custom resource must be marked Custom")
	}
	if cr.Kind != "Cache" {
		t.Errorf("the CRD's real kind must be kept, got %q", cr.Kind)
	}
}

func TestPodLimits(t *testing.T) {
	resources := func(cpu, mem string) corev1.ResourceRequirements {
		limits := corev1.ResourceList{}
		if cpu != "" {
			limits[corev1.ResourceCPU] = resource.MustParse(cpu)
		}
		if mem != "" {
			limits[corev1.ResourceMemory] = resource.MustParse(mem)
		}
		return corev1.ResourceRequirements{Limits: limits}
	}

	cases := []struct {
		name          string
		containers    []corev1.Container
		wantCPUMillis int64
		wantMemBytes  int64
	}{
		{
			name: "all containers bounded: totals summed",
			containers: []corev1.Container{
				{Name: "a", Resources: resources("250m", "128Mi")},
				{Name: "b", Resources: resources("250m", "128Mi")},
			},
			wantCPUMillis: 500,
			wantMemBytes:  256 * 1024 * 1024,
		},
		{
			name: "one container missing the CPU limit: total CPU undefined",
			containers: []corev1.Container{
				{Name: "a", Resources: resources("250m", "128Mi")},
				{Name: "b", Resources: resources("", "128Mi")},
			},
			wantCPUMillis: 0,
			wantMemBytes:  256 * 1024 * 1024,
		},
		{
			name:          "no containers: zero",
			containers:    nil,
			wantCPUMillis: 0,
			wantMemBytes:  0,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			p := &corev1.Pod{Spec: corev1.PodSpec{Containers: c.containers}}
			cpuMillis, memBytes := podLimits(p)
			if cpuMillis != c.wantCPUMillis {
				t.Errorf("cpuMillis: want %d, got %d", c.wantCPUMillis, cpuMillis)
			}
			if memBytes != c.wantMemBytes {
				t.Errorf("memBytes: want %d, got %d", c.wantMemBytes, memBytes)
			}
		})
	}
}
