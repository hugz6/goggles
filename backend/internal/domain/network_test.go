package domain

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"g5s/internal/acquire"
)

func countKind(edges []Edge, kind EdgeKind) int {
	n := 0
	for _, e := range edges {
		if e.Kind == kind {
			n++
		}
	}
	return n
}

func TestServesEdges(t *testing.T) {
	o := &acquire.Objects{
		Services: []corev1.Service{{
			ObjectMeta: metav1.ObjectMeta{Name: "web", Namespace: "a", UID: "svc"},
			Spec:       corev1.ServiceSpec{Selector: map[string]string{"app": "web"}},
		}},
		Pods: []corev1.Pod{
			{ObjectMeta: metav1.ObjectMeta{UID: "p1", Namespace: "a", Labels: map[string]string{"app": "web"}}},
			{ObjectMeta: metav1.ObjectMeta{UID: "p2", Namespace: "a", Labels: map[string]string{"app": "db"}}},  // other app
			{ObjectMeta: metav1.ObjectMeta{UID: "p3", Namespace: "b", Labels: map[string]string{"app": "web"}}}, // other ns
		},
	}
	edges := servesEdges(o)
	if countKind(edges, EdgeServes) != 1 {
		t.Fatalf("want 1 serves edge, got %d: %+v", countKind(edges, EdgeServes), edges)
	}
	if edges[0].From != "svc" || edges[0].To != "p1" {
		t.Errorf("unexpected edge: %+v", edges[0])
	}
}

func TestAllowedEdges(t *testing.T) {
	o := &acquire.Objects{
		Pods: []corev1.Pod{
			{ObjectMeta: metav1.ObjectMeta{UID: "api", Namespace: "a", Labels: map[string]string{"app": "api"}}},
			{ObjectMeta: metav1.ObjectMeta{UID: "web", Namespace: "a", Labels: map[string]string{"app": "web"}}},
		},
		NetworkPolicies: []networkingv1.NetworkPolicy{{
			ObjectMeta: metav1.ObjectMeta{Namespace: "a", UID: "np"},
			Spec: networkingv1.NetworkPolicySpec{
				PodSelector: metav1.LabelSelector{MatchLabels: map[string]string{"app": "api"}},
				Ingress: []networkingv1.NetworkPolicyIngressRule{{
					From: []networkingv1.NetworkPolicyPeer{{
						PodSelector: &metav1.LabelSelector{MatchLabels: map[string]string{"app": "web"}},
					}},
				}},
			},
		}},
	}
	edges := allowedEdges(o)
	if countKind(edges, EdgeAllowed) != 1 {
		t.Fatalf("want 1 allowed edge, got %d", countKind(edges, EdgeAllowed))
	}
	if edges[0].From != "web" || edges[0].To != "api" {
		t.Errorf("unexpected edge: %+v", edges[0])
	}
}
