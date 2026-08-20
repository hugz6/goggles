package domain

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"g5s/internal/acquire"
)

const (
	EdgeServes  EdgeKind = "serves"  // Service serves a Pod (selector)
	EdgeAllowed EdgeKind = "allowed" // NetworkPolicy allows Pod -> Pod
)

// networkEdges: "serves" (Service->Pod) and "allowed" (NetworkPolicy Pod->Pod).
// Only matchLabels selectors and podSelector ingress peers, same namespace;
// namespaceSelector, ipBlock, ports, matchExpressions, egress unhandled.
func networkEdges(o *acquire.Objects) []Edge {
	var edges []Edge
	edges = append(edges, servesEdges(o)...)
	edges = append(edges, allowedEdges(o)...)
	return edges
}

func servesEdges(o *acquire.Objects) []Edge {
	var edges []Edge
	for i := range o.Services {
		svc := &o.Services[i]
		sel := svc.Spec.Selector
		if len(sel) == 0 {
			continue // selector-less Service (e.g. ExternalName): no derivable target
		}
		for j := range o.Pods {
			pod := &o.Pods[j]
			if pod.Namespace == svc.Namespace && labelsContain(pod.Labels, sel) {
				edges = append(edges, Edge{From: string(svc.UID), To: string(pod.UID), Kind: EdgeServes})
			}
		}
	}
	return edges
}

func allowedEdges(o *acquire.Objects) []Edge {
	var edges []Edge
	for i := range o.NetworkPolicies {
		np := &o.NetworkPolicies[i]
		targets := podsMatching(o, np.Namespace, &np.Spec.PodSelector)
		for _, rule := range np.Spec.Ingress {
			for _, peer := range rule.From {
				if peer.PodSelector == nil {
					continue // ipBlock/namespaceSelector peers are out of scope
				}
				sources := podsMatching(o, np.Namespace, peer.PodSelector)
				for _, src := range sources {
					for _, dst := range targets {
						if src != dst {
							edges = append(edges, Edge{From: src, To: dst, Kind: EdgeAllowed})
						}
					}
				}
			}
		}
	}
	return edges
}

// podsMatching: matchLabels only; empty selector matches all.
func podsMatching(o *acquire.Objects, namespace string, selector *metav1.LabelSelector) []string {
	var ids []string
	for i := range o.Pods {
		pod := &o.Pods[i]
		if pod.Namespace == namespace && labelsContain(pod.Labels, selector.MatchLabels) {
			ids = append(ids, string(pod.UID))
		}
	}
	return ids
}

func labelsContain(labels, want map[string]string) bool {
	for k, v := range want {
		if labels[k] != v {
			return false
		}
	}
	return true
}
