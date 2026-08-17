package acquire

import (
	"path/filepath"
	"reflect"
	"testing"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestSnapshotRoundTrip(t *testing.T) {
	orig := &Objects{
		Pods: []corev1.Pod{
			{
				TypeMeta:   metav1.TypeMeta{APIVersion: "v1", Kind: "Pod"},
				ObjectMeta: metav1.ObjectMeta{Name: "p", Namespace: "ns", UID: "u1"},
				Spec: corev1.PodSpec{
					NodeName:   "node-1",
					Containers: []corev1.Container{{Name: "c", Image: "img:1"}},
				},
			},
		},
		CustomResources: []GenericObject{
			{
				TypeMeta:   metav1.TypeMeta{APIVersion: "acme.example.com/v1", Kind: "Cache"},
				ObjectMeta: metav1.ObjectMeta{Name: "cache", UID: "u2"},
			},
		},
	}

	path := filepath.Join(t.TempDir(), "snap.json")
	if err := WriteSnapshot(path, orig); err != nil {
		t.Fatalf("WriteSnapshot: %v", err)
	}
	got, err := LoadSnapshot(path)
	if err != nil {
		t.Fatalf("LoadSnapshot: %v", err)
	}

	if !reflect.DeepEqual(orig, got) {
		t.Errorf("round-trip diverged:\norig=%+v\n got=%+v", orig, got)
	}
}
