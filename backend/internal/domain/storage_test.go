package domain

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"

	"g5s/internal/acquire"
)

func TestMountsEdges(t *testing.T) {
	o := &acquire.Objects{
		Pods: []corev1.Pod{{
			ObjectMeta: metav1.ObjectMeta{UID: "pod", Namespace: "a"},
			Spec: corev1.PodSpec{Volumes: []corev1.Volume{
				{VolumeSource: corev1.VolumeSource{PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "data"}}},
				{VolumeSource: corev1.VolumeSource{PersistentVolumeClaim: &corev1.PersistentVolumeClaimVolumeSource{ClaimName: "absent"}}},
				{VolumeSource: corev1.VolumeSource{}}, // non-PVC volume: ignored
			}},
		}},
		PersistentVolumeClaims: []corev1.PersistentVolumeClaim{
			{ObjectMeta: metav1.ObjectMeta{Name: "data", Namespace: "a", UID: "pvc"}},
			{ObjectMeta: metav1.ObjectMeta{Name: "data", Namespace: "b", UID: "other"}}, // other ns
		},
	}
	edges := mountsEdges(o)
	if len(edges) != 1 {
		t.Fatalf("want 1 mounts edge, got %d: %+v", len(edges), edges)
	}
	if edges[0].From != "pod" || edges[0].To != "pvc" || edges[0].Kind != EdgeMounts {
		t.Errorf("unexpected edge: %+v", edges[0])
	}
}
