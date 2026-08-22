package domain

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func findSection(secs []DetailSection, title string) ([][2]string, bool) {
	for _, s := range secs {
		if s.Title == title {
			return s.Rows, true
		}
	}
	return nil, false
}

func rowVal(rows [][2]string, key string) (string, bool) {
	for _, r := range rows {
		if r[0] == key {
			return r[1], true
		}
	}
	return "", false
}

func TestPodDetail(t *testing.T) {
	p := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "shop", UID: "uid-web", Labels: map[string]string{"app": "web"}},
		Spec: corev1.PodSpec{
			NodeName: "node-1",
			Containers: []corev1.Container{{
				Name:  "app",
				Image: "img:1",
				Ports: []corev1.ContainerPort{{ContainerPort: 8080, Protocol: corev1.ProtocolTCP}},
			}},
		},
		Status: corev1.PodStatus{
			Phase: corev1.PodRunning,
			PodIP: "10.0.0.5",
			ContainerStatuses: []corev1.ContainerStatus{{
				Name: "app", Ready: true, RestartCount: 3,
				State: corev1.ContainerState{Running: &corev1.ContainerStateRunning{}},
			}},
		},
	}
	secs := podDetail(p, nil)

	status, ok := findSection(secs, "status")
	if !ok {
		t.Fatal("missing status section")
	}
	if v, _ := rowVal(status, "phase"); v != "Running" {
		t.Errorf("phase: want Running, got %q", v)
	}
	if v, _ := rowVal(status, "podIP"); v != "10.0.0.5" {
		t.Errorf("podIP: want 10.0.0.5, got %q", v)
	}
	if v, _ := rowVal(status, "restarts"); v != "3" {
		t.Errorf("total restarts: want 3, got %q", v)
	}

	cont, ok := findSection(secs, "container · app")
	if !ok {
		t.Fatal("missing container · app section")
	}
	if v, _ := rowVal(cont, "ready"); v != "yes" {
		t.Errorf("ready: want yes, got %q", v)
	}
	if v, _ := rowVal(cont, "state"); v != "running" {
		t.Errorf("state: want running, got %q", v)
	}
	if v, _ := rowVal(cont, "ports"); v != "8080/TCP" {
		t.Errorf("ports: want 8080/TCP, got %q", v)
	}

	if _, ok := findSection(secs, "labels"); !ok {
		t.Error("missing labels section")
	}
}

func TestServiceDetailPorts(t *testing.T) {
	svc := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "shop", UID: "uid-svc"},
		Spec: corev1.ServiceSpec{
			Type:      corev1.ServiceTypeClusterIP,
			ClusterIP: "10.96.0.1",
			Ports:     []corev1.ServicePort{{Name: "http", Port: 80, Protocol: corev1.ProtocolTCP}},
			Selector:  map[string]string{"app": "web"},
		},
	}
	secs := serviceDetail(svc)

	meta, _ := findSection(secs, "metadata")
	if v, _ := rowVal(meta, "type"); v != "ClusterIP" {
		t.Errorf("type: want ClusterIP, got %q", v)
	}
	ports, ok := findSection(secs, "ports")
	if !ok {
		t.Fatal("missing ports section")
	}
	if v, _ := rowVal(ports, "http"); v != "80 -> 80/TCP" {
		t.Errorf("http port badly formatted: %q", v)
	}
	if _, ok := findSection(secs, "selector"); !ok {
		t.Error("missing selector section")
	}
}
