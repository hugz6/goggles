package domain

import "g5s/internal/acquire"

const EdgeMounts EdgeKind = "mounts" // a Pod mounts a PVC (volume)

// mountsEdges links each pod to the PVCs it mounts, via
// spec.volumes[].persistentVolumeClaim.claimName (a PVC name in the same namespace).
func mountsEdges(o *acquire.Objects) []Edge {
	pvcUID := make(map[string]string, len(o.PersistentVolumeClaims))
	for i := range o.PersistentVolumeClaims {
		pvc := &o.PersistentVolumeClaims[i]
		pvcUID[pvc.Namespace+"/"+pvc.Name] = string(pvc.UID)
	}

	var edges []Edge
	for i := range o.Pods {
		pod := &o.Pods[i]
		for _, v := range pod.Spec.Volumes {
			if v.PersistentVolumeClaim == nil {
				continue
			}
			if uid, ok := pvcUID[pod.Namespace+"/"+v.PersistentVolumeClaim.ClaimName]; ok {
				edges = append(edges, Edge{From: string(pod.UID), To: uid, Kind: EdgeMounts})
			}
		}
	}
	return edges
}
