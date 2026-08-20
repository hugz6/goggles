package domain

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"g5s/internal/acquire"
)

// ownerEdges derives edges from ownerReferences, skipping owners out of scope
// (orphans keep the node, just no edge).
func ownerEdges(o *acquire.Objects, known map[string]struct{}) []Edge {
	var edges []Edge

	add := func(childUID string, owners []metav1.OwnerReference) {
		for _, ref := range owners {
			if _, present := known[string(ref.UID)]; present {
				edges = append(edges, Edge{From: string(ref.UID), To: childUID, Kind: EdgeOwns})
			}
		}
	}

	for i := range o.ReplicaSets {
		add(string(o.ReplicaSets[i].UID), o.ReplicaSets[i].OwnerReferences)
	}
	for i := range o.Pods {
		add(string(o.Pods[i].UID), o.Pods[i].OwnerReferences)
	}
	for i := range o.CustomResources {
		add(string(o.CustomResources[i].UID), o.CustomResources[i].OwnerReferences)
	}

	return edges
}
