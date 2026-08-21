package domain

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"

	"g5s/internal/acquire"
)

func TestPodMetricsAggregated(t *testing.T) {
	o := &acquire.Objects{
		Pods: []corev1.Pod{{
			ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "a", UID: "p1"},
		}},
		PodMetrics: []metricsv1beta1.PodMetrics{{
			ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "a"},
			Containers: []metricsv1beta1.ContainerMetrics{
				{Usage: corev1.ResourceList{
					corev1.ResourceCPU:    *resource.NewMilliQuantity(100, resource.DecimalSI),
					corev1.ResourceMemory: *resource.NewQuantity(64*1024*1024, resource.BinarySI),
				}},
				{Usage: corev1.ResourceList{
					corev1.ResourceCPU:    *resource.NewMilliQuantity(50, resource.DecimalSI),
					corev1.ResourceMemory: *resource.NewQuantity(32*1024*1024, resource.BinarySI),
				}},
			},
		}},
	}

	g := BuildGraph(o)
	var pod *Node
	for i := range g.Nodes {
		if g.Nodes[i].ID == "p1" {
			pod = &g.Nodes[i]
		}
	}
	if pod == nil {
		t.Fatal("pod missing from model")
	}
	if pod.CPUMillis != 150 {
		t.Errorf("CPU: want 150m, got %d", pod.CPUMillis)
	}
	if pod.MemBytes != 96*1024*1024 {
		t.Errorf("memory: want 96Mi, got %d", pod.MemBytes)
	}
}

func TestNoMetrics(t *testing.T) {
	o := &acquire.Objects{
		Pods: []corev1.Pod{{ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "a", UID: "p1"}}},
	}
	g := BuildGraph(o)
	if g.Nodes[0].CPUMillis != 0 || g.Nodes[0].MemBytes != 0 {
		t.Error("without metrics-server, metrics must stay zero")
	}
}
