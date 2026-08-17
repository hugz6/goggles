// Package acquire provides raw Kubernetes objects, from a snapshot file or a
// live cluster, both into the same Objects type.
package acquire

import (
	"encoding/json"
	"fmt"
	"os"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkingv1 "k8s.io/api/networking/v1"
	storagev1 "k8s.io/api/storage/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsv1beta1 "k8s.io/metrics/pkg/apis/metrics/v1beta1"
)

// GenericObject is a CRD instance: identity and ownership only, spec undecoded.
type GenericObject struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata"`
}

// Objects groups raw objects by type; JSON tags define the snapshot format.
type Objects struct {
	Namespaces             []corev1.Namespace             `json:"namespaces,omitempty"`
	Nodes                  []corev1.Node                  `json:"nodes,omitempty"`
	Deployments            []appsv1.Deployment            `json:"deployments,omitempty"`
	ReplicaSets            []appsv1.ReplicaSet            `json:"replicaSets,omitempty"`
	StatefulSets           []appsv1.StatefulSet           `json:"statefulSets,omitempty"`
	DaemonSets             []appsv1.DaemonSet             `json:"daemonSets,omitempty"`
	Jobs                   []batchv1.Job                  `json:"jobs,omitempty"`
	Pods                   []corev1.Pod                   `json:"pods,omitempty"`
	Services               []corev1.Service               `json:"services,omitempty"`
	Ingresses              []networkingv1.Ingress         `json:"ingresses,omitempty"`
	PersistentVolumeClaims []corev1.PersistentVolumeClaim `json:"persistentVolumeClaims,omitempty"`
	PersistentVolumes      []corev1.PersistentVolume      `json:"persistentVolumes,omitempty"`
	StorageClasses         []storagev1.StorageClass       `json:"storageClasses,omitempty"`
	ConfigMaps             []corev1.ConfigMap             `json:"configMaps,omitempty"`
	Secrets                []corev1.Secret                `json:"secrets,omitempty"`
	NetworkPolicies        []networkingv1.NetworkPolicy   `json:"networkPolicies,omitempty"`
	EndpointSlices         []discoveryv1.EndpointSlice    `json:"endpointSlices,omitempty"`
	CustomResources        []GenericObject                `json:"customResources,omitempty"`
	PodMetrics             []metricsv1beta1.PodMetrics    `json:"podMetrics,omitempty"`
}

func LoadSnapshot(path string) (*Objects, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading snapshot %q: %w", path, err)
	}
	var objs Objects
	if err := json.Unmarshal(data, &objs); err != nil {
		return nil, fmt.Errorf("decoding snapshot %q: %w", path, err)
	}
	return &objs, nil
}

// WriteSnapshot writes objs in the format LoadSnapshot reads back.
func WriteSnapshot(path string, objs *Objects) error {
	data, err := json.MarshalIndent(objs, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding snapshot: %w", err)
	}
	if err := os.WriteFile(path, data, 0o644); err != nil {
		return fmt.Errorf("writing snapshot %q: %w", path, err)
	}
	return nil
}
