package acquire

import (
	"context"
	"fmt"
	"sort"

	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	discoveryv1 "k8s.io/api/discovery/v1"
	networkingv1 "k8s.io/api/networking/v1"
	storagev1 "k8s.io/api/storage/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

// clientConfig follows kubectl's loading rules: explicit path, else
// $KUBECONFIG, else ~/.kube/config.
func clientConfig(kubeconfigPath, contextName string) clientcmd.ClientConfig {
	rules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		rules.ExplicitPath = kubeconfigPath
	}
	overrides := &clientcmd.ConfigOverrides{}
	if contextName != "" {
		overrides.CurrentContext = contextName
	}
	return clientcmd.NewNonInteractiveDeferredLoadingClientConfig(rules, overrides)
}

// ListContexts returns sorted context names and the current one.
func ListContexts(kubeconfigPath string) (names []string, current string, err error) {
	raw, err := clientConfig(kubeconfigPath, "").RawConfig()
	if err != nil {
		return nil, "", fmt.Errorf("reading kubeconfig: %w", err)
	}
	for name := range raw.Contexts {
		names = append(names, name)
	}
	sort.Strings(names)
	return names, raw.CurrentContext, nil
}

// RestConfig lets other layers (the live client) reuse this resolution.
func RestConfig(kubeconfigPath, contextName string) (*rest.Config, error) {
	cfg, err := clientConfig(kubeconfigPath, contextName).ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("resolving kubeconfig: %w", err)
	}
	return cfg, nil
}

// Degraded records resource types that couldn't be loaded (RBAC), so the
// caller can skip them instead of failing outright.
type Degraded struct {
	Unloaded map[string]string // resource type -> reason
}

func newDegraded() *Degraded { return &Degraded{Unloaded: map[string]string{}} }

func (d *Degraded) mark(resource string, err error) {
	d.Unloaded[resource] = err.Error()
}

// LoadCluster reads a live cluster into the same Objects shape as a snapshot
// file. RBAC errors per resource type are non-fatal (marked unloaded); other
// errors abort.
func LoadCluster(kubeconfigPath, contextName string) (*Objects, *Degraded, error) {
	config, err := RestConfig(kubeconfigPath, contextName)
	if err != nil {
		return nil, nil, err
	}
	cs, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, nil, fmt.Errorf("creating Kubernetes client: %w", err)
	}

	ctx := context.Background()
	o := &Objects{}
	deg := newDegraded()
	all := metav1.ListOptions{}
	ns := metav1.NamespaceAll

	err = firstErr(
		collect(&o.Namespaces, deg, "namespaces", func() ([]corev1.Namespace, error) {
			l, e := cs.CoreV1().Namespaces().List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.Nodes, deg, "nodes", func() ([]corev1.Node, error) {
			l, e := cs.CoreV1().Nodes().List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.Deployments, deg, "deployments", func() ([]appsv1.Deployment, error) {
			l, e := cs.AppsV1().Deployments(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.ReplicaSets, deg, "replicaSets", func() ([]appsv1.ReplicaSet, error) {
			l, e := cs.AppsV1().ReplicaSets(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.StatefulSets, deg, "statefulSets", func() ([]appsv1.StatefulSet, error) {
			l, e := cs.AppsV1().StatefulSets(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.DaemonSets, deg, "daemonSets", func() ([]appsv1.DaemonSet, error) {
			l, e := cs.AppsV1().DaemonSets(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.Jobs, deg, "jobs", func() ([]batchv1.Job, error) {
			l, e := cs.BatchV1().Jobs(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.Pods, deg, "pods", func() ([]corev1.Pod, error) {
			l, e := cs.CoreV1().Pods(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.Services, deg, "services", func() ([]corev1.Service, error) {
			l, e := cs.CoreV1().Services(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.Ingresses, deg, "ingresses", func() ([]networkingv1.Ingress, error) {
			l, e := cs.NetworkingV1().Ingresses(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.PersistentVolumeClaims, deg, "persistentVolumeClaims", func() ([]corev1.PersistentVolumeClaim, error) {
			l, e := cs.CoreV1().PersistentVolumeClaims(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.PersistentVolumes, deg, "persistentVolumes", func() ([]corev1.PersistentVolume, error) {
			l, e := cs.CoreV1().PersistentVolumes().List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.StorageClasses, deg, "storageClasses", func() ([]storagev1.StorageClass, error) {
			l, e := cs.StorageV1().StorageClasses().List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.NetworkPolicies, deg, "networkPolicies", func() ([]networkingv1.NetworkPolicy, error) {
			l, e := cs.NetworkingV1().NetworkPolicies(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
		collect(&o.EndpointSlices, deg, "endpointSlices", func() ([]discoveryv1.EndpointSlice, error) {
			l, e := cs.DiscoveryV1().EndpointSlices(ns).List(ctx, all)
			if e != nil {
				return nil, e
			}
			return l.Items, nil
		}),
	)
	if err != nil {
		return nil, nil, err
	}

	loadMetrics(config, o, deg) // optional: missing metrics-server is non-fatal

	return o, deg, nil
}

func loadMetrics(config *rest.Config, o *Objects, deg *Degraded) {
	mc, err := metricsclient.NewForConfig(config)
	if err != nil {
		deg.mark("podMetrics", err)
		return
	}
	list, err := mc.MetricsV1beta1().PodMetricses(metav1.NamespaceAll).List(context.Background(), metav1.ListOptions{})
	if err != nil {
		deg.mark("podMetrics", err)
		return
	}
	o.PodMetrics = list.Items
}

// collect lists into dst; Forbidden/NotFound mark it unloaded instead of failing.
func collect[T any](dst *[]T, deg *Degraded, resource string, list func() ([]T, error)) error {
	got, err := list()
	if err != nil {
		if apierrors.IsForbidden(err) || apierrors.IsNotFound(err) {
			deg.mark(resource, err)
			return nil
		}
		return fmt.Errorf("listing %s: %w", resource, err)
	}
	*dst = got
	return nil
}

// firstErr returns the first non-nil error, in arg order.
func firstErr(errs ...error) error {
	for _, e := range errs {
		if e != nil {
			return e
		}
	}
	return nil
}
